import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown, markdownToPlainText, safeHref } from "./lib/markdown.js";

describe("renderMarkdown: sanitisation", () => {
  const malicious = [
    "Intro with <b onclick=\"steal()\">bold</b> inline HTML.",
    "",
    "<script>alert('xss')</script>",
    "",
    '<img src="x" onerror="alert(1)">',
    "",
    "[click me](javascript:alert(1)) and [tabbed](java\tscript:alert(2)) and [data](data:text/html;base64,PHNjcmlwdD4=)",
    "",
    "[ref link][evil]",
    "",
    '![tracker](https://evil.example/pixel.png "t")',
    "",
    "[evil]: vbscript:msgbox(1)",
  ].join("\n");
  const html = renderMarkdown(malicious);

  test("emits no script, img or inline event handler markup", () => {
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<b[\s>]/i);
    assert.doesNotMatch(html, /<[^>]*\son\w+\s*=/i);
  });

  test("shows raw HTML as escaped, visible text", () => {
    assert.match(html, /&lt;script&gt;alert\(&#39;xss&#39;\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=&quot;x&quot; onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(html, /&lt;b onclick=&quot;steal\(\)&quot;&gt;bold&lt;\/b&gt;/);
  });

  test("drops javascript:, data: and vbscript: links but keeps their text", () => {
    assert.doesNotMatch(html, /href="(javascript|data|vbscript)/i);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /click me/);
    assert.match(html, /ref link/);
  });

  test("does not embed images; shows their alt text", () => {
    assert.match(html, /tracker/);
    assert.doesNotMatch(html, /evil\.example/);
  });
});

describe("renderMarkdown: formatting", () => {
  test("renders headings below the page's own h2, paragraphs, emphasis and code", () => {
    const html = renderMarkdown("# Title\n\nSome *em*, **strong** and `code`.\n\n## Sub");
    assert.match(html, /<h3>Title<\/h3>/);
    assert.match(html, /<h4>Sub<\/h4>/);
    assert.match(html, /<p>Some <em>em<\/em>, <strong>strong<\/strong> and <code>code<\/code>\.<\/p>/);
  });

  test("renders lists, blockquotes and fenced code with escaped content", () => {
    const html = renderMarkdown("- one\n- two\n\n1. a\n2. b\n\n> quoted\n\n```ts\nconst x = a < b;\n```");
    assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
    assert.match(html, /<ol>\n<li>a<\/li>/);
    assert.match(html, /<blockquote>\n<p>quoted<\/p>\n<\/blockquote>/);
    assert.match(html, /<pre class="markdown-code"><code class="language-ts">const x = a &lt; b;<\/code><\/pre>/);
  });

  test("external links open in a new tab with rel=noopener noreferrer", () => {
    const html = renderMarkdown("See [the spec](https://example.org/spec) or <https://example.org/x>.");
    assert.match(html, /<a href="https:\/\/example.org\/spec" target="_blank" rel="noopener noreferrer">the spec/);
    assert.match(html, /<a href="https:\/\/example.org\/x" target="_blank" rel="noopener noreferrer">/);
  });

  test("plain text keeps its meaning: paragraphs split on blank lines, text escaped", () => {
    const html = renderMarkdown("First paragraph, a & b.\nStill first.\n\nSecond paragraph.");
    assert.equal(html, "<p>First paragraph, a &amp; b.\nStill first.</p>\n<p>Second paragraph.</p>");
  });

  test("empty input renders nothing", () => {
    assert.equal(renderMarkdown("   "), "");
  });
});

describe("markdownToPlainText", () => {
  test("strips formatting markers and keeps link text", () => {
    assert.equal(
      markdownToPlainText("Fetch the standard `/service-info` endpoint, see **[docs](https://x.org)**."),
      "Fetch the standard /service-info endpoint, see docs.",
    );
  });

  test("leaves intraword underscores alone", () => {
    assert.equal(markdownToPlainText("query g_variants search"), "query g_variants search");
  });
});

describe("safeHref", () => {
  test("accepts http, https, mailto and fragments; rejects script-capable schemes", () => {
    assert.equal(safeHref("https://example.org/a"), "https://example.org/a");
    assert.equal(safeHref("mailto:a@example.org"), "mailto:a@example.org");
    assert.equal(safeHref("#section"), "#section");
    assert.equal(safeHref("javascript:alert(1)"), null);
    assert.equal(safeHref(" JaVaScRiPt:alert(1)"), null);
    assert.equal(safeHref("java\nscript:alert(1)"), null);
    assert.equal(safeHref("data:text/html,x"), null);
    assert.equal(safeHref("/relative/path"), null);
  });
});
