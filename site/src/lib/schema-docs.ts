/**
 * Reads this project's own `schemas/*.v1.schema.json` files at build time and
 * normalises each into a small, render-friendly document tree for the
 * `/specifications/` pages (see `site/src/pages/specifications/`).
 *
 * This is a purpose-built renderer for these seven schemas' actual shape, not
 * a generic JSON Schema browser: it understands exactly the composition
 * patterns these files use (each type schema's `allOf: [{$ref: entry-core},
 * {type-specific object}]`, entry-core's own `$defs`, and the three
 * `schemas/vendor/*.schema.json` embed points), because that shape was read
 * and confirmed directly against the files before this was written, per this
 * task's own instruction to read entry-core and at least one content-type
 * schema fully before designing a renderer.
 *
 * Vendored schemas (`schemas/vendor/*.schema.json`) are deliberately never
 * walked into: any `$ref` that resolves into one is surfaced as a short note
 * plus a link to the vendored file on the repository, per this task's scope
 * ("don't fully render their content").
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoBlobUrl } from "./repo.js";
import { withBase } from "./url.js";

/**
 * Deliberately resolved from `process.cwd()`, not from this module's own
 * `import.meta.url` -- Astro's static build bundles this module into a
 * `dist/.prerender/chunks/` file whose on-disk location no longer bears any
 * relation to `site/src/lib/`, so an `import.meta.url`-relative path (the
 * pattern `scripts/lib/schemas.ts` uses, safely, since those scripts run
 * in place via `tsx` and are never bundled elsewhere) silently resolves to
 * the wrong directory once bundled, exactly as confirmed by a first attempt
 * at this file that used `fileURLToPath(import.meta.url)` and failed
 * `astro build` with an ENOENT for a `site/schemas/` path that never
 * existed. `process.cwd()` is stable instead: every build entry point in
 * this repository (`predev`/`prebuild`, `pnpm --filter site build`, and
 * `content.config.ts`'s own glob loader, per that file's comment) is run
 * with the Astro project root (`site/`) as the working directory.
 */
const SCHEMAS_DIR = path.resolve(process.cwd(), "../schemas");
const ENTRY_CORE_FILE = "entry-core.v1.schema.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONSchema = Record<string, any>;

export interface ExternalRef {
  label: string;
  href: string;
  note: string;
}

export interface InternalDefRef {
  label: string;
  href: string;
}

export interface FieldDoc {
  name: string;
  required: boolean;
  typeLabel: string;
  description?: string;
  constraints: string[];
  children?: FieldDoc[];
  /** True when this object permits properties beyond those listed here. */
  openObject?: boolean;
  /** Set when this field's value is (or embeds, via allOf) a vendored schema. */
  externalRef?: ExternalRef;
  /** Set when this field's value is entry-core's own `$defs/<Name>`. */
  internalDefRef?: InternalDefRef;
}

export interface SchemaDefDoc {
  name: string;
  anchor: string;
  description?: string;
  fields: FieldDoc[];
}

export interface SchemaDoc {
  slug: string;
  file: string;
  title: string;
  description: string;
  comment?: string;
  isCore: boolean;
  extendsCore: boolean;
  /** Fields this type schema's own allOf branch requires (entry-core's required list is on the entry-core doc itself). */
  requiredTopLevel: string[];
  /**
   * Entry-core fields this type schema promotes to required without
   * redeclaring their property schema (mcp-server-entry's `ga4gh_standards`
   * is the one case of this among the six type schemas).
   */
  inheritedRequiredOverrides: string[];
  fields: FieldDoc[];
  defs: SchemaDefDoc[];
  raw: JSONSchema;
}

const TYPE_SCHEMA_FILES: { slug: string; file: string }[] = [
  { slug: "agent-entry", file: "agent-entry.v1.schema.json" },
  { slug: "bundle-entry", file: "bundle-entry.v1.schema.json" },
  { slug: "mcp-server-entry", file: "mcp-server-entry.v1.schema.json" },
  { slug: "model-entry", file: "model-entry.v1.schema.json" },
  { slug: "plugin-entry", file: "plugin-entry.v1.schema.json" },
  { slug: "skill-entry", file: "skill-entry.v1.schema.json" },
];

