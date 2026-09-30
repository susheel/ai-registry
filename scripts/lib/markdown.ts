/**
 * Safe Markdown rendering for registry entry text (the entry-core
 * `description` field is documented as Markdown, and entries arrive through
 * public submissions).
 *
 * Parsing uses satteri's `markdownToMdast` (the Markdown engine Astro itself
 * ships with). Rendering is our own allowlist serialiser over the mdast tree
 * rather than a parse-then-sanitise pass over HTML: only the node types
 * handled below can ever produce markup, every text value and attribute is
 * escaped, and embedded raw HTML (`html` nodes) is emitted as escaped,
 * visible text, never as markup. Links keep only http, https and mailto URLs
 * (or same-page `#fragment` links); anything else, including `javascript:`,
 * `data:` and `vbscript:`, drops the link and keeps its text. Images are not
 * embedded (no third-party requests from submitted text); their alt text is
 * shown instead.
 */
import { markdownToMdast } from "satteri";

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  identifier?: string;
  label?: string | null;
  referenceType?: string;
  children?: MdNode[];
}

export interface RenderMarkdownOptions {
  /**
   * Added to every heading depth so an author's `#` sits below the page's
   * own section heading. Default 2 (`#` renders as `<h3>`). Clamped to h6.
   */
  headingOffset?: number;
}

const PARSE_FEATURES = { gfm: { footnotes: false }, frontmatter: false } as const;

function parse(source: string): MdNode {
  return markdownToMdast(source, { features: PARSE_FEATURES }) as unknown as MdNode;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Returns a normalised, safe href, or null when the URL must not be linked.
 * The WHATWG URL parser strips the tab/newline tricks (`java\tscript:`) that
 * defeat naive prefix checks, so the protocol test runs on its result.
 */
export function safeHref(raw: string | null | undefined, allowed: ReadonlySet<string> = SAFE_PROTOCOLS): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^#[\w\-.:%]*$/.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return allowed.has(parsed.protocol) ? parsed.href : null;
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const NEW_TAB_NOTE = '<span class="visually-hidden"> (opens in a new tab)</span>';

function collectDefinitions(node: MdNode, into: Map<string, MdNode>): Map<string, MdNode> {
  if (node.type === "definition" && node.identifier) {
    const key = node.identifier.toLowerCase();
    if (!into.has(key)) into.set(key, node);
  }
  for (const child of node.children ?? []) collectDefinitions(child, into);
  return into;
}

function plainText(node: MdNode): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "code":
    case "html":
      return node.value ?? "";
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "break":
      return "\n";
    default:
      return (node.children ?? []).map(plainText).join("");
  }
}

function renderNodes(nodes: MdNode[] | undefined, ctx: RenderContext): string {
  return (nodes ?? []).map((n) => renderNode(n, ctx)).join("");
}

interface RenderContext {
  definitions: Map<string, MdNode>;
  headingOffset: number;
  /** Whether list items are "tight" (paragraph wrappers dropped). */
  tight: boolean;
  /** Inside phrasing content (a paragraph, heading or table cell). */
  inline: boolean;
}

