import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkUpstream, deriveQualifiedId, normaliseSegment, qualifiedIdFor } from "./lib/upstream.js";
import { groupEntriesByPublisher } from "./lib/publishers.js";
import { validateEntryOffline, validateSchema } from "./lib/validate-entry.js";
import { toIndexEntrySummary } from "./lib/index-entry.js";
import {
  applyPatchToText,
  applyUpstreamMetadata,
  resolveEntryPath,
  scanTopLevelMembers,
  toEntryPatch,
} from "./apply-upstream-metadata.js";
import type { AnyEntry } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALID_MODEL_PATH = path.join(__dirname, "__fixtures__/valid/model.json");

function validModel(): AnyEntry {
  return JSON.parse(readFileSync(VALID_MODEL_PATH, "utf-8")) as AnyEntry;
}

const PUBLISHER = { id: "google-deepmind", name: "Google DeepMind", type: "github-org" as const };

describe("deriveQualifiedId", () => {
  test("publisher/name@version", () => {
    assert.equal(deriveQualifiedId({ publisher: PUBLISHER, name: "alphagenome", version: "0.9.0" }), "google-deepmind/alphagenome@0.9.0");
  });

  test("omits @version when version is null, undefined or blank", () => {
    assert.equal(deriveQualifiedId({ publisher: PUBLISHER, name: "alphagenome", version: null }), "google-deepmind/alphagenome");
    assert.equal(deriveQualifiedId({ publisher: PUBLISHER, name: "alphagenome" }), "google-deepmind/alphagenome");
    assert.equal(deriveQualifiedId({ publisher: PUBLISHER, name: "alphagenome", version: "   " }), "google-deepmind/alphagenome");
  });

  test("normalises upper-case publisher and name, but keeps the version as published", () => {
    assert.equal(
      deriveQualifiedId({ publisher: { ...PUBLISHER, id: "Google" }, name: "AlphaGenome", version: "2.2-RC1" }),
      "google/alphagenome@2.2-RC1",
    );
    assert.equal(
      deriveQualifiedId({ publisher: { ...PUBLISHER, id: "facebook" }, name: "esm2_t36_3B_UR50D", version: " abc123 " }),
      "facebook/esm2_t36_3b_ur50d@abc123",
    );
  });

  test("replaces whitespace and separator characters inside segments", () => {
    assert.equal(normaliseSegment(" Arc  Institute "), "arc-institute");
    assert.equal(normaliseSegment("scope/pkg@x"), "scope-pkg-x");
  });

  test("qualifiedIdFor reads an entry and returns undefined without an upstream block", () => {
    assert.equal(qualifiedIdFor(validModel()), "example-org/example-model@1.2.0");
    const { upstream: _drop, ...rest } = validModel();
    assert.equal(qualifiedIdFor(rest), undefined);
  });
});

describe("checkUpstream", () => {
  test("missing upstream is a warning, not an error", () => {
    const { upstream: _drop, ...rest } = validModel();
    const issues = checkUpstream(rest);
    assert.deepEqual(issues.map((i) => [i.severity, i.code]), [["warning", "upstream-missing"]]);
  });

  test("a stored qualified_id must equal the derived value", () => {
    const entry = validModel();
    (entry.upstream as Record<string, unknown>).qualified_id = "example-org/example-model@1.2.0";
    assert.deepEqual(checkUpstream(entry), []);
    (entry.upstream as Record<string, unknown>).qualified_id = "example-org/example-model@9.9.9";
    assert.ok(checkUpstream(entry).some((i) => i.severity === "error" && i.code === "upstream-qualified-id-mismatch"));
  });

  test("version_source or version_date without a version is an error; a version without a source is a warning", () => {
    const entry = validModel();
    const upstream = entry.upstream as Record<string, unknown>;
    upstream.version = null;
    const errors = checkUpstream(entry).filter((i) => i.severity === "error");
    assert.equal(errors.length, 2);
    upstream.version = "1.0.0";
    upstream.version_source = null;
    assert.deepEqual(checkUpstream(entry).map((i) => i.code), ["upstream-version-source-missing"]);
  });
});

