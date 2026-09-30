/**
 * Upstream ownership and version metadata (entry-core `upstream` object).
 *
 * `upstream.qualified_id` ("publisher/name@version") is derived, never
 * authored: this module is the single place that derives it, and the
 * validator, the index builder and the site all call it. An entry MAY carry a
 * stored `qualified_id`, but only as a cache the validator checks against
 * this derivation.
 */
import type { ValidationIssue } from "./types.js";

export const PUBLISHER_TYPES = [
  "github-org",
  "github-user",
  "huggingface-org",
  "huggingface-user",
  "npm",
  "organisation",
  "other",
] as const;

export const VERSION_SOURCES = [
  "github-release",
  "git-tag",
  "pypi",
  "npm",
  "huggingface-revision",
  "model-card",
  "commit",
] as const;

export interface UpstreamPublisher {
  id: string;
  name: string;
  type: (typeof PUBLISHER_TYPES)[number];
  url?: string;
}

export interface Upstream {
  publisher: UpstreamPublisher;
  name: string;
  version?: string | null;
  version_source?: (typeof VERSION_SOURCES)[number] | null;
  version_date?: string | null;
  qualified_id?: string;
}

/**
 * Lower-cases and trims one identifier segment and collapses internal
 * whitespace to a single hyphen, so "Google DeepMind " and "google-deepmind"
 * produce the same segment. Slashes and "@" are replaced too, because they
 * are the qualified id's own separators.
 */
export function normaliseSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/@]+/g, "-");
}

/** Trims a version; an empty or whitespace-only version counts as absent. */
export function normaliseVersion(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * "publisher/name@version", with "@version" omitted when there is no
 * version. Publisher id and name are normalised (lower case); the version is
 * kept as published apart from surrounding whitespace, since version strings
 * such as "1.0.0-RC1" are case-significant upstream.
 */
export function deriveQualifiedId(upstream: Pick<Upstream, "publisher" | "name" | "version">): string {
  const base = `${normaliseSegment(upstream.publisher.id)}/${normaliseSegment(upstream.name)}`;
  const version = normaliseVersion(upstream.version);
  return version === null ? base : `${base}@${version}`;
}

/** Narrowing guard: enough of an upstream object to derive a qualified id. */
export function readUpstream(entry: Record<string, unknown>): Upstream | undefined {
  const raw = entry["upstream"];
  if (!raw || typeof raw !== "object") return undefined;
  const upstream = raw as Partial<Upstream>;
  const publisher = upstream.publisher as Partial<UpstreamPublisher> | undefined;
  if (!publisher || typeof publisher.id !== "string" || typeof publisher.name !== "string") return undefined;
  if (typeof upstream.name !== "string") return undefined;
  return upstream as Upstream;
}

/** The entry's derived qualified id, or undefined when it has no usable upstream block. */
export function qualifiedIdFor(entry: Record<string, unknown>): string | undefined {
  const upstream = readUpstream(entry);
  return upstream ? deriveQualifiedId(upstream) : undefined;
}

/**
 * Offline checks on `upstream`, beyond what the JSON Schema enforces:
 *   - absent: a warning (optional for now, expected for every entry later);
 *   - a stored qualified_id that disagrees with the derivation: an error;
 *   - version_source or version_date set without a version: an error;
 *   - a version without a version_source: a warning.
 */
export function checkUpstream(entry: Record<string, unknown>): ValidationIssue[] {
  if (entry["upstream"] === undefined) {
    return [
      {
        severity: "warning",
        code: "upstream-missing",
        message: "no upstream block (publisher, upstream name and version); it will become required",
        path: "upstream",
      },
    ];
  }
  const upstream = readUpstream(entry);
  if (!upstream) return []; // shape errors are reported by schema validation
  const issues: ValidationIssue[] = [];
  const derived = deriveQualifiedId(upstream);
  if (upstream.qualified_id !== undefined && upstream.qualified_id !== derived) {
    issues.push({
      severity: "error",
      code: "upstream-qualified-id-mismatch",
      message: `upstream.qualified_id "${upstream.qualified_id}" does not match the derived value "${derived}"; remove it or correct it (it is derived at build time)`,
      path: "upstream.qualified_id",
    });
  }
  const version = normaliseVersion(upstream.version);
  if (version === null && (upstream.version_source ?? null) !== null) {
    issues.push({
      severity: "error",
      code: "upstream-version-inconsistent",
      message: "upstream.version_source is set but upstream.version is null",
      path: "upstream.version_source",
    });
  }
  if (version === null && (upstream.version_date ?? null) !== null) {
    issues.push({
      severity: "error",
      code: "upstream-version-inconsistent",
      message: "upstream.version_date is set but upstream.version is null",
      path: "upstream.version_date",
    });
  }
  if (version !== null && (upstream.version_source ?? null) === null) {
    issues.push({
      severity: "warning",
      code: "upstream-version-source-missing",
      message: `upstream.version "${version}" has no version_source saying where it was read from`,
      path: "upstream.version_source",
    });
  }
  return issues;
}
