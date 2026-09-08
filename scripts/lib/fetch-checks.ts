import type { ValidationIssue } from "./types.js";

export type FetchImpl = typeof fetch;

/**
 * The seven top-level keys the real GA4GH Model Card JSON Schema
 * (model-card/GA4GH-Model-Card.schema.json, sibling workspace, not vendored
 * here per the same reasoning as D13's refusal to vendor a Service Info
 * schema: owning a converted or duplicated copy of an evolving upstream
 * schema is a cost with no v1 benefit) marks required at its document root.
 * Used as a shallow structural check, not full schema validation, exactly as
 * D13 rule 2 shallow-checks Service Info's five required fields without
 * vendoring the OpenAPI document that defines them.
 */
const MODEL_CARD_REQUIRED_KEYS = [
  "model_details",
  "intended_use",
  "training_data_provenance",
  "population_representation",
  "evaluation",
  "duo_compliance",
  "provenance",
] as const;

const SUGGESTED_SERVICE_INFO_ENVIRONMENTS = ["prod", "test", "dev", "staging"];

/** TECH.md Section 9: HEAD-request reachability for homepage and repository. */
export async function checkUrlReachable(
  url: string,
  fieldName: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ValidationIssue[]> {
  try {
    const res = await fetchImpl(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) {
      return [
        {
          severity: "error",
          code: "url-unreachable",
          message: `${fieldName} (${url}) returned HTTP ${res.status}`,
          path: fieldName,
        },
      ];
    }
    return [];
  } catch (err) {
    return [
      {
        severity: "error",
        code: "url-unreachable",
        message: `${fieldName} (${url}) is unreachable: ${(err as Error).message}`,
        path: fieldName,
      },
    ];
  }
}

/**
 * TECH.md Section 9: "A model entry's model_card_uri fetches and parses as a
 * Model Card." No precise per-field rule set was written for this check the
 * way D13 wrote one for agent_info_uri, so this implementation makes an
 * explicit, narrow choice: GET the URI; if the body parses as JSON, assert
 * the seven Model Card root keys above are present (hard failure if not); if
 * it does not parse as JSON (a human-readable Markdown rendering, which is
 * how the Model Card most often ships today), require only a non-empty body
 * containing a recognisable "Model Card" heading. This is a shallower check
 * than D13's for agent_info_uri and is deliberately not equally deep. If a
 * future round of the standards research reaches a per-field rule set for
 * Model Card the way D13 did for Service Info, replace this function's body,
 * not its signature.
 */
export async function checkModelCardUri(
  url: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ValidationIssue[]> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", redirect: "follow" });
  } catch (err) {
    return [
      {
        severity: "error",
        code: "model-card-unreachable",
        message: `model_card_uri (${url}) is unreachable: ${(err as Error).message}`,
        path: "model_card_uri",
      },
    ];
  }
  if (!res.ok) {
    return [
      {
        severity: "error",
        code: "model-card-unreachable",
        message: `model_card_uri (${url}) returned HTTP ${res.status}`,
        path: "model_card_uri",
      },
    ];
  }

  const body = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  let parsedJson: unknown;
  if (contentType.includes("json")) {
    try {
      parsedJson = JSON.parse(body);
    } catch {
      // fall through to markdown-shaped check below
    }
  } else {
    try {
      parsedJson = JSON.parse(body);
    } catch {
      // not JSON; handled below
    }
  }

  if (parsedJson && typeof parsedJson === "object") {
    const missing = MODEL_CARD_REQUIRED_KEYS.filter(
      (key) => !(key in (parsedJson as Record<string, unknown>)),
    );
    if (missing.length > 0) {
      return [
        {
          severity: "error",
          code: "model-card-invalid",
          message: `model_card_uri (${url}) does not parse as a GA4GH Model Card: missing top-level key(s) ${missing.join(", ")}`,
          path: "model_card_uri",
        },
      ];
    }
    return [];
  }

  if (body.trim().length === 0) {
    return [
      {
        severity: "error",
        code: "model-card-invalid",
        message: `model_card_uri (${url}) returned an empty body`,
        path: "model_card_uri",
      },
    ];
  }
  if (!/model\s*card/i.test(body)) {
    return [
      {
        severity: "error",
        code: "model-card-invalid",
        message: `model_card_uri (${url}) does not look like a Model Card document (no "Model Card" heading found and body is not JSON)`,
        path: "model_card_uri",
      },
    ];
  }
  return [];
}