function renderLink(href: string | null, title: string | null | undefined, inner: string): string {
  if (!href) return inner;
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  if (isExternalHref(href)) {
    return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${inner}${NEW_TAB_NOTE}</a>`;
  }
  return `<a href="${escapeHtml(href)}"${titleAttr}>${inner}</a>`;
}

function renderNode(node: MdNode, ctx: RenderContext): string {
  switch (node.type) {
    case "root":
      return renderNodes(node.children, ctx);
    case "paragraph":
      return ctx.tight
        ? renderNodes(node.children, { ...ctx, inline: true })
        : `<p>${renderNodes(node.children, { ...ctx, inline: true })}</p>\n`;
    case "heading": {
      const level = Math.min(6, Math.max(1, (node.depth ?? 1) + ctx.headingOffset));
      return `<h${level}>${renderNodes(node.children, { ...ctx, tight: false, inline: true })}</h${level}>\n`;
    }
    case "text":
      return escapeHtml(node.value ?? "");
    case "emphasis":
      return `<em>${renderNodes(node.children, ctx)}</em>`;
    case "strong":
      return `<strong>${renderNodes(node.children, ctx)}</strong>`;
    case "delete":
      return `<del>${renderNodes(node.children, ctx)}</del>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value ?? "")}</code>`;
    case "break":
      return "<br />\n";
    case "thematicBreak":
      return "<hr />\n";
    case "code": {
      const lang = node.lang && /^[A-Za-z0-9_+-]{1,32}$/.test(node.lang) ? ` class="language-${node.lang}"` : "";
      return `<pre class="markdown-code"><code${lang}>${escapeHtml(node.value ?? "")}</code></pre>\n`;
    }
    case "blockquote":
      return `<blockquote>\n${renderNodes(node.children, { ...ctx, tight: false })}</blockquote>\n`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start =
        node.ordered && typeof node.start === "number" && Number.isInteger(node.start) && node.start !== 1
          ? ` start="${node.start}"`
          : "";
      // CommonMark: a list is loose when it, or any of its items, is spread.
      const isSpread = (n: MdNode) => (n as { spread?: boolean }).spread === true;
      const tight = !isSpread(node) && !(node.children ?? []).some(isSpread);
      const items = (node.children ?? []).map((item) => renderNode(item, { ...ctx, tight })).join("");
      return `<${tag}${start}>\n${items}</${tag}>\n`;
    }
    case "listItem": {
      const box =
        node.checked === true || node.checked === false
          ? `<input type="checkbox" disabled${node.checked ? " checked" : ""} /> `
          : "";
      const inner = (node.children ?? [])
        .map((c) => renderNode(c, { ...ctx, tight: ctx.tight && c.type === "paragraph" }))
        .join("");
      return `<li>${box}${inner}</li>\n`;
    }
    case "link":
      return renderLink(safeHref(node.url), node.title, renderNodes(node.children, ctx));
    case "linkReference": {
      const def = node.identifier ? ctx.definitions.get(node.identifier.toLowerCase()) : undefined;
      const inner = renderNodes(node.children, ctx);
      return def ? renderLink(safeHref(def.url), def.title, inner) : escapeHtml(plainText(node));
    }
    case "image":
    case "imageReference":
      return escapeHtml(node.alt ?? "");
    case "html": {
      // Raw HTML is never passed through: show it as literal text.
      const text = escapeHtml(node.value ?? "");
      return ctx.inline ? text : `<p>${text}</p>\n`;
    }
    case "table": {
      const rows = node.children ?? [];
      const cell = (tag: "th" | "td", c: MdNode) => `<${tag}>${renderNodes(c.children, { ...ctx, tight: true, inline: true })}</${tag}>`;
      const head = rows[0] ? `<thead><tr>${(rows[0].children ?? []).map((c) => cell("th", c)).join("")}</tr></thead>` : "";
      const body = rows
        .slice(1)
        .map((r) => `<tr>${(r.children ?? []).map((c) => cell("td", c)).join("")}</tr>`)
        .join("");
      return `<div class="markdown-table"><table>${head}<tbody>${body}</tbody></table></div>\n`;
    }
    case "definition":
    case "yaml":
    case "toml":
      return "";
    default:
      // Unknown node: keep its content as escaped text, never as markup.
      if (node.children) return renderNodes(node.children, ctx);
      return escapeHtml(node.value ?? "");
  }
}

/** Renders Markdown to sanitised HTML. Safe to inject with `set:html`. */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
  if (!source.trim()) return "";
  const tree = parse(source);
  const ctx: RenderContext = {
    definitions: collectDefinitions(tree, new Map()),
    headingOffset: options.headingOffset ?? 2,
    tight: false,
    inline: false,
  };
  return renderNode(tree, ctx).trim();
}

/**
 * Markdown to plain text, for listings, excerpts and meta descriptions:
 * formatting markers are dropped, link text is kept, block breaks become
 * single spaces and whitespace is collapsed.
 */
export function markdownToPlainText(source: string): string {
  if (!source.trim()) return "";
  const tree = parse(source);
  const blocks: string[] = [];
  const walk = (node: MdNode) => {
    if (["paragraph", "heading", "code", "html", "tableCell"].includes(node.type)) {
      blocks.push(plainText(node));
      return;
    }
    if (node.type === "definition") return;
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return blocks.join(" ").replace(/\s+/g, " ").trim();
}
