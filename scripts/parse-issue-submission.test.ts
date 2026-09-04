import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseIssueSubmission } from "./lib/parse-issue-submission.js";
import { validateEntryOffline } from "./lib/validate-entry.js";

const CONTEXT = { issueNumber: 101, now: new Date("2026-09-03T00:00:00.000Z") };

function commonFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: "example-entry",
    name: "Example Entry",
    summary: "A one-line summary of the example entry.",
    description: "A longer Markdown description of the example entry.",
    homepage: "https://example.org/example-entry",
    repository: "https://github.com/example-org/example-entry",
    license: "MIT",
    version: "1.0.0",
    category: "other",
    keywords: "example, demo",
    maintainers: "Ada Researcher, ada-researcher, Example Institute",
    safety_classification: "_No response_",
    ...overrides,
  };
}

describe("parseIssueSubmission: common-core field conventions", () => {
  test("certification_tier is always injected as unsigned, regardless of what the field map contains", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields(), certification_tier: "platform_verified", model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.record.certification_tier, "unsigned");
  });

  test("record is a schema-complete placeholder stamped with the issue number and the injected clock", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields(), model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.record.record, {
        created: "2026-09-03T00:00:00.000Z",
        updated: "2026-09-03T00:00:00.000Z",
        last_verified: "2026-09-03T00:00:00.000Z",
        source_issue: 101,
      });
    }
  });

  test("_No response_ and blank strings are both treated as absent for optional fields", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields({ license_url: "_No response_", ga4gh_standards: "" }), model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal("license_url" in result.record, false);
      assert.equal("ga4gh_standards" in result.record, false);
    }
  });

  test("keywords is comma-separated, trimmed, and empty entries are dropped", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields({ keywords: " variant ,, pathogenicity ,genomics" }), model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.record.keywords, ["variant", "pathogenicity", "genomics"]);
  });

  test("maintainers: one comma-separated row per line, optional trailing columns", () => {
    const result = parseIssueSubmission(
      "model",
      {
        ...commonFields({
          maintainers: "Ada Researcher, ada-researcher, Example Institute\nGrace Hopper, grace-hopper",
        }),
        model_card_uri: "https://example.org/card.json",
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.record.maintainers, [
        { name: "Ada Researcher", github: "ada-researcher", affiliation: "Example Institute" },
        { name: "Grace Hopper", github: "grace-hopper" },
      ]);
    }
  });

  test("maintainers: a row missing github is a parse error, not a silently dropped row", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields({ maintainers: "Ada Researcher" }), model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[0] ?? "", /maintainers row 1/);
  });

  test("safety_classification: scheme-qualified rows, optional trailing columns, may be entirely absent", () => {
    const result = parseIssueSubmission(
      "model",
      {
        ...commonFields({
          safety_classification: "ga4gh-gase, GASL-2, submitter-attested\nga4gh-agent-runtime-risk, 2, synced-from-endpoint, , , , https://example.org/evidence",
        }),
        model_card_uri: "https://example.org/card.json",
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.record.safety_classification, [
        { scheme: "ga4gh-gase", level: "GASL-2", source: "submitter-attested" },
        { scheme: "ga4gh-agent-runtime-risk", level: "2", source: "synced-from-endpoint", evidence_uri: "https://example.org/evidence" },
      ]);
    }
  });
});

describe("parseIssueSubmission: per-type candidate records validate against their schema", () => {
  test("model: a minimal valid submission passes offline schema validation", () => {
    const result = parseIssueSubmission(
      "model",
      { ...commonFields({ category: "variant-effect-prediction" }), model_card_uri: "https://example.org/card.json" },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(validateEntryOffline(result.record, "model").filter((i) => i.severity === "error"), []);
  });

  test("agent: agent_info_snapshot is parsed from a pasted JSON blob", () => {
    const result = parseIssueSubmission(
      "agent",
      {
        ...commonFields({ category: "variant-interpretation" }),
        agent_info_uri: "https://agent.example.org/service-info",
        agent_info_snapshot: JSON.stringify({
          protocol_version: "0.5.0",
          agent_type: "variant-triage",
          trust_level: "registered",
          enrichment: { gasl_level: 2 },
        }),
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual((result.record.agent_info_snapshot as Record<string, unknown>).protocol_version, "0.5.0");
      assert.deepEqual(validateEntryOffline(result.record, "agent").filter((i) => i.severity === "error"), []);
    }
  });

  test("agent: malformed agent_info_snapshot JSON is reported as a specific parse error, not a schema error", () => {
    const result = parseIssueSubmission(
      "agent",
      {
        ...commonFields({ category: "variant-interpretation" }),
        agent_info_uri: "https://agent.example.org/service-info",
        agent_info_snapshot: "{not valid json",
      },
      CONTEXT,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[0] ?? "", /"agent_info_snapshot" is not valid JSON/);
  });

  test("skill: inputs/outputs rows and source.repository are assembled correctly", () => {
    const result = parseIssueSubmission(
      "skill",
      {
        ...commonFields({ category: "consent-review" }),
        skill: JSON.stringify({ name: "consent-form-reviewer", description: "Reviews consent forms." }),
        source_repository_url: "https://github.com/example-org/skills",
        source_repository_subfolder: "consent-form-reviewer",
        inputs: "consent_document, file, The signed consent form",
        outputs: "duo_restrictions, json, Extracted DUO codes",
        human_oversight: "required",
        provenance_logging: "true",
        evaluation_criteria_uri: "https://example.org/evaluation.md",
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.record.source, {
        repository: { url: "https://github.com/example-org/skills", subfolder: "consent-form-reviewer" },
      });
      assert.deepEqual(validateEntryOffline(result.record, "skill").filter((i) => i.severity === "error"), []);
    }
  });

  test("mcp-server: server is parsed from a pasted server.json blob", () => {
    const result = parseIssueSubmission(
      "mcp-server",
      {
        ...commonFields({ category: "trs", ga4gh_standards: "trs" }),
        server: JSON.stringify({
          name: "org.example/example-server",
          description: "An example server.",
          version: "1.0.0",
          _meta: { "org.ga4gh/ai-registry": { ga4gh_standards: ["trs@2.0.1"] } },
        }),
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(validateEntryOffline(result.record, "mcp-server").filter((i) => i.severity === "error"), []);
  });

  test("plugin: ga4gh.harnesses rows support the optional compatibility columns", () => {
    const result = parseIssueSubmission(
      "plugin",
      {
        ...commonFields({ category: "clinical-genomics" }),
        plugin: JSON.stringify({ name: "example-plugin", version: "1.0.0", description: "An example plugin." }),
        ga4gh_harnesses: "claude-code, /plugin install example-plugin@example-org, , 1.2.0\ncodex, codex plugin add example-plugin",
      },
      CONTEXT,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual((result.record.ga4gh as Record<string, unknown>).harnesses, [
        {
          harness: "claude-code",
          installCommand: "/plugin install example-plugin@example-org",
          compatibility: { minVersion: "1.2.0" },
        },
        { harness: "codex", installCommand: "codex plugin add example-plugin" },
      ]);
      assert.deepEqual(validateEntryOffline(result.record, "plugin").filter((i) => i.severity === "error"), []);
    }
  });

  test("plugin: a pasted plugin JSON that fails to parse is reported before schema validation ever runs", () => {
    const result = parseIssueSubmission(
      "plugin",
      {
        ...commonFields({ category: "clinical-genomics" }),
        plugin: "not json at all",
        ga4gh_harnesses: "claude-code, /plugin install example-plugin@example-org",
      },
      CONTEXT,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.errors[0] ?? "", /"plugin" is not valid JSON/);
  });
});