describe("schema validation of upstream and model_details", () => {
  test("the complete valid model fixture passes", () => {
    assert.deepEqual(validateEntryOffline(validModel(), "model"), []);
  });

  test("an entry without upstream or model_details still validates (backwards compatible)", () => {
    const { upstream: _u, model_details: _m, ...rest } = validModel();
    assert.deepEqual(validateSchema(rest, "model"), []);
  });

  const invalidCases: Array<[string, (e: AnyEntry) => void, string]> = [
    ["upper-case publisher id", (e) => ((e.upstream as any).publisher.id = "Google"), "/upstream/publisher/id"],
    ["unknown publisher type", (e) => ((e.upstream as any).publisher.type = "gitlab-org"), "/upstream/publisher/type"],
    ["unknown version_source", (e) => ((e.upstream as any).version_source = "guess"), "/upstream/version_source"],
    ["malformed version_date", (e) => ((e.upstream as any).version_date = "08/09/2026"), "/upstream/version_date"],
    ["extra upstream property", (e) => ((e.upstream as any).owner = "x"), "/upstream"],
    ["missing publisher", (e) => delete (e.upstream as any).publisher, "/upstream"],
    ["parameters as prose", (e) => ((e.model_details as any).parameters = "7 billion"), "/model_details/parameters"],
    ["unknown precision", (e) => ((e.model_details as any).reference_precision = "fp4"), "/model_details/reference_precision"],
    ["unknown weights availability", (e) => ((e.model_details as any).weights_availability = "private"), "/model_details/weights_availability"],
    ["unknown quantisation format", (e) => ((e.model_details as any).quantisations[0].format = "exl2"), "/model_details/quantisations/0/format"],
    ["zero bits", (e) => ((e.model_details as any).quantisations[0].bits = 0), "/model_details/quantisations/0/bits"],
    ["quantisation without url", (e) => delete (e.model_details as any).quantisations[0].url, "/model_details/quantisations/0"],
  ];
  for (const [label, mutate, pathPrefix] of invalidCases) {
    test(`rejects ${label}`, () => {
      const entry = validModel();
      mutate(entry);
      const issues = validateSchema(entry, "model");
      assert.ok(
        issues.some((i) => (i.path ?? "").startsWith(pathPrefix)),
        `expected a schema error under ${pathPrefix}, got ${JSON.stringify(issues)}`,
      );
    });
  }

  test("accepts a numeric parameter count", () => {
    const entry = validModel();
    (entry.model_details as any).parameters = 345000000;
    assert.deepEqual(validateSchema(entry, "model"), []);
  });

  test("model_details is not accepted on a non-model entry", () => {
    const skill = JSON.parse(readFileSync(path.join(__dirname, "__fixtures__/valid/skill.json"), "utf-8")) as AnyEntry;
    skill.model_details = { parameters: "7B" };
    assert.ok(validateSchema(skill, "skill").length > 0);
  });
});

describe("publisher grouping", () => {
  const entry = (id: string, name: string, publisher?: { id: string; name: string; type: string }, version?: string | null) => ({
    id,
    name,
    ...(publisher ? { upstream: { publisher, name: id, version } } : {}),
  });

  test("groups by normalised publisher id with counts, sorted by name", () => {
    const groups = groupEntriesByPublisher([
      { type: "model", collection: "models", id: "evo2", data: entry("evo2", "Evo 2", { id: "arcinstitute", name: "Arc Institute", type: "huggingface-org" }, "abc") },
      { type: "model", collection: "models", id: "alphagenome", data: entry("alphagenome", "AlphaGenome", { id: "google-deepmind", name: "Google DeepMind", type: "github-org" }, "0.9.0") },
      { type: "skill", collection: "skills", id: "ag-skill", data: entry("ag-skill", "AG skill", { id: "Google-DeepMind", name: "Google DeepMind", type: "github-org" }, null) },
      { type: "model", collection: "models", id: "no-upstream", data: entry("no-upstream", "No upstream") },
    ]);
    assert.deepEqual(groups.map((g) => [g.id, g.name, g.entries.length]), [
      ["arcinstitute", "Arc Institute", 1],
      ["google-deepmind", "Google DeepMind", 2],
    ]);
    const deepmind = groups[1]!;
    assert.deepEqual(deepmind.entries.map((e) => [e.collection, e.id, e.qualifiedId]), [
      ["models", "alphagenome", "google-deepmind/alphagenome@0.9.0"],
      ["skills", "ag-skill", "google-deepmind/ag-skill"],
    ]);
    assert.deepEqual(deepmind.conflicts, []);
  });

  test("records name or type disagreements for one publisher id", () => {
    const [group] = groupEntriesByPublisher([
      { type: "model", collection: "models", id: "a", data: entry("a", "A", { id: "acme", name: "Acme", type: "github-org" }) },
      { type: "model", collection: "models", id: "b", data: entry("b", "B", { id: "acme", name: "ACME Inc", type: "organisation" }) },
    ]);
    assert.equal(group!.conflicts.length, 2);
  });
});

describe("index summary projection", () => {
  test("carries upstream with a derived qualified_id, ignoring a stale stored one", () => {
    const entry = validModel();
    (entry.upstream as Record<string, unknown>).qualified_id = "stale/value@0";
    const summary = toIndexEntrySummary(entry, "model");
    assert.equal(summary.upstream?.qualified_id, "example-org/example-model@1.2.0");
  });
});