export const SCHEMA_SLUGS: readonly string[] = ["entry-core", ...TYPE_SCHEMA_FILES.map((t) => t.slug)];

const VENDOR_INFO: Record<string, { label: string; note: string }> = {
  "vendor/server.schema.json": {
    label: "server.schema.json",
    note:
      "The official MCP Registry server.json schema, vendored verbatim (not rendered here). This entry embeds a full, valid server.json document; GA4GH's own additions live only inside its _meta['org.ga4gh/ai-registry'] extension point, shown below.",
  },
  "vendor/plugin.schema.json": {
    label: "plugin.schema.json",
    note:
      "Claude Code's plugin.json schema, vendored verbatim (not rendered here). This entry embeds a full, valid plugin.json document.",
  },
  "vendor/marketplace.schema.json": {
    label: "marketplace.schema.json",
    note:
      "Claude Code's marketplace.json schema, vendored verbatim (not rendered here). This entry embeds a full, valid marketplace.json document.",
  },
};

function loadRaw(file: string): JSONSchema {
  return JSON.parse(readFileSync(path.join(SCHEMAS_DIR, file), "utf-8")) as JSONSchema;
}

let entryCoreCache: JSONSchema | undefined;
function loadEntryCore(): JSONSchema {
  if (!entryCoreCache) entryCoreCache = loadRaw(ENTRY_CORE_FILE);
  return entryCoreCache;
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}

function constraintsFor(schema: JSONSchema): string[] {
  const out: string[] = [];
  if (Array.isArray(schema.enum)) {
    out.push(`Allowed values: ${(schema.enum as unknown[]).map(formatValue).join(", ")}`);
  }
  if (schema.const !== undefined && schema.enum === undefined) {
    out.push(`Fixed value: ${formatValue(schema.const)}`);
  }
  if (schema.format) out.push(`Format: ${schema.format}`);
  if (schema.pattern) out.push(`Pattern: ${schema.pattern}`);
  if (schema.minLength !== undefined || schema.maxLength !== undefined) {
    out.push(`Length: ${schema.minLength ?? 0}–${schema.maxLength ?? "unbounded"} characters`);
  }
  if (schema.minimum !== undefined || schema.maximum !== undefined) {
    out.push(`Range: ${schema.minimum ?? "unbounded"}–${schema.maximum ?? "unbounded"}`);
  }
  if (schema.minItems !== undefined) out.push(`Minimum items: ${schema.minItems}`);
  if (schema.maxItems !== undefined) out.push(`Maximum items: ${schema.maxItems}`);
  if (schema.uniqueItems) out.push("Items must be unique");
  if (schema.default !== undefined) out.push(`Default: ${formatValue(schema.default)}`);
  return out;
}

type RefInfo =
  | { kind: "vendor"; vendorFile: string }
  | { kind: "core-def"; defName: string }
  | { kind: "unknown" };

function classifyRef(ref: string): RefInfo {
  if (ref.startsWith("vendor/")) {
    return { kind: "vendor", vendorFile: ref.split("#")[0]! };
  }
  if (ref.startsWith(`${ENTRY_CORE_FILE}#/$defs/`) || ref.startsWith("#/$defs/")) {
    return { kind: "core-def", defName: ref.split("/$defs/")[1]! };
  }
  return { kind: "unknown" };
}

function resolveExternalRef(vendorFile: string): ExternalRef {
  const meta = VENDOR_INFO[vendorFile];
  return {
    label: meta?.label ?? vendorFile,
    href: repoBlobUrl(`schemas/${vendorFile}`),
    note: meta?.note ?? "Vendored upstream schema.",
  };
}

