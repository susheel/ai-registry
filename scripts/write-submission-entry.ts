#!/usr/bin/env tsx
/**
 * scripts/write-submission-entry.ts -- the last step of `promote-to-pr.yml`
 * (Workflow 2, internal project documentation Section 6) before opening a PR: takes the
 * already-re-validated result `scripts/validate-submission.ts` produced and
 * writes `data/<type-dir>/<slug>.json`, refusing outright if that result was
 * not `ok` (defence in depth: Workflow 2 should never promote content its
 * own re-validation step just rejected, even though Workflow 3 will also
 * catch it after the fact).
 *
 * Reads everything from `process.env`, consistent with this pipeline's
 * env-not-run-string convention:
 *   SUBMISSION_RESULT_PATH   path to the JSON file
 *                            scripts/validate-submission.ts wrote
 *   ISSUE_TYPE               one of model | agent | skill | mcp-server | plugin
 *   DATA_ROOT                optional, defaults to "data" (repo-root-relative)
 *
 * Writes two lines to $GITHUB_OUTPUT (file-path, slug) when run under
 * GitHub Actions (skipped if GITHUB_OUTPUT is unset, e.g. in tests).
 */
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DATA_DIR_FOR_TYPE, type EntryType, type AnyEntry } from "./lib/types.js";
import type { SubmissionCheckResult } from "./validate-submission.js";

export interface WriteSubmissionEntryInput {
  result: SubmissionCheckResult;
  type: EntryType;
  dataRoot?: string;
}

export interface WriteSubmissionEntryOutput {
  filePath: string;
  slug: string;
}

export async function writeSubmissionEntry(input: WriteSubmissionEntryInput): Promise<WriteSubmissionEntryOutput> {
  if (!input.result.ok) {
    throw new Error("Refusing to write an entry from a validation result that was not ok.");
  }
  const record = input.result.record as AnyEntry;
  const slug = record.id;
  if (typeof slug !== "string" || slug.length === 0) {
    throw new Error("Validated record has no usable string id; cannot derive a filename.");
  }

  const dataRoot = input.dataRoot ?? "data";
  const dir = path.join(dataRoot, DATA_DIR_FOR_TYPE[input.type]);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  return { filePath, slug };
}

async function main() {
  const resultPath = process.env.SUBMISSION_RESULT_PATH;
  const type = process.env.ISSUE_TYPE as EntryType | undefined;
  if (!resultPath || !type) {
    console.error("SUBMISSION_RESULT_PATH and ISSUE_TYPE must both be set.");
    process.exitCode = 1;
    return;
  }

  const result = JSON.parse(await readFile(resultPath, "utf-8")) as SubmissionCheckResult;
  const { filePath, slug } = await writeSubmissionEntry({ result, type, dataRoot: process.env.DATA_ROOT });

  console.log(`Wrote ${filePath}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `file-path=${filePath}\nslug=${slug}\n`, "utf-8");
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
