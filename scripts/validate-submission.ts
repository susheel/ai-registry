#!/usr/bin/env tsx
/**
 * scripts/validate-submission.ts -- the entry point `validate-submission.yml`
 * (Workflow 1, internal project documentation Section 6) and `validate-pr.yml` (Workflow 3, for
 * an issue-originated PR body) invoke to turn a parsed issue-form field map
 * into a candidate record, run the same checks `pnpm validate` runs, and
 * emit one JSON object a workflow step can render as an issue comment.
 *
 * Every value this script reads comes from `process.env`, never from a CLI
 * argument interpolated into a shell string: internal project documentation Section 6 requires
 * every parsed issue value to pass through `env:`, never `run:`
 * interpolation, as GitHub's own script-injection hardening guidance
 * describes. The calling workflow step sets:
 *
 *   ISSUE_TYPE          one of model | agent | skill | mcp-server | plugin
 *   ISSUE_NUMBER        the originating issue number, as a string
 *   ISSUE_FIELDS_JSON   the JSON object stefanbuck/github-issue-parser's
 *                       `jsonString` output produces: { <field-id>: <value> }
 *
 * Output (stdout, one JSON object, always): {"ok": boolean, "parseErrors":
 * string[], "validation": EntryValidationResult | null, "record": object |
 * null}. `record` is included on a parse success (even if schema validation
 * then fails) so the calling workflow can still render a preview of what was
 * submitted alongside the errors. Exit code is 0 only when `ok` is true.
 *
 * Usage: ISSUE_TYPE=model ISSUE_NUMBER=42 ISSUE_FIELDS_JSON='{...}' \
 *          tsx scripts/validate-submission.ts
 */
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIssueSubmission } from "./lib/parse-issue-submission.js";
import { validateFiles, allResultsOk } from "./validate.js";
import { ENTRY_TYPES, type EntryType, type EntryValidationResult, type AnyEntry } from "./lib/types.js";

export interface SubmissionCheckInput {
  type: string;
  issueNumber: number;
  fieldsJson: string;
  /** Defaults to false (full network checks, matching Workflow 1's real
   * behaviour). Tests set this to true to stay offline and deterministic. */
  skipNetwork?: boolean;
}

export interface SubmissionCheckResult {
  ok: boolean;
  parseErrors: string[];
  validation: EntryValidationResult | null;
  record: AnyEntry | null;
}

function isEntryType(value: string): value is EntryType {
  return (ENTRY_TYPES as readonly string[]).includes(value);
}

/**
 * The reusable core, independent of environment variables and process I/O,
 * so it is directly unit-testable (internal project documentation Phase 4's verification
 * decision: unit-test workflow logic as plain functions, not only via a live
 * GitHub Actions run this repository cannot trigger without a remote).
 */
export async function runSubmissionCheck(input: SubmissionCheckInput): Promise<SubmissionCheckResult> {
  if (!isEntryType(input.type)) {
    return { ok: false, parseErrors: [`unrecognised ISSUE_TYPE "${input.type}"`], validation: null, record: null };
  }

  let fields: Record<string, string>;
  try {
    fields = JSON.parse(input.fieldsJson) as Record<string, string>;
  } catch (err) {
    return {
      ok: false,
      parseErrors: [`ISSUE_FIELDS_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`],
      validation: null,
      record: null,
    };
  }

  const parsed = parseIssueSubmission(input.type, fields, { issueNumber: input.issueNumber });
  if (!parsed.ok) {
    return { ok: false, parseErrors: parsed.errors, validation: null, record: null };
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "ai-registry-submission-"));
  const tempFile = path.join(tempDir, `${typeof parsed.record.id === "string" ? parsed.record.id : "candidate"}.json`);
  try {
    await writeFile(tempFile, JSON.stringify(parsed.record, null, 2), "utf-8");
    const [validation] = await validateFiles([tempFile], { skipNetwork: input.skipNetwork ?? false });
    return {
      ok: validation !== undefined && allResultsOk([validation]),
      parseErrors: [],
      validation: validation ?? null,
      record: parsed.record,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const type = process.env.ISSUE_TYPE ?? "";
  const issueNumber = Number(process.env.ISSUE_NUMBER ?? "");
  const fieldsJson = process.env.ISSUE_FIELDS_JSON ?? "";

  if (!type || !Number.isInteger(issueNumber) || !fieldsJson) {
    console.error("ISSUE_TYPE, ISSUE_NUMBER, and ISSUE_FIELDS_JSON must all be set (see this file's header comment).");
    process.exitCode = 1;
    return;
  }

  const result = await runSubmissionCheck({ type, issueNumber, fieldsJson });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
