import { getValidatorForType } from "./schemas.js";
import {
  getAllowedCategoryIds,
  getAllowedHarnessIds,
  getAllowedLicenseIds,
} from "./vocab.js";
import {
  checkAgentInfoUri,
  checkBundleFreshness,
  checkModelCardUri,
  checkUrlReachable,
  type FetchImpl,
} from "./fetch-checks.js";
import type { AnyEntry, EntryType, ValidationIssue } from "./types.js";

export function validateSchema(entry: unknown, type: EntryType): ValidationIssue[] {
  const validate = getValidatorForType(type);
  const ok = validate(entry);
  if (ok) return [];
  return (validate.errors ?? []).map((err) => ({
    severity: "error",
    code: "schema",
    message: `${err.instancePath || "/"} ${err.message ?? "failed schema validation"}`.trim(),
    path: err.instancePath || "/",
  }));
}

/** TECH.md Section 3.2: license must be the "other" escape hatch (schema already
 * requires license_url in that case) or a member of the SPDX allow-list. */
export function checkLicense(entry: AnyEntry): ValidationIssue[] {
  if (typeof entry.license !== "string") return [];
  if (entry.license === "other") return [];
  if (!getAllowedLicenseIds().has(entry.license)) {
    return [
      {
        severity: "error",
        code: "license-not-allowed",
        message: `license "${entry.license}" is not on the SPDX allow-list (schemas/vocab/licenses.json) and is not "other"`,
        path: "license",
      },
    ];
  }
  return [];
}

/** TECH.md Section 3.6: category vocabulary membership, per type. Plugin
 * entries are free text in v1 and have no vocab file to check against. */
export function checkCategory(entry: AnyEntry, type: EntryType): ValidationIssue[] {
  const allowed = getAllowedCategoryIds(type);
  if (!allowed) return [];
  if (typeof entry.category !== "string") return [];
  if (!allowed.has(entry.category)) {
    return [
      {
        severity: "error",
        code: "category-not-allowed",
        message: `category "${entry.category}" is not in schemas/vocab/categories/${type}.json`,
        path: "category",
      },
    ];
  }
  return [];
}

/**
 * D14: for mcp-server entries, stripping any @<version> suffix from
 * server._meta["org.ga4gh/ai-registry"].ga4gh_standards[] MUST yield a
 * subset of the common core's ga4gh_standards[].
 */
export function checkGa4ghStandardsSubset(entry: AnyEntry, type: EntryType): ValidationIssue[] {
  if (type !== "mcp-server") return [];
  const server = entry.server as Record<string, unknown> | undefined;
  const meta = server?.["_meta"] as Record<string, unknown> | undefined;
  const ga4ghMeta = meta?.["org.ga4gh/ai-registry"] as Record<string, unknown> | undefined;
  const metaStandards = ga4ghMeta?.["ga4gh_standards"];
  const coreStandards = entry.ga4gh_standards;

  if (!Array.isArray(metaStandards) || !Array.isArray(coreStandards)) {
    // Schema validation already requires both arrays to exist and enforces
    // their shape; if either is missing/malformed, schema errors cover it.
    return [];
  }

  const coreSet = new Set(coreStandards as string[]);
  const missing = (metaStandards as string[])
    .map((item) => item.split("@")[0] ?? item)
    .filter((bareId) => !coreSet.has(bareId));

  if (missing.length > 0) {
    return [
      {
        severity: "error",
        code: "ga4gh-standards-not-subset",
        message: `server._meta["org.ga4gh/ai-registry"].ga4gh_standards[] claims standard(s) [${[...new Set(missing)].join(", ")}] not present (version-stripped) in the common core's ga4gh_standards[]`,
        path: 'server._meta["org.ga4gh/ai-registry"].ga4gh_standards',
      },
    ];
  }
  return [];
}

/**
 * D21 (internal project documentation): skill-entry
 * host_runtimes[] is vocab-backed against the same closed harness enumeration
 * plugin entries use (schemas/vocab/harnesses.json), enforced here rather
 * than as a schema enum, matching checkCategory's/checkLicense's existing
 * convention of keeping the vocab file, not the schema, as the source of
 * truth for a value that can grow without a schema change.
 */
export function checkHostRuntimes(entry: AnyEntry, type: EntryType): ValidationIssue[] {
  if (type !== "skill") return [];
  const hostRuntimes = entry.host_runtimes;
  if (!Array.isArray(hostRuntimes)) return [];
  const allowed = getAllowedHarnessIds();
  const disallowed = hostRuntimes.filter(
    (value): value is string => typeof value === "string" && !allowed.has(value),
  );
  if (disallowed.length === 0) return [];
  return [
    {
      severity: "error",
      code: "host-runtime-not-allowed",
      message: `host_runtimes[] value(s) [${[...new Set(disallowed)].join(", ")}] not in schemas/vocab/harnesses.json`,
      path: "host_runtimes",
    },
  ];
}

