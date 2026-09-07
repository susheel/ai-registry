/**
 * scripts/lib/parse-issue-submission.ts -- turns the field map GitHub's issue
 * forms plus `stefanbuck/github-issue-parser` produce into a candidate JSON
 * record shaped like `schemas/<type>-entry.v1.schema.json`, for
 * `validateFiles()` (scripts/validate.ts) to check (internal project documentation Section 6,
 * Workflow 1). This is the "how issue-form fields become a candidate JSON
 * record" decision `the local continuation-prompt file` named as open for this phase; see this
 * module's own tests for the exact per-field conventions.
 *
 * **Field-shape conventions**, applied uniformly across all five issue forms
 * (`.github/ISSUE_TEMPLATE/submit-*.yml`), and documented again in each
 * field's own form description so a submitter sees the convention at the
 * point of typing, not only here:
 * - A scalar schema field (a string, a URI, an enum) is one issue-form field
 *   of the matching native type (input, textarea, or dropdown).
 * - A schema array-of-strings field (`keywords`, `ga4gh_standards`, `tags`,
 *   the plugin `ga4gh.keywords`) is one comma-separated issue-form field.
 * - A schema array-of-small-objects field (`maintainers`, the common core's
 *   `safety_classification`, a skill's `inputs`/`outputs`, a plugin's
 *   `ga4gh.harnesses`) is one multi-line textarea, one comma-separated row
 *   per array item, in a fixed column order documented on the field itself.
 *   This scales to an arbitrary number of maintainers or safety
 *   classifications without a hard form-field cap, unlike a fixed set of
 *   "Maintainer 1", "Maintainer 2", ... fields would.
 * - A schema field that is itself a large, independently-authored upstream
 *   document (a skill's `skill` object, an mcp-server's `server` object, a
 *   plugin's `plugin` object, an agent's `agent_info_snapshot` block copied from its
 *   own live `/service-info` response) is one "paste the JSON you already
 *   have" textarea, parsed with `JSON.parse` and inserted at the matching
 *   key verbatim. A submitter publishing an MCP server or a Claude Code
 *   plugin already has this exact document sitting in their own repository
 *   (it is the same file they would publish to the upstream registry
 *   unmodified, per internal project documentation Section 3.1's lift-out-ability
 *   requirement) or, for `agent_info_snapshot`, already has it as the literal response
 *   body of their agent's own live endpoint -- decomposing either into
 *   dozens of individual form fields would not make submission easier, only
 *   more error-prone by making the submitter re-type values GitHub Issue
 *   Forms cannot express as nested objects in any case.
 *
 * `github-issue-parser` renders an unanswered optional field's value as the
 * literal string `_No response_`; `isBlank` normalises that (and a bare
 * empty string) to "not provided" throughout this module.
 */
import type { AnyEntry, EntryType } from "./types.js";

