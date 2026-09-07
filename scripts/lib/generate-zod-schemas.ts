import path from "node:path";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { dereferenceAndFlatten } from "./flatten-schema.js";
import { SCHEMAS_DIR } from "./schemas.js";
import { ENTRY_TYPES, type EntryType } from "./types.js";

const SCHEMA_FILE_FOR_TYPE: Record<EntryType, string> = {
  model: "model-entry.v1.schema.json",
  agent: "agent-entry.v1.schema.json",
  skill: "skill-entry.v1.schema.json",
  "mcp-server": "mcp-server-entry.v1.schema.json",
  plugin: "plugin-entry.v1.schema.json",
  bundle: "bundle-entry.v1.schema.json",
};

const EXPORT_NAME_FOR_TYPE: Record<EntryType, string> = {
  model: "ModelEntry",
  agent: "AgentEntry",
  skill: "SkillEntry",
  "mcp-server": "McpServerEntry",
  plugin: "PluginEntry",
  bundle: "BundleEntry",
};

/**
 * entry-core.v1.schema.json's one `if`/`then` conditional (no `else`, so it
 * does not match json-schema-to-zod's own conditional parser either --
 * scripts/lib/flatten-schema.ts detects and drops it structurally) is
 * reapplied here as an explicit `.superRefine()`, appended to every
 * generated type schema since every type composes entry-core.
 */
function withLicenseConditional(zodExpression: string): string {
  return (
    `(${zodExpression}).superRefine((val, ctx) => {\n` +
    `  if (val.license === "other" && !val.license_url) {\n` +
    `    ctx.addIssue({ code: "custom", path: ["license_url"], message: 'license_url is required when license is "other"' });\n` +
    `  }\n` +
    `})`
  );
}

/**
 * Generates one TypeScript module source string exporting a Zod schema (and
 * inferred type) per entry type, for site/src/content.config.ts's Content
 * Collections (internal project documentation Section 3.1, Section 4.1). Regenerated fresh on
 * every call -- the caller MUST regenerate it on every site build rather than
 * relying on a committed, potentially stale copy (TECH.md Section 3.1's "or
 * regenerate unconditionally on every build so staleness cannot occur"
 * option; see internal project documentation Phase 2 for why that option was chosen over a
 * committed-snapshot diff check).
 */
export async function generateZodModuleSource(): Promise<string> {
  const parts: string[] = [
    "// GENERATED FILE. Do not edit by hand.",
    "//",
    "// Produced by scripts/lib/generate-zod-schemas.ts from schemas/*.v1.schema.json.",
    "// Regenerated fresh on every site build (internal project documentation Section 3.1); never committed.",
    'import { z } from "zod";',
    "",
  ];

  for (const type of ENTRY_TYPES) {
    const name = EXPORT_NAME_FOR_TYPE[type];
    const { schema } = await dereferenceAndFlatten(path.join(SCHEMAS_DIR, SCHEMA_FILE_FOR_TYPE[type]));
    const expression = jsonSchemaToZod(schema, { module: "none", type: false, zodVersion: 4 });
    parts.push(`export const ${name}Schema = ${withLicenseConditional(expression)};`);
    parts.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    parts.push("");
  }

  return parts.join("\n");
}
