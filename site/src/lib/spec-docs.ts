/**
 * Metadata for the prose companion specifications in `spec/*.md` (see
 * `spec/README.md`), rendered at `/spec/`. These are prose companions to the
 * JSON Schema documents rendered at `/specifications/` (schema-docs.ts), not
 * a replacement for them: every spec slug here pairs with exactly one schema
 * slug there, `entry-core` with itself and the six per-type specs with their
 * matching `*-entry` schema.
 */
import { firstSentence } from "./schema-docs.js";

/** Display order for the /spec/ index, matching spec/README.md's own table. */
export const SPEC_ORDER: readonly string[] = [
  "entry-core",
  "model-card",
  "agent-card",
  "skill-card",
  "mcp-server-card",
  "plugin-card",
  "bundle",
];

const SPEC_TO_SCHEMA_SLUG: Record<string, string> = {
  "entry-core": "entry-core",
  "model-card": "model-entry",
  "agent-card": "agent-entry",
  "skill-card": "skill-entry",
  "mcp-server-card": "mcp-server-entry",
  "plugin-card": "plugin-entry",
  bundle: "bundle-entry",
};

const SCHEMA_TO_SPEC_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SPEC_TO_SCHEMA_SLUG).map(([specSlug, schemaSlug]) => [schemaSlug, specSlug]),
);

export function specOrderIndex(slug: string): number {
  const i = SPEC_ORDER.indexOf(slug);
  return i === -1 ? SPEC_ORDER.length : i;
}

/** The `/specifications/<slug>/` page this spec slug's normative schema lives at. */
export function schemaSlugForSpec(specSlug: string): string | undefined {
  return SPEC_TO_SCHEMA_SLUG[specSlug];
}

/** The `/spec/<slug>/` page that documents this schema slug in prose, if one exists. */
export function specSlugForSchema(schemaSlug: string): string | undefined {
  return SCHEMA_TO_SPEC_SLUG[schemaSlug];
}

/**
 * Extracts the first sentence of a spec doc's "## 1. Purpose" section, for use
 * as a one-line summary on the /spec/ index page. Every file in spec/*.md
 * opens that section with "This document specifies...", so a heading-bounded
 * slice plus firstSentence() (reused from schema-docs.ts, which already does
 * the same job for JSON Schema `description` strings) is reliable here
 * without a separate markdown parse pass.
 */
export function purposeSummary(body: string): string {
  const match = body.match(/##\s*1\.\s*Purpose\s*\n+([\s\S]*?)(\n##\s|$)/);
  const section = match ? match[1]! : body;
  return firstSentence(section.trim()).replace(/`/g, "");
}
