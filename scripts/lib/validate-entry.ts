import { getValidatorForType } from "./schemas.js";
import {
  getAllowedCategoryIds,
  getAllowedLicenseIds,
} from "./vocab.js";
import { checkAgentInfoUri, checkModelCardUri, checkUrlReachable, type FetchImpl } from "./fetch-checks.js";
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

export interface NetworkCheckOptions {
  skipNetwork: boolean;
  fetchImpl?: FetchImpl;
}

/**
 * TECH.md Section 9 CI checks: HEAD reachability for homepage/repository, and
 * the deeper cross-reference checks for model_card_uri (model) and
 * agent_info_uri (agent, D13). The mcp-server `server` and plugin `plugin`
 * cross-reference checks are covered by schema validation itself, since both
 * documents are embedded and validated via $ref to the vendored schemas
 * rather than fetched by URI.
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
  ];
}
