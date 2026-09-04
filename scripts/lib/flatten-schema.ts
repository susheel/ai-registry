import { readFileSync } from "node:fs";
import path from "node:path";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { SCHEMAS_DIR } from "./schemas.js";

/**
 * Every schema in schemas/ declares an $id under this published base URL
 * (internal project documentation Section 2: "schemas/ is published alongside the site so
 * that $schema references... resolve to stable public URLs"), and JSON
 * Schema resolves a relative $ref against $id, not against the file's
 * on-disk location. Locally, that URL is not live yet (and even once it is,
 * codegen must not depend on network access), so this resolver redirects
 * any $ref under this base back to the corresponding file in schemas/.
 */
const GA4GH_SCHEMA_BASE = "https://ga4gh.github.io/ai-registry/schemas/";

/**
 * Dereferences and flattens a JSON Schema for Zod codegen (scripts/generate-zod-schemas.ts).
 *
 * `json-schema-to-zod` (the library internal project documentation picked for the Zod-codegen
 * step) does not resolve `$ref` at all, and -- despite `unevaluatedProperties`
 * appearing in its own TypeScript types -- does not actually implement it: an
 * `allOf`-composed schema is emitted as `z.intersection(A, B)` with no
 * strictness applied across the union of both branches' properties, which is
 * exactly the "silently looser than the JSON Schema" failure the local continuation-prompt file warned
 * about for entry-core.v1.schema.json's allOf-plus-unevaluatedProperties
 * composition pattern (internal project documentation Section 3.1). This module dereferences
 * every `$ref` (cross-file and internal, entry-core and both vendor schemas)
 * with @apidevtools/json-schema-ref-parser, then recursively merges every
 * `allOf` array (at any depth: the type schemas' own top-level allOf, and the
 * vendored server.schema.json's internal ServerDetail = allOf[Server, ...])
 * into one flat object schema per level, translating `unevaluatedProperties`
 * and `additionalProperties` into a single `additionalProperties` on the
 * merged shape -- which json-schema-to-zod DOES handle correctly, emitting
 * `.strict()`. The one `if`/`then` conditional in these schemas (entry-core's
 * license/license_url requirement, which has no `else` and so does not match
 * json-schema-to-zod's own conditional parser either) is detected and
 * reported back so the caller can append an explicit `.superRefine()` for it
 * rather than silently dropping it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONSchema = Record<string, any>;

export interface FlattenResult {
  schema: JSONSchema;
  /** True if a bare if/then (no else) conditional was found and dropped structurally. */
  droppedConditionals: JSONSchema[];
}

const COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf", "not", "if", "then", "else"];
const CARRY_KEYS = [
  "type",
  "enum",
  "const",
  "pattern",
  "format",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
  "description",
  "items",
];

function isPlainObject(value: unknown): value is JSONSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively flattens one schema node: resolves allOf composition, leaves
 * everything else (properties recursed into, anyOf/oneOf left for
 * json-schema-to-zod's own native handling, since those are real unions and
 * do not have the unevaluatedProperties strictness problem allOf has here). */
function flattenNode(node: unknown, dropped: JSONSchema[]): JSONSchema {
  if (!isPlainObject(node)) return node as JSONSchema;

  if (node.if && node.then && node.else === undefined) {
    dropped.push(node);
    return {};
  }

  if (Array.isArray(node.allOf)) {
    const merged: JSONSchema = {};
    let closed = false;
    const requiredUnion = new Set<string>();
    const propsUnion: JSONSchema = {};

    const branches = [...node.allOf, { ...node, allOf: undefined }];
    for (const rawBranch of branches) {
      const branch = flattenNode(rawBranch, dropped);
      if (!isPlainObject(branch)) continue;

      for (const key of CARRY_KEYS) {
        if (branch[key] !== undefined && merged[key] === undefined) merged[key] = branch[key];
      }
      if (isPlainObject(branch.properties)) {
        Object.assign(propsUnion, branch.properties);
      }
      if (Array.isArray(branch.required)) {
        for (const r of branch.required) requiredUnion.add(r);
      }
      if (branch.unevaluatedProperties === false || branch.additionalProperties === false) {
        closed = true;
      }
    }

    if (Object.keys(propsUnion).length > 0) merged.properties = propsUnion;
    if (requiredUnion.size > 0) merged.required = [...requiredUnion];
    if (closed) merged.additionalProperties = false;
    if (!merged.type && Object.keys(propsUnion).length > 0) merged.type = "object";
    return merged;
  }

  const result: JSONSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties" && isPlainObject(value)) {
      const newProps: JSONSchema = {};
      for (const [propKey, propSchema] of Object.entries(value)) {
        newProps[propKey] = flattenNode(propSchema, dropped);
      }
      result.properties = newProps;
    } else if (key === "items") {
      result.items = Array.isArray(value)
        ? value.map((v) => flattenNode(v, dropped))
        : flattenNode(value, dropped);
    } else if ((key === "anyOf" || key === "oneOf") && Array.isArray(value)) {
      result[key] = value.map((v) => flattenNode(v, dropped));
    } else if (key === "unevaluatedProperties") {
      if (value === false) result.additionalProperties = false;
      // unevaluatedProperties: <schema> (non-boolean) does not occur in this
      // repository's schemas and is intentionally not handled here.
    } else if (!COMPOSITION_KEYS.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

export async function dereferenceAndFlatten(absSchemaPath: string): Promise<FlattenResult> {
  const dereferenced = (await $RefParser.dereference(absSchemaPath, {
    dereference: { circular: "ignore" },
    resolve: {
      http: false,
      ga4ghLocal: {
        order: 1,
        canRead: (file: { url: string }) => file.url.startsWith(GA4GH_SCHEMA_BASE),
        read: (file: { url: string }) =>
          readFileSync(path.join(SCHEMAS_DIR, file.url.slice(GA4GH_SCHEMA_BASE.length)), "utf-8"),
      },
    },
  })) as JSONSchema;
  const droppedConditionals: JSONSchema[] = [];
  const schema = flattenNode(dereferenced, droppedConditionals);
  return { schema, droppedConditionals };
}
