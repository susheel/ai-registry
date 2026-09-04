import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildIndex } from "./build-index.js";
import { buildAiCatalog } from "./build-ai-catalog.js";
import { buildMcpServerDocs } from "./build-mcp-server-docs.js";
import { buildMarketplace } from "./build-marketplace.js";
import { DATA_DIR_FOR_TYPE, ENTRY_TYPES } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_VALID_DIR = path.join(__dirname, "__fixtures__/valid");

let dataRoot: string;

before(() => {
  // A data/-shaped tree built from the committed valid fixtures, since
  // data/ itself is empty until Phase 6 seeds it.
  dataRoot = mkdtempSync(path.join(tmpdir(), "ai-registry-data-"));
  for (const type of ENTRY_TYPES) {
    const dir = path.join(dataRoot, DATA_DIR_FOR_TYPE[type]);
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(FIXTURES_VALID_DIR, `${type}.json`), path.join(dir, `${type}.json`));
  }
});

after(() => {
  rmSync(dataRoot, { recursive: true, force: true });
});

describe("build-index", () => {
  test("emits one summary per entry, grouped correctly by type", () => {
    const { index, perType } = buildIndex({ dataRoot });
    assert.equal(index.count, ENTRY_TYPES.length);
    for (const type of ENTRY_TYPES) {
      assert.equal(index.types[type], 1);
      assert.equal(perType[type].count, 1);
      assert.equal(perType[type].entries[0]?.type, type);
    }
  });

  test("a plugin summary carries its harnesses[] facet", () => {
    const { perType } = buildIndex({ dataRoot });
    const pluginEntry = perType.plugin.entries[0];
    assert.deepEqual(pluginEntry?.harnesses, ["claude-code"]);
  });

  test("a non-plugin summary carries no harnesses field", () => {
    const { perType } = buildIndex({ dataRoot });
    assert.equal(perType.model.entries[0]?.harnesses, undefined);
  });

  test("an mcp-server entry with no packages/remotes gets an empty install[] (nothing to derive)", () => {
    const { perType } = buildIndex({ dataRoot });
    assert.deepEqual(perType["mcp-server"].entries[0]?.install, []);
  });

  test("an mcp-server entry with a real package gets pre-derived install snippets embedded", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-registry-data-install-"));
    try {
      mkdirSync(path.join(dir, "mcp-servers"), { recursive: true });
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES_VALID_DIR, "mcp-server.json"), "utf-8"));
      fixture.server.packages = [{ registryType: "npm", identifier: "@ga4gh/trs-tools-mcp", version: "1.0.0" }];
      writeFileSync(path.join(dir, "mcp-servers", "mcp-server.json"), JSON.stringify(fixture));

      const { perType } = buildIndex({ dataRoot: dir });
      const install = perType["mcp-server"].entries[0]?.install;
      assert.ok(install && install.length > 0);
      const claudeCode = install.find((s) => s.client === "claude-code");
      assert.ok(claudeCode);
      assert.match(claudeCode!.configJson, /"@ga4gh\/trs-tools-mcp@1\.0\.0"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("build-ai-catalog", () => {
  test("emits one catalog item per entry with a GA4GH-namespaced _meta block", () => {
    const { catalog } = buildAiCatalog({ dataRoot });
    assert.equal(catalog.length, ENTRY_TYPES.length);
    for (const item of catalog) {
      assert.match(item.type, /^application\/vnd\.ga4gh\.ai-registry\.[a-z-]+\+json$/);
      assert.ok(item._meta?.["org.ga4gh/ai-registry"]);
    }
  });

  test("stripping _meta leaves a minimal but still useful catalog item", () => {
    const { catalog } = buildAiCatalog({ dataRoot });
    const first = catalog[0];
    assert.ok(first);
    const { _meta: _stripped, ...stripped } = first;
    assert.ok(stripped.id);
    assert.ok(stripped.name);
    assert.ok(stripped.type);
  });
});

describe("build-mcp-server-docs", () => {
  test("emits the embedded server document verbatim, _meta included", () => {
    const docs = buildMcpServerDocs({ dataRoot });
    assert.equal(docs.length, 1);
    const expectedServer = JSON.parse(readFileSync(path.join(FIXTURES_VALID_DIR, "mcp-server.json"), "utf-8")).server;
    assert.deepEqual(docs[0]?.server, expectedServer);
    assert.ok((docs[0]?.server as { _meta?: unknown })?._meta);
  });
});

describe("build-marketplace", () => {
  test("resolves a github.com repository into a github source object", () => {
    const manifest = buildMarketplace({ dataRoot });
    assert.equal(manifest.plugins.length, 1);
    assert.deepEqual(manifest.plugins[0]?.source, {
      source: "github",
      repo: "example-org/variant-review-plugin",
    });
  });

  test("uses the plugin's own manifest name, not the registry slug", () => {
    const manifest = buildMarketplace({ dataRoot });
    assert.equal(manifest.plugins[0]?.name, "variant-review-plugin");
  });

  test("a non-github repository falls back to a generic git source", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-registry-data-gitlab-"));
    try {
      mkdirSync(path.join(dir, "plugins"), { recursive: true });
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES_VALID_DIR, "plugin.json"), "utf-8"));
      fixture.repository = "https://gitlab.example.com/org/plugin.git";
      writeFileSync(path.join(dir, "plugins", "plugin.json"), JSON.stringify(fixture));
      const manifest = buildMarketplace({ dataRoot: dir });
      assert.deepEqual(manifest.plugins[0]?.source, {
        source: "git",
        url: "https://gitlab.example.com/org/plugin.git",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
