import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import type { EntryType } from "./types.js";

// ajv-formats' CJS default export confuses TS's NodeNext/ESM interop typing
// (a known ajv-ecosystem quirk); require() it directly and type the result
// against its own declared plugin shape.
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMAS_DIR = path.resolve(__dirname, "../../schemas");

const draft7MetaSchema = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../node_modules/ajv/dist/refs/json-schema-draft-07.json"),
    "utf-8",
  ),
) as object;

function loadJson(relPath: string): object {
  return JSON.parse(readFileSync(path.join(SCHEMAS_DIR, relPath), "utf-8")) as object;
}

const SCHEMA_FILE_FOR_TYPE: Record<EntryType, string> = {
  model: "model-entry.v1.schema.json",
  agent: "agent-entry.v1.schema.json",
  skill: "skill-entry.v1.schema.json",
  "mcp-server": "mcp-server-entry.v1.schema.json",
  plugin: "plugin-entry.v1.schema.json",
  bundle: "bundle-entry.v1.schema.json",
};

let ajvInstance: InstanceType<typeof Ajv2020> | undefined;

/**
 * A single Ajv instance carrying entry-core, both vendored (draft-07) upstream
 * schemas, and all five type schemas. Type schemas allOf-compose entry-core and,
 * for mcp-server/plugin, $ref the vendored schemas by their published $id, so
 * every schema must be registered on the same instance for those refs to resolve.
 */
export function getAjv(): InstanceType<typeof Ajv2020> {
  if (ajvInstance) return ajvInstance;

  // strictTypes is relaxed: entry-core.v1.schema.json and the vendored
  // schemas apply unevaluatedProperties/type constraints at the allOf-branch
  // level rather than restating "type": "object" at every composing root,
  // which is exactly the shape Ajv's strictTypes lint (not the JSON Schema
  // spec) objects to. The schemas themselves are settled (internal project documentation
  // Phase 1); this is an Ajv configuration choice, not a schema change.
  // strict mode is off outright: the vendored schemas under schemas/vendor/
  // (fetched verbatim from the upstream MCP registry and SchemaStore
  // projects, not authored here) carry OpenAPI-flavoured annotation keywords
  // Ajv's strict lint does not recognise (e.g. singular "example"), and
  // entry-core.v1.schema.json's allOf-composition pattern (Section 3.1)
  // legitimately declares "type"/"required" at a branch level strict mode
  // expects restated at every composing root. This is an Ajv lint
  // configuration choice, not a relaxation of actual validation semantics:
  // every keyword ajv-formats and the 2020-12 core vocabulary understand is
  // still fully enforced.
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  // Vendor schemas declare $schema: draft-07; register that meta-schema so
  // Ajv can compile them even though the primary dialect here is 2020-12.
  ajv.addMetaSchema(draft7MetaSchema);

  ajv.addSchema(loadJson("entry-core.v1.schema.json"));
  ajv.addSchema(loadJson("vendor/server.schema.json"));
  ajv.addSchema(loadJson("vendor/plugin.schema.json"));
  ajv.addSchema(loadJson("vendor/marketplace.schema.json"));

  for (const file of Object.values(SCHEMA_FILE_FOR_TYPE)) {
    ajv.addSchema(loadJson(file));
  }

  ajvInstance = ajv;
  return ajv;
}

const validatorCache = new Map<EntryType, ValidateFunction>();

export function getValidatorForType(type: EntryType): ValidateFunction {
  const cached = validatorCache.get(type);
  if (cached) return cached;

  const ajv = getAjv();
  const schema = loadJson(SCHEMA_FILE_FOR_TYPE[type]) as { $id: string };
  const validate = ajv.getSchema(schema.$id) as ValidateFunction | undefined;
  if (!validate) {
    throw new Error(`No compiled schema found for type "${type}" (${schema.$id})`);
  }
  validatorCache.set(type, validate);
  return validate;
}

export function getVendorSchema(name: "server" | "plugin" | "marketplace"): object {
  return loadJson(`vendor/${name}.schema.json`);
}

/**
 * A validator for the unmodified, standalone vendored schema (server.json or
 * plugin.json), independent of any GA4GH entry wrapper. Used by the Section
 * 11 lift-out round-trip test: stripping the GA4GH extension from an
 * embedded document MUST leave something this validator still accepts.
 */
export function getVendorValidator(name: "server" | "plugin" | "marketplace"): ValidateFunction {
  const ajv = getAjv();
  const schema = getVendorSchema(name) as { $id: string };
  const validate = ajv.getSchema(schema.$id) as ValidateFunction | undefined;
  if (!validate) {
    throw new Error(`No compiled vendor schema found for "${name}" (${schema.$id})`);
  }
  return validate;
}
