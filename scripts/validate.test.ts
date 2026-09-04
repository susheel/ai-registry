import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { validateEntryOffline } from "./lib/validate-entry.js";
import { validateFiles, parseArgs, allResultsOk } from "./validate.js";
import { getVendorValidator } from "./lib/schemas.js";
import { checkAgentInfoUri, checkModelCardUri, type FetchImpl } from "./lib/fetch-checks.js";
import type { AnyEntry, EntryType } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "__fixtures__");

function loadFixture(relPath: string): AnyEntry {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, relPath), "utf-8")) as AnyEntry;
}

function jsonResponse(body: unknown, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "application/json" },
  });
}

function textResponse(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/markdown" },
  });
}

function fetchReturning(response: Response): FetchImpl {
  return (async () => response) as unknown as FetchImpl;
}

function fetchThrowing(message: string): FetchImpl {
  return (async () => {
    throw new Error(message);
  }) as unknown as FetchImpl;
}

// -- Valid fixtures: one per type, all offline checks pass -----------------

describe("valid fixtures pass every offline check", () => {
  const cases: Array<[EntryType, string]> = [
    ["model", "valid/model.json"],
    ["agent", "valid/agent.json"],
    ["skill", "valid/skill.json"],
    ["mcp-server", "valid/mcp-server.json"],
    ["plugin", "valid/plugin.json"],
  ];
  for (const [type, file] of cases) {
    test(`${type}: ${file}`, () => {
      const entry = loadFixture(file);
      const issues = validateEntryOffline(entry, type);
      assert.deepEqual(issues, []);
    });
  }
});

// -- Invalid fixtures: one per validation rule ------------------------------

describe("invalid fixtures are rejected, one per rule", () => {
  test("bad slug fails schema validation on id pattern", () => {
    const issues = validateEntryOffline(loadFixture("invalid/bad-slug.json"), "model");
    assert.ok(issues.some((i) => i.code === "schema" && i.path === "/id"));
  });

  test("licence not on the allow-list and not \"other\" fails", () => {
    const issues = validateEntryOffline(loadFixture("invalid/license-not-allowed.json"), "model");
    assert.ok(issues.some((i) => i.code === "license-not-allowed"));
  });

  test("licence \"other\" without license_url fails schema validation", () => {
    const issues = validateEntryOffline(loadFixture("invalid/license-other-without-url.json"), "model");
    assert.ok(issues.some((i) => i.code === "schema" && i.message.includes("license_url")));
  });

  test("missing a common-core required field fails schema validation", () => {
    const issues = validateEntryOffline(loadFixture("invalid/missing-required-field.json"), "model");
    assert.ok(issues.some((i) => i.code === "schema" && i.message.includes("summary")));
  });

  test("malformed safety_classification item fails schema validation", () => {
    const issues = validateEntryOffline(loadFixture("invalid/malformed-safety-classification.json"), "agent");
    assert.ok(issues.some((i) => i.code === "schema" && i.message.includes("source")));
  });

  test("embedded server failing the vendored server.schema.json fails schema validation", () => {
    const issues = validateEntryOffline(
      loadFixture("invalid/embedded-server-fails-vendor-schema.json"),
      "mcp-server",
    );
    assert.ok(issues.some((i) => i.code === "schema" && i.path?.startsWith("/server")));
  });

  test("embedded plugin failing the vendored plugin.schema.json fails schema validation", () => {
    const issues = validateEntryOffline(loadFixture("invalid/embedded-plugin-fails-vendor-schema.json"), "plugin");
    assert.ok(issues.some((i) => i.code === "schema" && i.path === "/plugin"));
  });

  test("mcp-server entry missing the common-core ga4gh_standards fails schema validation (D14)", () => {
    const issues = validateEntryOffline(loadFixture("invalid/mcp-server-missing-core-standards.json"), "mcp-server");
    assert.ok(issues.some((i) => i.code === "schema" && i.message.includes("ga4gh_standards")));
  });

  test("mcp-server _meta.ga4gh_standards not a subset of the core array fails the D14 cross-field rule", () => {
    const entry = loadFixture("invalid/mcp-server-standards-not-subset.json");
    // Schema-valid on its own; only the cross-field rule should fire.
    const schemaIssues = validateEntryOffline(entry, "mcp-server").filter((i) => i.code === "schema");
    assert.deepEqual(schemaIssues, []);
    const issues = validateEntryOffline(entry, "mcp-server");
    assert.ok(issues.some((i) => i.code === "ga4gh-standards-not-subset"));
  });

  test("category outside the closed per-type vocabulary fails", () => {
    const issues = validateEntryOffline(loadFixture("invalid/category-not-allowed.json"), "model");
    assert.ok(issues.some((i) => i.code === "category-not-allowed"));
  });
});