function resolveCoreDefRef(defName: string, currentFile: string): { node: WalkedNode } {
  const anchor = `def-${defName.toLowerCase()}`;
  const href = `${withBase("/specifications/entry-core/")}#${anchor}`;
  const internalDefRef: InternalDefRef = { label: `entry-core's ${defName} definition`, href };

  // On entry-core's own page, don't inline the definition a second time
  // inside the property row: the "Shared definitions" section below already
  // renders it in full, so the property row just links down to it.
  if (currentFile === ENTRY_CORE_FILE) {
    return { node: { typeLabel: "object", constraints: [], internalDefRef } };
  }

  const core = loadEntryCore();
  const def = (core.$defs?.[defName] as JSONSchema | undefined) ?? undefined;
  if (!def) return { node: { typeLabel: "object", constraints: [], internalDefRef } };

  const required = Array.isArray(def.required) ? (def.required as string[]) : [];
  const children = walkProperties(def.properties ?? {}, required, currentFile);
  return {
    node: {
      typeLabel: "object",
      constraints: [],
      children,
      openObject: !(def.unevaluatedProperties === false || def.additionalProperties === false),
      internalDefRef,
    },
  };
}

interface WalkedNode {
  typeLabel: string;
  constraints: string[];
  children?: FieldDoc[];
  openObject?: boolean;
  externalRef?: ExternalRef;
  internalDefRef?: InternalDefRef;
}

function mergeAllOfBranches(schema: JSONSchema): {
  properties: JSONSchema;
  required: string[];
  externalRef?: ExternalRef;
} {
  let externalRef: ExternalRef | undefined;
  const properties: JSONSchema = {};
  const required = new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const rest: JSONSchema = { ...schema };
  delete rest.allOf;
  const branches: JSONSchema[] = [...(schema.allOf as JSONSchema[]), rest];

  for (const branch of branches) {
    if (!branch || typeof branch !== "object") continue;
    if (typeof branch.$ref === "string") {
      const info = classifyRef(branch.$ref);
      if (info.kind === "vendor") externalRef = resolveExternalRef(info.vendorFile);
      continue;
    }
    if (branch.properties) Object.assign(properties, branch.properties);
    if (Array.isArray(branch.required)) for (const r of branch.required as string[]) required.add(r);
  }

  return { properties, required: [...required], externalRef };
}

function walkSchemaNode(schema: JSONSchema, currentFile: string): WalkedNode {
  if (typeof schema.$ref === "string") {
    const info = classifyRef(schema.$ref);
    if (info.kind === "vendor") {
      return { typeLabel: "object (embedded external schema)", constraints: [], externalRef: resolveExternalRef(info.vendorFile) };
    }
    if (info.kind === "core-def") return resolveCoreDefRef(info.defName, currentFile).node;
    return { typeLabel: "object", constraints: [] };
  }

  if (Array.isArray(schema.allOf)) {
    const merged = mergeAllOfBranches(schema);
    const children = Object.keys(merged.properties).length > 0 ? walkProperties(merged.properties, merged.required, currentFile) : undefined;
    return {
      typeLabel: merged.externalRef ? "object (embedded external schema + extension)" : "object",
      constraints: constraintsFor(schema),
      children,
      externalRef: merged.externalRef,
      openObject: !(schema.unevaluatedProperties === false || schema.additionalProperties === false),
    };
  }

  if (schema.type === "array") {
    const rawItems = schema.items as JSONSchema | JSONSchema[] | undefined;
    const itemsSchema = Array.isArray(rawItems) ? rawItems[0] : rawItems;
    const itemNode = itemsSchema ? walkSchemaNode(itemsSchema, currentFile) : undefined;
    return {
      typeLabel: itemNode ? `array of ${itemNode.typeLabel}` : "array",
      constraints: constraintsFor(schema),
      children: itemNode?.children,
      externalRef: itemNode?.externalRef,
      internalDefRef: itemNode?.internalDefRef,
      openObject: itemNode?.openObject,
    };
  }

  if (schema.type === "object" && schema.properties) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    return {
      typeLabel: "object",
      constraints: constraintsFor(schema),
      children: walkProperties(schema.properties, required, currentFile),
      openObject: !(schema.unevaluatedProperties === false || schema.additionalProperties === false),
    };
  }

  const typeLabel = typeof schema.type === "string" ? schema.type : schema.const !== undefined ? typeof schema.const : "object";
  return { typeLabel, constraints: constraintsFor(schema) };
}