export interface ParseContext {
  /** The GitHub issue number this submission came from, stamped into the
   * placeholder `record.source_issue` (see `buildPlaceholderRecord`'s own
   * comment for why the rest of `record` is only a placeholder here). */
  issueNumber: number;
  /** Injectable clock for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

export type ParseResult = { ok: true; record: AnyEntry } | { ok: false; errors: string[] };

function isBlank(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed === "_No response_";
}

function field(fields: Record<string, string>, id: string): string | undefined {
  const value = fields[id];
  if (value === undefined || isBlank(value)) return undefined;
  return value.trim();
}

function parseCsv(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function parseRows(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split("\n")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function rowColumns(row: string): string[] {
  return row.split(",").map((c) => c.trim());
}

/**
 * Every new entry's real `record.created`/`updated`/`last_verified` is the
 * date it is actually merged to `data/` (internal project documentation Section 3.2), which
 * Workflow 1 cannot know yet -- the submission may sit in `needs-changes` for
 * days, and merge happens only after both human gates. This placeholder
 * exists solely so `validateFiles()` has a schema-complete candidate to
 * check at Workflow 1 time (a submission missing `record` entirely would
 * fail schema validation on a field no submitter can fill in, which is not
 * a useful error to show them). `promote-to-pr.yml` (Workflow 2) MUST
 * overwrite all three date fields with fresh timestamps at the moment it
 * actually writes `data/<type>/<slug>.json`, never reuse these.
 */
function buildPlaceholderRecord(context: ParseContext): AnyEntry["record"] {
  const now = (context.now ?? new Date()).toISOString();
  return { created: now, updated: now, last_verified: now, source_issue: context.issueNumber };
}

function buildMaintainers(value: string | undefined, errors: string[]): Array<Record<string, string>> {
  const rows = parseRows(value);
  return rows
    .map((row, i) => {
      const [name, github, affiliation, orcid] = rowColumns(row);
      if (!name || !github) {
        errors.push(`maintainers row ${i + 1} ("${row}") must have at least "name, github"`);
        return undefined;
      }
      const maintainer: Record<string, string> = { name, github };
      if (affiliation) maintainer.affiliation = affiliation;
      if (orcid) maintainer.orcid = orcid;
      return maintainer;
    })
    .filter((m): m is Record<string, string> => m !== undefined);
}

function buildSafetyClassification(value: string | undefined, errors: string[]): Array<Record<string, string>> {
  const rows = parseRows(value);
  return rows
    .map((row, i) => {
      const [scheme, level, source, certifying_body, evaluation_date, valid_until, evidence_uri] = rowColumns(row);
      if (!scheme || !level || !source) {
        errors.push(`safety_classification row ${i + 1} ("${row}") must have at least "scheme, level, source"`);
        return undefined;
      }
      const classification: Record<string, string> = { scheme, level, source };
      if (certifying_body) classification.certifying_body = certifying_body;
      if (evaluation_date) classification.evaluation_date = evaluation_date;
      if (valid_until) classification.valid_until = valid_until;
      if (evidence_uri) classification.evidence_uri = evidence_uri;
      return classification;
    })
    .filter((c): c is Record<string, string> => c !== undefined);
}

function buildNamedTypedItems(value: string | undefined): Array<Record<string, string>> {
  return parseRows(value).map((row) => {
    const [name, type, description] = rowColumns(row);
    const item: Record<string, string> = { name: name ?? row };
    if (type) item.type = type;
    if (description) item.description = description;
    return item;
  });
}

function buildHarnesses(value: string | undefined, errors: string[]): Array<Record<string, unknown>> {
  const rows = parseRows(value);
  return rows
    .map((row, i) => {
      const [harness, installCommand, manifestPath, minVersion, maxVersion] = rowColumns(row);
      if (!harness || !installCommand) {
        errors.push(`ga4gh.harnesses row ${i + 1} ("${row}") must have at least "harness, installCommand"`);
        return undefined;
      }
      const entry: Record<string, unknown> = { harness, installCommand };
      if (manifestPath) entry.manifestPath = manifestPath;
      if (minVersion) entry.compatibility = maxVersion ? { minVersion, maxVersion } : { minVersion };
      return entry;
    })
    .filter((h): h is Record<string, unknown> => h !== undefined);
}

function parseJsonField(value: string | undefined, label: string, errors: string[]): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    errors.push(`"${label}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/** Common-core fields shared by every type (internal project documentation Section 3.2).
 * `certification_tier` is never read from `fields`: no issue form offers it,
 * and this function always injects "unsigned" regardless, so a submission
 * can never arrive claiming anything else (internal project documentation Section 5.4). */
function buildCommonCore(fields: Record<string, string>, context: ParseContext, errors: string[]): AnyEntry {
  const core: AnyEntry = {
    id: field(fields, "id"),
    name: field(fields, "name"),
    summary: field(fields, "summary"),
    description: field(fields, "description"),
    homepage: field(fields, "homepage"),
    repository: field(fields, "repository"),
    license: field(fields, "license"),
    version: field(fields, "version"),
    category: field(fields, "category"),
    keywords: parseCsv(field(fields, "keywords")),
    maintainers: buildMaintainers(field(fields, "maintainers"), errors),
    safety_classification: buildSafetyClassification(field(fields, "safety_classification"), errors),
    certification_tier: "unsigned",
    record: buildPlaceholderRecord(context),
  };
  const licenseUrl = field(fields, "license_url");
  if (licenseUrl) core.license_url = licenseUrl;
  const standards = parseCsv(field(fields, "ga4gh_standards"));
  if (standards.length > 0) core.ga4gh_standards = standards;
  return core;
}

function buildModel(fields: Record<string, string>): AnyEntry {
  const model: AnyEntry = { type: "model", model_card_uri: field(fields, "model_card_uri") };
  const optional = [
    "pipeline_tag",
    "library_name",
    "base_model",
    "intended_domain",
    "developed_by",
    "release_date",
    "hosting_location",
    "access_uri",
    "install_command",
    "recommended_version",
  ];
  for (const key of optional) {
    const value = field(fields, key);
    if (value) model[key] = value;
  }
  const tags = parseCsv(field(fields, "tags"));
  if (tags.length > 0) model.tags = tags;
  return model;
}

function buildAgent(fields: Record<string, string>, errors: string[]): AnyEntry {
  const agent: AnyEntry = {
    type: "agent",
    agent_info_uri: field(fields, "agent_info_uri"),
    agent_info_snapshot: parseJsonField(field(fields, "agent_info_snapshot"), "agent_info_snapshot", errors),
  };
  const alignmentCardUri = field(fields, "alignment_card_uri");
  if (alignmentCardUri) agent.alignment_card_uri = alignmentCardUri;
  return agent;
}

function buildSkill(fields: Record<string, string>, errors: string[]): AnyEntry {
  const repositoryUrl = field(fields, "source_repository_url");
  const subfolder = field(fields, "source_repository_subfolder");
  const skill: AnyEntry = {
    type: "skill",
    skill: parseJsonField(field(fields, "skill"), "skill", errors),
    source: { repository: subfolder ? { url: repositoryUrl, subfolder } : { url: repositoryUrl } },
    inputs: buildNamedTypedItems(field(fields, "inputs")),
    outputs: buildNamedTypedItems(field(fields, "outputs")),
    human_oversight: field(fields, "human_oversight"),
    provenance_logging: field(fields, "provenance_logging")?.toLowerCase() === "true",
    evaluation_criteria_uri: field(fields, "evaluation_criteria_uri"),
  };
  return skill;
}

function buildMcpServer(fields: Record<string, string>, errors: string[]): AnyEntry {
  return {
    type: "mcp-server",
    server: parseJsonField(field(fields, "server"), "server", errors),
  };
}

function buildPlugin(fields: Record<string, string>, errors: string[]): AnyEntry {
  const ga4gh: Record<string, unknown> = { harnesses: buildHarnesses(field(fields, "ga4gh_harnesses"), errors) };
  const ga4ghKeywords = parseCsv(field(fields, "ga4gh_keywords"));
  if (ga4ghKeywords.length > 0) ga4gh.keywords = ga4ghKeywords;
  const ga4ghCategory = field(fields, "ga4gh_category");
  if (ga4ghCategory) ga4gh.category = ga4ghCategory;
  return {
    type: "plugin",
    plugin: parseJsonField(field(fields, "plugin"), "plugin", errors),
    ga4gh,
  };
}

/**
 * ga4gh.members[] (cross-references to entries already catalogued elsewhere
 * in this registry) is deliberately not a submission-form field: a
 * submitter proposing a bundle has no reliable way to know which of that
 * bundle's plugins already have their own registry slug, and guessing wrong
 * would fail scripts/validate.ts's member cross-reference check for a reason
 * the submitter cannot fix themselves. A maintainer curates members[] as a
 * follow-up edit once the bundle entry exists (internal project documentation Phase 10).
 */
function buildBundle(fields: Record<string, string>, errors: string[]): AnyEntry {
  const bundle: AnyEntry = {
    type: "bundle",
    marketplace: parseJsonField(field(fields, "marketplace"), "marketplace", errors),
    source_uri: field(fields, "source_uri"),
  };
  const ga4ghKeywords = parseCsv(field(fields, "ga4gh_keywords"));
  if (ga4ghKeywords.length > 0) bundle.ga4gh = { keywords: ga4ghKeywords };
  return bundle;
}

/**
 * Builds a candidate entry record from an issue form's parsed field map.
 * Returns `{ok: false, errors}` only for malformed input this module itself
 * detects (a JSON-paste field that fails to parse, a structured-textarea row
 * missing its required leading columns); every other shape problem (a
 * missing required field, an invalid enum value, a bad URI) is left for
 * `validateFiles()` to report, since that is the one place schema errors are
 * already rendered consistently (internal project documentation Section 6, Workflow 1).
 */
export function parseIssueSubmission(type: EntryType, fields: Record<string, string>, context: ParseContext): ParseResult {
  const errors: string[] = [];
  const core = buildCommonCore(fields, context, errors);

  let typeFields: AnyEntry;
  switch (type) {
    case "model":
      typeFields = buildModel(fields);
      break;
    case "agent":
      typeFields = buildAgent(fields, errors);
      break;
    case "skill":
      typeFields = buildSkill(fields, errors);
      break;
    case "mcp-server":
      typeFields = buildMcpServer(fields, errors);
      break;
    case "plugin":
      typeFields = buildPlugin(fields, errors);
      break;
    case "bundle":
      typeFields = buildBundle(fields, errors);
      break;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, record: { ...core, ...typeFields } };
}