/**
 * Phase 11 (internal project documentation): a bundle entry's `marketplace` field is a cached
 * mirror of a vendor-maintained document, not a live feed (Section 3.5.6),
 * so it can drift silently once seeded -- nothing previously checked whether
 * `last_synced` still reflected reality. This follows checkAgentInfoUri's D13
 * rule-5 precedent exactly: GET source_uri, and warn (never fail) when the
 * live document no longer matches the embedded copy, since drift is expected
 * over time (an upstream marketplace adding a plugin is not this registry's
 * error) and must not fail CI merely because an upstream vendor shipped an
 * update. An unreachable or non-JSON source_uri is a harder failure than mere
 * staleness, mirroring checkModelCardUri's severity split for the same
 * reason: a source that has vanished or stopped serving JSON is a materially
 * different problem than a source that has simply moved on.
 */
export async function checkBundleFreshness(
  sourceUri: string,
  cachedMarketplace: unknown,
  fetchImpl: FetchImpl = fetch,
): Promise<ValidationIssue[]> {
  let res: Response;
  try {
    res = await fetchImpl(sourceUri, { method: "GET", redirect: "follow" });
  } catch (err) {
    return [
      {
        severity: "error",
        code: "bundle-source-unreachable",
        message: `source_uri (${sourceUri}) is unreachable: ${(err as Error).message}`,
        path: "source_uri",
      },
    ];
  }
  if (!res.ok) {
    return [
      {
        severity: "error",
        code: "bundle-source-unreachable",
        message: `source_uri (${sourceUri}) returned HTTP ${res.status}`,
        path: "source_uri",
      },
    ];
  }

  let live: unknown;
  try {
    live = await res.json();
  } catch (err) {
    return [
      {
        severity: "error",
        code: "bundle-source-invalid",
        message: `source_uri (${sourceUri}) did not return a parseable JSON body: ${(err as Error).message}`,
        path: "source_uri",
      },
    ];
  }

  if (!deepEqualIgnoringKeyOrder(live, cachedMarketplace)) {
    return [
      {
        severity: "warning",
        code: "bundle-marketplace-stale",
        message: `the embedded marketplace document no longer matches the live document at source_uri (${sourceUri}); last_synced is stale and this entry should be refreshed (scripts/check-bundle-freshness.ts)`,
        path: "marketplace",
      },
    ];
  }
  return [];
}