// -- Slug uniqueness across files (validateFiles, not the pure offline fn) --

describe("slug uniqueness within a type", () => {
  test("two entries of the same type sharing an id both fail", async () => {
    const dir = path.join(FIXTURES_DIR, "invalid/duplicate-slug");
    const results = await validateFiles(
      [path.join(dir, "model-a.json"), path.join(dir, "model-b.json")],
      { skipNetwork: true },
    );
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === "slug-duplicate"));
    }
  });
});

// -- D13: agent_info_uri GET/parse/cache-consistency checks -----------------

describe("D13 agent_info_uri validation", () => {
  const cachedSnapshot = {
    protocol_version: "0.5.0",
    agent_type: "variant-triage",
    trust_level: "registered",
    enrichment: { gasl_level: 2 },
  };
  const liveBase = {
    id: "agent-1",
    name: "Variant Triage Agent",
    type: { group: "org.ga4gh", artifact: "variant-triage-agent", version: "1.0.0" },
    organization: { name: "Example Org", url: "https://example.org" },
    version: "1.0.0",
  };

  test("matching live response with no divergence produces no issues", async () => {
    const live = { ...liveBase, agent_info_snapshot: cachedSnapshot };
    const issues = await checkAgentInfoUri("https://agent.example/service-info", cachedSnapshot, fetchReturning(jsonResponse(live)));
    assert.deepEqual(issues, []);
  });

  test("a bare string `type` is a hard failure, not just a warning", async () => {
    const live = { ...liveBase, type: "org.ga4gh:variant-triage-agent", agent_info_snapshot: cachedSnapshot };
    const issues = await checkAgentInfoUri("https://agent.example/service-info", cachedSnapshot, fetchReturning(jsonResponse(live)));
    assert.ok(issues.some((i) => i.severity === "error" && i.message.includes("`type`")));
  });

  test("a missing top-level agent_info_snapshot object is a hard failure", async () => {
    const live = { ...liveBase };
    const issues = await checkAgentInfoUri("https://agent.example/service-info", cachedSnapshot, fetchReturning(jsonResponse(live)));
    assert.ok(issues.some((i) => i.severity === "error" && i.message.includes("agent_info_snapshot")));
  });

  test("a non-suggested environment value is a warning, never a failure", async () => {
    const live = { ...liveBase, environment: "production", agent_info_snapshot: cachedSnapshot };
    const issues = await checkAgentInfoUri("https://agent.example/service-info", cachedSnapshot, fetchReturning(jsonResponse(live)));
    const envIssues = issues.filter((i) => i.code === "agent-info-environment-nonstandard");
    assert.equal(envIssues.length, 1);
    assert.equal(envIssues[0]?.severity, "warning");
  });

  test("cache divergence on trust_level is a warning, never a failure", async () => {
    const live = { ...liveBase, agent_info_snapshot: { ...cachedSnapshot, trust_level: "controlled" } };
    const issues = await checkAgentInfoUri("https://agent.example/service-info", cachedSnapshot, fetchReturning(jsonResponse(live)));
    const divergence = issues.filter((i) => i.code === "agent-info-cache-divergence");
    assert.equal(divergence.length, 1);
    assert.equal(divergence[0]?.severity, "warning");
    assert.ok(divergence[0]?.message.includes("registered"));
    assert.ok(divergence[0]?.message.includes("controlled"));
    assert.equal(issues.some((i) => i.severity === "error"), false);
  });

  test("a non-200 response is a hard failure", async () => {
    const issues = await checkAgentInfoUri(
      "https://agent.example/service-info",
      cachedSnapshot,
      fetchReturning(jsonResponse({}, { status: 500 })),
    );
    assert.ok(issues.every((i) => i.severity === "error"));
    assert.ok(issues.some((i) => i.code === "agent-info-unreachable"));
  });

  test("a transport failure is a hard failure", async () => {
    const issues = await checkAgentInfoUri(
      "https://agent.example/service-info",
      cachedSnapshot,
      fetchThrowing("ECONNREFUSED"),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, "error");
    assert.equal(issues[0]?.code, "agent-info-unreachable");
  });
});