describe("apply-upstream-metadata", () => {
  const ORIGINAL = `{
  "id": "example",
  "type": "model",
  "maintainers": [
    { "name": "A", "github": "a" }
  ],
  "version": "v1",
  "keywords": ["x", "y"],
  "developed_by": "Someone",
  "hosting_location": "huggingface",
  "record": { "created": "2026-01-01T00:00:00Z" }
}
`;
  const INPUT = {
    publisher: { name: "Example Org", id: "example-org", type: "huggingface-org" },
    name: "Example",
    version: " 1.0 ",
    version_source: "huggingface-revision",
    qualified_id: "wrong/value",
    model_details: { parameters: "1B", quantisations: [{ url: "https://example.org/q", format: "gguf", bits: 8, publisher: "official" }] },
    evidence: "api",
    notes: "n",
  };

  test("inserts upstream after version and model_details before hosting_location, preserving other formatting", () => {
    const { text } = applyPatchToText(ORIGINAL, "model", toEntryPatch(INPUT));
    const keys = scanTopLevelMembers(text).map((m) => m.key);
    assert.deepEqual(keys, ["id", "type", "maintainers", "version", "upstream", "keywords", "developed_by", "model_details", "hosting_location", "record"]);
    assert.ok(text.includes(`    { "name": "A", "github": "a" }`), "inline maintainer object kept");
    assert.ok(text.includes(`"keywords": ["x", "y"]`), "inline array kept");
    assert.ok(text.includes(`  "upstream": {\n    "publisher": {\n      "id": "example-org",`), "canonical key order, two-space indent");
    const parsed = JSON.parse(text);
    assert.equal(parsed.upstream.version, "1.0");
    assert.equal(parsed.upstream.qualified_id, undefined, "qualified_id is never written");
    assert.deepEqual(Object.keys(parsed.model_details.quantisations[0]), ["format", "bits", "publisher", "url"]);
  });

  test("is idempotent: a second application yields identical text", () => {
    const once = applyPatchToText(ORIGINAL, "model", toEntryPatch(INPUT)).text;
    const twice = applyPatchToText(once, "model", toEntryPatch(INPUT)).text;
    assert.equal(twice, once);
  });

  test("merges model_details fields over an existing block", () => {
    const once = applyPatchToText(ORIGINAL, "model", toEntryPatch(INPUT)).text;
    const merged = applyPatchToText(once, "model", toEntryPatch({ model_details: { weights_availability: "open" } })).text;
    const parsed = JSON.parse(merged);
    assert.equal(parsed.model_details.parameters, "1B");
    assert.equal(parsed.model_details.weights_availability, "open");
  });

  test("refuses model_details on a non-model entry", () => {
    assert.throws(() => applyPatchToText(ORIGINAL.replace('"model"', '"skill"'), "skill", toEntryPatch({ model_details: { parameters: "1B" } })));
  });

  test("resolves the accepted key forms and rejects others", () => {
    const root = "/r/data";
    for (const key of ["data/models/esm2.json", "models/esm2.json", "models/esm2", "./data/models/esm2"]) {
      assert.deepEqual(resolveEntryPath(key, root), { filePath: "/r/data/models/esm2.json", type: "model" });
    }
    assert.throws(() => resolveEntryPath("widgets/esm2", root));
    assert.throws(() => resolveEntryPath("models/../x", root));
  });

  test("dry run reports without writing; a real run writes; invalid merges are left untouched", () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "apply-upstream-"));
    try {
      mkdirSync(path.join(dataRoot, "models"));
      const { upstream: _u, model_details: _m, ...base } = validModel();
      const original = `${JSON.stringify(base, null, 2)}\n`;
      const file = path.join(dataRoot, "models", "example-model.json");
      writeFileSync(file, original);
      const input = {
        $comment: "ignored",
        "models/example-model": { upstream: { publisher: { id: "example-org", name: "Example Org", type: "github-org" }, name: "example-model", version: "1.2.0", version_source: "github-release" } },
        "models/missing": { name: "x", publisher: { id: "x", name: "X", type: "other" } },
      };

      const dry = applyUpstreamMetadata(input, { dataRoot, dryRun: true });
      assert.deepEqual(dry.map((r) => r.status), ["updated", "error"]);
      assert.equal(readFileSync(file, "utf-8"), original);

      const real = applyUpstreamMetadata(input, { dataRoot, dryRun: false });
      assert.equal(real[0]!.status, "updated");
      assert.equal(real[0]!.qualifiedId, "example-org/example-model@1.2.0");
      assert.equal(JSON.parse(readFileSync(file, "utf-8")).upstream.name, "example-model");

      assert.equal(applyUpstreamMetadata(input, { dataRoot, dryRun: false })[0]!.status, "unchanged");

      const before = readFileSync(file, "utf-8");
      const bad = applyUpstreamMetadata(
        { "models/example-model": { publisher: { id: "Bad Id", name: "X", type: "other" }, name: "x" } },
        { dataRoot, dryRun: false },
      );
      assert.equal(bad[0]!.status, "error");
      assert.equal(readFileSync(file, "utf-8"), before);
    } finally {
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });
});