/**
 * D20 (internal project documentation): reject
 * zero-width, bidi-control, and Unicode Tag characters in submitter-authored
 * free-text fields. These characters render invisibly (or, for bidi
 * overrides, can visually reorder surrounding text) and have no legitimate
 * use in a name/summary/description/keyword, but are a known
 * prompt-injection/ASCII-smuggling vector against agents that read registry
 * entries verbatim (ga4gh_ai_registry_get/_search). This is a warn-once
 * character-class denylist, not a full homoglyph/confusables check, which
 * would need a much larger reference table and risks false positives on
 * legitimate non-Latin text.
 */
// Zero-width/joiner (U+200B-200F), bidi embedding/override (U+202A-202E),
// invisible-operator/directional-isolate block (U+2060-206F), BOM/ZWNBSP
// (U+FEFF), and the Unicode Tags block (U+E0000-E007F) used in
// ASCII-smuggling payloads. Every codepoint is a plain backslash-u escape
// sequence below, never a literal pasted glyph, so this file stays plain
// ASCII end to end and is safe to review as text.
const HIDDEN_UNICODE_PATTERN =
  /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u{E0000}-\u{E007F}]/u;

function findHiddenUnicode(value: string): boolean {
  return HIDDEN_UNICODE_PATTERN.test(value);
}

export function checkHiddenUnicode(entry: AnyEntry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const scalarFields = ["name", "summary", "description"] as const;
  for (const field of scalarFields) {
    const value = entry[field];
    if (typeof value === "string" && findHiddenUnicode(value)) {
      issues.push({
        severity: "error",
        code: "hidden-unicode",
        message: `${field} contains a zero-width, bidi-control, or Unicode Tag character, which is not permitted in a free-text field`,
        path: field,
      });
    }
  }
  const keywords = entry.keywords;
  if (Array.isArray(keywords)) {
    const flagged = keywords.filter(
      (kw): kw is string => typeof kw === "string" && findHiddenUnicode(kw),
    );
    if (flagged.length > 0) {
      issues.push({
        severity: "error",
        code: "hidden-unicode",
        message: `keywords[] entry contains a zero-width, bidi-control, or Unicode Tag character, which is not permitted`,
        path: "keywords",
      });
    }
  }
  return issues;
}

export interface NetworkCheckOptions {
  skipNetwork: boolean;
  fetchImpl?: FetchImpl;
}

/**
 * TECH.md Section 9 CI checks: HEAD reachability for homepage/repository, and
 * the deeper cross-reference checks for model_card_uri (model), agent_info_uri
 * (agent, D13), and source_uri freshness (bundle, Phase 11). The mcp-server
 * `server` and plugin `plugin` cross-reference checks are covered by schema
 * validation itself, since both documents are embedded and validated via
 * $ref to the vendored schemas rather than fetched by URI.
 */
export async function runNetworkChecks(
  entry: AnyEntry,
  type: EntryType,
  options: NetworkCheckOptions,
): Promise<ValidationIssue[]> {
  if (options.skipNetwork) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const issues: ValidationIssue[] = [];

  if (typeof entry.homepage === "string") {
    issues.push(...(await checkUrlReachable(entry.homepage, "homepage", fetchImpl)));
  }
  if (typeof entry.repository === "string") {
    issues.push(...(await checkUrlReachable(entry.repository, "repository", fetchImpl)));
  }

  if (type === "model" && typeof entry.model_card_uri === "string") {
    issues.push(...(await checkModelCardUri(entry.model_card_uri, fetchImpl)));
  }

  if (type === "bundle" && typeof entry.source_uri === "string") {
    issues.push(...(await checkBundleFreshness(entry.source_uri, entry.marketplace, fetchImpl)));
  }

  if (type === "agent" && typeof entry.agent_info_uri === "string") {
    const cachedSnapshot = (entry.agent_info_snapshot ?? {}) as Record<string, unknown>;
    issues.push(
      ...(await checkAgentInfoUri(
        entry.agent_info_uri,
        {
          protocol_version: cachedSnapshot["protocol_version"],
          agent_type: cachedSnapshot["agent_type"],
          trust_level: cachedSnapshot["trust_level"],
          enrichment: cachedSnapshot["enrichment"] as { gasl_level?: unknown } | undefined,
        },
        fetchImpl,
      )),
    );
  }

  return issues;
}

/** All offline (no-network) checks for a single entry, given its declared type. */
export function validateEntryOffline(entry: AnyEntry, type: EntryType): ValidationIssue[] {
  return [
    ...validateSchema(entry, type),
    ...checkLicense(entry),
    ...checkCategory(entry, type),
    ...checkGa4ghStandardsSubset(entry, type),
    ...checkHostRuntimes(entry, type),
    ...checkHiddenUnicode(entry),
  ];
}