// -- model_card_uri cross-reference check -----------------------------------

describe("model_card_uri validation", () => {
  const validModelCard = {
    model_details: {},
    intended_use: {},
    training_data_provenance: {},
    population_representation: {},
    evaluation: {},
    duo_compliance: {},
    provenance: {},
  };

  test("a JSON body with all required Model Card keys passes", async () => {
    const issues = await checkModelCardUri("https://example.org/card.json", fetchReturning(jsonResponse(validModelCard)));
    assert.deepEqual(issues, []);
  });

  test("a JSON body missing required Model Card keys fails, naming the missing keys", async () => {
    const { evaluation: _evaluation, ...incomplete } = validModelCard;
    const issues = await checkModelCardUri("https://example.org/card.json", fetchReturning(jsonResponse(incomplete)));
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.code, "model-card-invalid");
    assert.ok(issues[0]?.message.includes("evaluation"));
  });

  test("a non-JSON Markdown body containing a Model Card heading passes", async () => {
    const issues = await checkModelCardUri(
      "https://example.org/card.md",
      fetchReturning(textResponse("# Genomic Variant Classifier Model Card\n\n## Model Details\n...")),
    );
    assert.deepEqual(issues, []);
  });

  test("a non-JSON body with no recognisable Model Card heading fails", async () => {
    const issues = await checkModelCardUri(
      "https://example.org/not-a-card.md",
      fetchReturning(textResponse("# Just some other document\n\nNothing relevant here.")),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.code, "model-card-invalid");
  });

  test("a non-200 response fails", async () => {
    const issues = await checkModelCardUri(
      "https://example.org/missing.json",
      fetchReturning(jsonResponse({}, { status: 404 })),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.code, "model-card-unreachable");
  });
});

// -- Section 11: lift-out round-trip test -----------------------------------

describe("lift-out round-trip (internal project documentation Section 3.1, Section 11)", () => {
  test("stripping server._meta[\"org.ga4gh/ai-registry\"] leaves a valid, unmodified server.json", () => {
    const entry = loadFixture("valid/mcp-server.json");
    const server = structuredClone(entry.server) as Record<string, unknown>;
    const meta = server["_meta"] as Record<string, unknown> | undefined;
    delete meta?.["org.ga4gh/ai-registry"];

    const validateServer = getVendorValidator("server");
    const ok = validateServer(server);
    assert.equal(ok, true, JSON.stringify(validateServer.errors));
  });

  test("the embedded plugin document is already a valid, unmodified plugin.json (GA4GH additions live in the sibling ga4gh object, never inside plugin)", () => {
    const entry = loadFixture("valid/plugin.json");
    const validatePlugin = getVendorValidator("plugin");
    const ok = validatePlugin(entry.plugin);
    assert.equal(ok, true, JSON.stringify(validatePlugin.errors));
  });
});

// -- --json CLI output (internal project documentation Section 6, Workflow 1 and Workflow 3) --

describe("--json CLI flag", () => {
  test("parseArgs recognises --json alongside the existing flags", () => {
    assert.deepEqual(parseArgs(["--json"]), { skipNetwork: false, json: true });
    assert.deepEqual(parseArgs(["--skip-network", "--json", "--entry", "data/models/foo.json"]), {
      skipNetwork: true,
      json: true,
      entryPath: "data/models/foo.json",
    });
  });

  test("allResultsOk is true only when every result is ok", async () => {
    const validResults = await validateFiles([path.join(FIXTURES_DIR, "valid/model.json")], {
      skipNetwork: true,
      json: true,
    });
    assert.equal(allResultsOk(validResults), true);

    const invalidResults = await validateFiles([path.join(FIXTURES_DIR, "invalid/bad-slug.json")], {
      skipNetwork: true,
      json: true,
    });
    assert.equal(allResultsOk(invalidResults), false);
  });

  test("validateFiles output is JSON-serialisable and round-trips through JSON.stringify/parse unchanged", async () => {
    const results = await validateFiles([path.join(FIXTURES_DIR, "valid/agent.json")], {
      skipNetwork: true,
      json: true,
    });
    const roundTripped = JSON.parse(JSON.stringify(results));
    assert.deepEqual(roundTripped, results);
  });
});
