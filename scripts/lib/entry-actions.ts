/**
 * Derives the detail-page action menu (primary action plus drop-down links)
 * for a registry entry, from fields its schema already defines. Nothing is
 * invented: a link appears only when the entry carries a safe http(s) URL
 * for it.
 *
 * "View upstream" is the entry's own upstream description: the model card
 * for models (`model_card_uri`, the link the model schema calls the deep
 * dive), and `homepage` for every other type. The primary action is
 * "Install" when the page renders install information (MCP server and
 * plugin install tabs, or a model's `install_command`), and otherwise
 * "View upstream".
 */
import { safeHref } from "./markdown.js";

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

export type EntryTypeKey = "models" | "agents" | "skills" | "mcp-servers" | "plugins" | "bundles";

export interface EntryLink {
  /** Stable key, used for tests and data attributes. */
  id: string;
  label: string;
  href: string;
}

export interface EntryActions {
  primary: "install" | "upstream" | "none";
  /** Present when the page has install information to jump to. */
  install?: { targetId: string };
  upstream?: EntryLink;
  /** Further links, de-duplicated against upstream and each other. */
  links: EntryLink[];
}

type Data = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function webHref(value: unknown): string | null {
  return safeHref(str(value), WEB_PROTOCOLS);
}

/** Compares URLs loosely: case-insensitive host, no trailing slash or `.git`. */
function urlKey(href: string): string {
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\.git$/, "").replace(/\/+$/, "");
    return `${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return href;
  }
}

export function upstreamField(type: EntryTypeKey): string {
  return type === "models" ? "model_card_uri" : "homepage";
}

export function deriveEntryActions(type: EntryTypeKey, data: Data, opts: { hasInstallPanels?: boolean } = {}): EntryActions {
  let install: EntryActions["install"];
  if ((type === "mcp-servers" || type === "plugins") && opts.hasInstallPanels) install = { targetId: "install" };
  if (type === "models" && str(data.install_command)) install = { targetId: "model-install" };

  const upstreamHref = webHref(data[upstreamField(type)]);
  const upstream: EntryLink | undefined = upstreamHref
    ? { id: "upstream", label: "View upstream", href: upstreamHref }
    : undefined;

  const candidates: Array<[string, string, unknown]> = [
    ["homepage", "Homepage", data.homepage],
    ["repository", "Repository", data.repository],
  ];
  switch (type) {
    case "models":
      candidates.push(["access", "Model access", data.access_uri]);
      break;
    case "agents":
      candidates.push(["agent-info", "Agent-info endpoint", data.agent_info_uri]);
      candidates.push(["alignment-card", "Alignment card", data.alignment_card_uri]);
      break;
    case "skills": {
      const source = (data.source as { repository?: { url?: unknown } } | undefined)?.repository;
      candidates.push(["source", "Skill source", source?.url]);
      candidates.push(["evaluation", "Evaluation criteria", data.evaluation_criteria_uri]);
      break;
    }
    case "mcp-servers": {
      const server = (data.server as { websiteUrl?: unknown; repository?: { url?: unknown } } | undefined) ?? {};
      candidates.push(["documentation", "Documentation", server.websiteUrl]);
      candidates.push(["server-repository", "Server repository", server.repository?.url]);
      break;
    }
    case "plugins": {
      const plugin = (data.plugin as { homepage?: unknown } | undefined) ?? {};
      candidates.push(["documentation", "Documentation", plugin.homepage]);
      break;
    }
    case "bundles":
      candidates.push(["manifest", "Marketplace manifest", data.source_uri]);
      break;
  }
  if (data.license === "other") candidates.push(["licence", "Licence text", data.license_url]);

  const seen = new Set<string>(upstream ? [urlKey(upstream.href)] : []);
  const links: EntryLink[] = [];
  for (const [id, label, value] of candidates) {
    const href = webHref(value);
    if (!href) continue;
    const key = urlKey(href);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ id, label, href });
  }

  return {
    primary: install ? "install" : upstream ? "upstream" : "none",
    install,
    upstream,
    links,
  };
}
