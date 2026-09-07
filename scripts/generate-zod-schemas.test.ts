import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { generateZodModuleSource } from "./lib/generate-zod-schemas.js";
import { ENTRY_TYPES, type AnyEntry, type EntryType } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "__fixtures__");

const EXPORT_NAME_FOR_TYPE: Record<EntryType, string> = {
  model: "ModelEntry",
  agent: "AgentEntry",
  skill: "SkillEntry",
  "mcp-server": "McpServerEntry",
  plugin: "PluginEntry",
  bundle: "BundleEntry",
};

function loadFixture(relPath: string): AnyEntry {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, relPath), "utf-8")) as AnyEntry;
}

// The generator emits TypeScript source; write it to a temp .mjs-importable
// module (stripping the `z.infer` type-only lines, which are erased at
// runtime anyway but are cleanest just not emitted for a JS-only smoke test)
// so this test exercises the exact generated Zod runtime behaviour, not a
// re-implementation of it.
async function loadGeneratedSchemas(): Promise<Record<EntryType, import("zod").ZodTypeAny>> {
  const source = await generateZodModuleSource();
  const jsSource = source
    .split("\n")
    .filter((line) => !line.startsWith("export type "))
    .join("\n");

  // Written inside the repo tree (not os.tmpdir()) so this module's `import
  // "zod"` resolves via the repo's own node_modules during Node's directory
  // walk-up resolution.
  const dir = mkdtempSync(path.join(__dirname, ".tmp-zod-test-"));
  const modPath = path.join(dir, "entry-schemas.mjs");
  await writeFile(modPath, jsSource, "utf-8");
  try {
    const mod = (await import(`${modPath}?t=${Date.now()}`)) as Record<string, unknown>;
    const result = {} as Record<EntryType, import("zod").ZodTypeAny>;
    for (const type of ENTRY_TYPES) {
      result[type] = mod[`${EXPORT_NAME_FOR_TYPE[type]}Schema`] as import("zod").ZodTypeAny;
    }
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("generated Zod schemas", () => {
  test("every valid fixture parses against its generated schema", async () => {
    const schemas = await loadGeneratedSchemas();
    for (const type of ENTRY_TYPES) {
      const fixture = loadFixture(`valid/${type}.json`);
      const result = schemas[type].safeParse(fixture);
      assert.equal(result.success, true, `${type}: ${result.success ? "" : JSON.stringify(result.error.issues)}`);
    }
  });

  test("an unknown top-level property is rejected (unevaluatedProperties: false mirrored as .strict())", async () => {
    const schemas = await loadGeneratedSchemas();
    for (const type of ENTRY_TYPES) {
      const fixture = { ...loadFixture(`valid/${type}.json`), notARealField: "surprise" };
      const result = schemas[type].safeParse(fixture);
      assert.equal(result.success, false, `${type} should reject an unrecognised top-level property`);
    }
  });

  test("a missing common-core required field is rejected", async () => {
    const schemas = await loadGeneratedSchemas();
    const { summary: _summary, ...withoutSummary } = loadFixture("valid/model.json");
    assert.equal(schemas.model.safeParse(withoutSummary).success, false);
  });

  test("license \"other\" without license_url is rejected via the reapplied conditional", async () => {
    const schemas = await loadGeneratedSchemas();
    const entry = loadFixture("valid/model.json");
    const withOtherLicense = { ...entry, license: "other" };
    delete (withOtherLicense as Record<string, unknown>)["license_url"];
    const result = schemas.model.safeParse(withOtherLicense);
    assert.equal(result.success, false);
  });

  test("a missing field inside the embedded mcp-server vendor document is rejected", async () => {
    const schemas = await loadGeneratedSchemas();
    const entry = loadFixture("valid/mcp-server.json") as AnyEntry & { server: Record<string, unknown> };
    const { version: _version, ...serverWithoutVersion } = entry.server;
    const result = schemas["mcp-server"].safeParse({ ...entry, server: serverWithoutVersion });
    assert.equal(result.success, false);
  });

  test("a missing field inside the embedded plugin vendor document is rejected", async () => {
    const schemas = await loadGeneratedSchemas();
    const entry = loadFixture("valid/plugin.json") as AnyEntry & { plugin: Record<string, unknown> };
    const { name: _name, ...pluginWithoutName } = entry.plugin;
    const result = schemas.plugin.safeParse({ ...entry, plugin: pluginWithoutName });
    assert.equal(result.success, false);
  });

  test("a missing field inside the embedded marketplace vendor document is rejected", async () => {
    const schemas = await loadGeneratedSchemas();
    const entry = loadFixture("valid/bundle.json") as AnyEntry & { marketplace: Record<string, unknown> };
    const { owner: _owner, ...marketplaceWithoutOwner } = entry.marketplace;
    const result = schemas.bundle.safeParse({ ...entry, marketplace: marketplaceWithoutOwner });
    assert.equal(result.success, false);
  });
});