function deepEqualIgnoringKeyOrder(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

interface CachedAgentInfoSnapshot {
  protocol_version?: unknown;
  agent_type?: unknown;
  trust_level?: unknown;
  enrichment?: { gasl_level?: unknown };
}

/**
 * D13: GET agent_info_uri, assert the five GA4GH Service Info v1.0.0
 * required fields, assert a top-level agent_info_snapshot object, and warn (never
 * fail) on divergence between the live agent_info_snapshot and the entry's cached
 * block, limited to exactly four named paths per D13 rule 5.
 */
export async function checkAgentInfoUri(
  url: string,
  cachedSnapshot: CachedAgentInfoSnapshot,
  fetchImpl: FetchImpl = fetch,
): Promise<ValidationIssue[]> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", redirect: "follow" });
  } catch (err) {
    return [
      {
        severity: "error",
        code: "agent-info-unreachable",
        message: `agent_info_uri (${url}) is unreachable: ${(err as Error).message}`,
        path: "agent_info_uri",
      },
    ];
  }
  if (!res.ok) {
    return [
      {
        severity: "error",
        code: "agent-info-unreachable",
        message: `agent_info_uri (${url}) returned HTTP ${res.status}`,
        path: "agent_info_uri",
      },
    ];
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    return [
      {
        severity: "error",
        code: "agent-info-invalid",
        message: `agent_info_uri (${url}) did not return a parseable JSON body: ${(err as Error).message}`,
        path: "agent_info_uri",
      },
    ];
  }

  if (!body || typeof body !== "object") {
    return [
      {
        severity: "error",
        code: "agent-info-invalid",
        message: `agent_info_uri (${url}) body is not a JSON object`,
        path: "agent_info_uri",
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  const obj = body as Record<string, unknown>;

  // D13 rule 2: five GA4GH Service Info v1.0.0 required fields, type-correct.
  if (typeof obj["id"] !== "string") {
    issues.push(fail("Service Info response missing string field `id`"));
  }
  if (typeof obj["name"] !== "string") {
    issues.push(fail("Service Info response missing string field `name`"));
  }
  const type = obj["type"];
  if (
    !type ||
    typeof type !== "object" ||
    typeof (type as Record<string, unknown>)["group"] !== "string" ||
    typeof (type as Record<string, unknown>)["artifact"] !== "string" ||
    typeof (type as Record<string, unknown>)["version"] !== "string"
  ) {
    issues.push(
      fail(
        "Service Info response `type` must be an object with string `group`, `artifact`, and `version` (a bare string `type` is a hard failure)",
      ),
    );
  }
  const organization = obj["organization"];
  if (
    !organization ||
    typeof organization !== "object" ||
    typeof (organization as Record<string, unknown>)["name"] !== "string" ||
    typeof (organization as Record<string, unknown>)["url"] !== "string"
  ) {
    issues.push(
      fail("Service Info response `organization` must be an object with string `name` and `url`"),
    );
  }
  if (typeof obj["version"] !== "string") {
    issues.push(fail("Service Info response missing string field `version`"));
  }

  // D13 rule 3: environment is checked, never enforced as a closed enum.
  const environment = obj["environment"];
  if (environment !== undefined && !SUGGESTED_SERVICE_INFO_ENVIRONMENTS.includes(String(environment))) {
    issues.push({
      severity: "warning",
      code: "agent-info-environment-nonstandard",
      message: `agent_info_uri (${url}) reports environment "${String(environment)}", outside the suggested (not enforced) values ${SUGGESTED_SERVICE_INFO_ENVIRONMENTS.join(", ")}`,
      path: "agent_info_uri",
    });
  }

  // D13 rule 4: the extension block must exist if the entry claims one.
  const liveSnapshot = obj["agent_info_snapshot"];
  if (!liveSnapshot || typeof liveSnapshot !== "object") {
    issues.push(
      fail(
        `agent_info_uri (${url}) response carries no top-level agent_info_snapshot object, but this entry claims to mirror a live agent-info endpoint`,
      ),
    );
    return issues;
  }

  // D13 rule 5: cache-consistency warning on exactly four named paths.
  const live = liveSnapshot as Record<string, unknown>;
  const liveEnrichment = (live["enrichment"] as Record<string, unknown> | undefined) ?? {};
  const comparisons: Array<[string, unknown, unknown]> = [
    ["protocol_version", cachedSnapshot.protocol_version, live["protocol_version"]],
    ["agent_type", cachedSnapshot.agent_type, live["agent_type"]],
    ["trust_level", cachedSnapshot.trust_level, live["trust_level"]],
    ["enrichment.gasl_level", cachedSnapshot.enrichment?.gasl_level, liveEnrichment["gasl_level"]],
  ];
  for (const [field, cachedValue, liveValue] of comparisons) {
    if (cachedValue !== liveValue) {
      issues.push({
        severity: "warning",
        code: "agent-info-cache-divergence",
        message: `agent_info_snapshot.${field} diverges from the live endpoint: cached "${String(cachedValue)}", live "${String(liveValue)}"`,
        path: `agent_info_snapshot.${field}`,
      });
    }
  }

  return issues;

  function fail(message: string): ValidationIssue {
    return { severity: "error", code: "agent-info-invalid", message, path: "agent_info_uri" };
  }
}