function walkProperties(props: JSONSchema, required: string[], currentFile: string): FieldDoc[] {
  return Object.entries(props).map(([name, sub]) => {
    const subSchema = sub as JSONSchema;
    const node = walkSchemaNode(subSchema, currentFile);
    let description = subSchema.description as string | undefined;
    if (!description && subSchema.const !== undefined) {
      description = `Always ${formatValue(subSchema.const)} for entries of this type.`;
    }
    const field: FieldDoc = {
      name,
      required: required.includes(name),
      typeLabel: node.typeLabel,
      description,
      constraints: node.constraints,
    };
    if (node.children) field.children = node.children;
    if (node.openObject !== undefined) field.openObject = node.openObject;
    if (node.externalRef) field.externalRef = node.externalRef;
    if (node.internalDefRef) field.internalDefRef = node.internalDefRef;
    return field;
  });
}

function buildEntryCoreDoc(): SchemaDoc {
  const raw = loadEntryCore();
  const required = Array.isArray(raw.required) ? (raw.required as string[]) : [];
  const fields = walkProperties(raw.properties ?? {}, required, ENTRY_CORE_FILE);
  const defs: SchemaDefDoc[] = Object.entries((raw.$defs ?? {}) as JSONSchema).map(([name, def]) => {
    const d = def as JSONSchema;
    const dRequired = Array.isArray(d.required) ? (d.required as string[]) : [];
    return {
      name,
      anchor: `def-${name.toLowerCase()}`,
      description: d.description as string | undefined,
      fields: walkProperties(d.properties ?? {}, dRequired, ENTRY_CORE_FILE),
    };
  });

  return {
    slug: "entry-core",
    file: ENTRY_CORE_FILE,
    title: raw.title as string,
    description: raw.description as string,
    comment: raw.$comment as string | undefined,
    isCore: true,
    extendsCore: false,
    requiredTopLevel: required,
    inheritedRequiredOverrides: [],
    fields,
    defs,
    raw,
  };
}

function buildTypeSchemaDoc(slug: string, file: string): SchemaDoc {
  const raw = loadRaw(file);
  const branches: JSONSchema[] = Array.isArray(raw.allOf) ? raw.allOf : [];
  const coreRefBranch = branches[0] ?? {};
  const typeBranch = branches[1] ?? {};
  const extendsCore = typeof coreRefBranch.$ref === "string" && coreRefBranch.$ref.startsWith(ENTRY_CORE_FILE);
  const required = Array.isArray(typeBranch.required) ? (typeBranch.required as string[]) : [];
  const declaredNames = new Set(Object.keys((typeBranch.properties ?? {}) as JSONSchema));
  const inheritedRequiredOverrides = required.filter((r) => !declaredNames.has(r));
  const fields = walkProperties(typeBranch.properties ?? {}, required, file);

  return {
    slug,
    file,
    title: raw.title as string,
    description: raw.description as string,
    isCore: false,
    extendsCore,
    requiredTopLevel: required,
    inheritedRequiredOverrides,
    fields,
    defs: [],
    raw,
  };
}

export function getAllSchemaDocs(): SchemaDoc[] {
  return [buildEntryCoreDoc(), ...TYPE_SCHEMA_FILES.map((t) => buildTypeSchemaDoc(t.slug, t.file))];
}

export function getSchemaDoc(slug: string): SchemaDoc | undefined {
  if (slug === "entry-core") return buildEntryCoreDoc();
  const match = TYPE_SCHEMA_FILES.find((t) => t.slug === slug);
  return match ? buildTypeSchemaDoc(match.slug, match.file) : undefined;
}

export function firstSentence(text: string): string {
  const match = text.match(/^(.*?[.!?])(\s|$)/);
  return match ? match[1]! : text;
}
