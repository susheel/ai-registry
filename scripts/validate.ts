#!/usr/bin/env tsx
/**
 * scripts/validate.ts -- GA4GH AI Registry entry validator.
 *
 * Runs the checks TECH.md Section 3.1, Section 6 (Workflow 1 and Workflow 3),
 * and Section 9 require: schema conformance, licence allow-list membership,
 * category vocabulary membership, id slug uniqueness within a type,
 * declared-URL reachability, cross-reference resolution (model_card_uri,
 * agent_info_uri per D13, and the embedded server/plugin documents via
 * schema), and the D14 ga4gh_standards[] subset rule for mcp-server entries.
 *
 * Usage:
 *   pnpm validate                        validate every entry under data/
 *   pnpm validate -- --skip-network       skip all network checks (offline)
 *   pnpm validate -- --entry <path>       validate one file (plus slug
 *                                         uniqueness against the rest of
 *                                         data/<type>/)
 *   pnpm validate -- --json               emit EntryValidationResult[] as a
 *                                         single JSON array on stdout instead
 *                                         of the human-readable report, for a
 *                                         CI step to parse and render as a
 *                                         GitHub comment (internal project documentation
 *                                         Section 6, Workflow 1 and Workflow
 *                                         3). Combine with --entry to
 *                                         validate one candidate record and
 *                                         get back exactly the structured
 *                                         result that record produced.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateEntryOffline,
  runNetworkChecks,
} from "./lib/validate-entry.js";
import { DATA_DIR_FOR_TYPE, ENTRY_TYPES, type EntryType, type AnyEntry, type EntryValidationResult, type ValidationIssue } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(REPO_ROOT, "data");

export interface CliOptions {
  skipNetwork: boolean;
  entryPath?: string;
  json?: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { skipNetwork: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      // pnpm/npm's `run <script> -- <args>` separator; harmless to see here.
      continue;
    } else if (arg === "--skip-network" || arg === "--offline") {
      options.skipNetwork = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--entry") {
      const value = argv[++i];
      if (!value) throw new Error("--entry requires a path argument");
      options.entryPath = value;
    } else {
      throw new Error(`Unrecognised argument: ${arg}`);
    }
  }
  return options;
}

function listDataFiles(type: EntryType): string[] {
  const dir = path.join(DATA_ROOT, DATA_DIR_FOR_TYPE[type]);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function loadEntry(filePath: string): AnyEntry {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as AnyEntry;
}

function typeFromDataPath(filePath: string): EntryType | undefined {
  const dirName = path.basename(path.dirname(filePath));
  return (Object.entries(DATA_DIR_FOR_TYPE).find(([, dir]) => dir === dirName)?.[0]) as
    | EntryType
    | undefined;
}

/** Slug uniqueness within a type, across every entry file for that type. */
function checkSlugUniqueness(entriesByType: Map<EntryType, Array<{ file: string; entry: AnyEntry }>>): Map<string, ValidationIssue[]> {
  const issuesByFile = new Map<string, ValidationIssue[]>();
  for (const [, entries] of entriesByType) {
    const byId = new Map<string, string[]>();
    for (const { file, entry } of entries) {
      if (typeof entry.id !== "string") continue;
      const files = byId.get(entry.id) ?? [];
      files.push(file);
      byId.set(entry.id, files);
    }
    for (const [id, files] of byId) {
      if (files.length <= 1) continue;
      for (const file of files) {
        const issues = issuesByFile.get(file) ?? [];
        issues.push({
          severity: "error",
          code: "slug-duplicate",
          message: `id "${id}" is used by ${files.length} entries of this type: ${files.map((f) => path.relative(REPO_ROOT, f)).join(", ")}`,
          path: "id",
        });
        issuesByFile.set(file, issues);
      }
    }
  }
  return issuesByFile;
}

export async function validateFiles(
  filesToValidate: string[],
  options: CliOptions,
): Promise<EntryValidationResult[]> {
  // Slug uniqueness must consider every entry of a given type, not only the
  // files under validation, so a single --entry run still catches a
  // collision against an existing, unvalidated sibling.
  const allEntriesByType = new Map<EntryType, Array<{ file: string; entry: AnyEntry }>>();
  for (const type of ENTRY_TYPES) {
    const entries = listDataFiles(type).map((file) => ({ file, entry: loadEntry(file) }));
    allEntriesByType.set(type, entries);
  }
  // If validating a file not yet present under data/ (e.g. a fixture, or a
  // not-yet-written entry), fold it into the uniqueness check too, keyed by
  // its own declared `type` field rather than its directory, since a
  // standalone file (a fixture, or --entry pointed outside data/) has no
  // data/<type>/ path to infer type from.
  for (const file of filesToValidate) {
    const entry = loadEntry(file);
    const type = typeof entry.type === "string" ? (entry.type as EntryType) : undefined;
    if (!type || !ENTRY_TYPES.includes(type)) continue;
    const list = allEntriesByType.get(type)!;
    if (!list.some((e) => path.resolve(e.file) === path.resolve(file))) {
      list.push({ file, entry });
    }
  }
  const duplicateIssuesByFile = checkSlugUniqueness(allEntriesByType);

  const results: EntryValidationResult[] = [];
  for (const file of filesToValidate) {
    const entry = loadEntry(file);
    const declaredType = typeof entry.type === "string" ? (entry.type as EntryType) : undefined;
    const pathType = typeFromDataPath(file);

    const issues: ValidationIssue[] = [];
    if (!declaredType || !ENTRY_TYPES.includes(declaredType)) {
      issues.push({
        severity: "error",
        code: "unknown-type",
        message: `entry has no valid "type" field (got ${JSON.stringify(entry.type)})`,
        path: "type",
      });
      results.push({ file, ok: false, issues });
      continue;
    }
    if (pathType && pathType !== declaredType) {
      issues.push({
        severity: "error",
        code: "type-path-mismatch",
        message: `entry declares type "${declaredType}" but lives under data/${path.basename(path.dirname(file))}/ (expected data/${DATA_DIR_FOR_TYPE[declaredType]}/)`,
        path: "type",
      });
    }

    issues.push(...validateEntryOffline(entry, declaredType));
    issues.push(...(duplicateIssuesByFile.get(file) ?? []));
    issues.push(...(await runNetworkChecks(entry, declaredType, { skipNetwork: options.skipNetwork })));

    results.push({
      file,
      id: typeof entry.id === "string" ? entry.id : undefined,
      type: declaredType,
      ok: !issues.some((i) => i.severity === "error"),
      issues,
    });
  }
  return results;
}

/** True if every result is free of error-severity issues (warnings are fine). */
export function allResultsOk(results: EntryValidationResult[]): boolean {
  return results.every((r) => r.ok);
}

function printResults(results: EntryValidationResult[]): boolean {
  let hasErrors = false;
  for (const result of results) {
    const relFile = path.relative(REPO_ROOT, result.file);
    if (result.issues.length === 0) {
      console.log(`✓ ${relFile}`);
      continue;
    }
    console.log(`${result.ok ? "✓" : "✗"} ${relFile}`);
    for (const issue of result.issues) {
      const marker = issue.severity === "error" ? "ERROR" : "WARN ";
      console.log(`  [${marker}] (${issue.code}) ${issue.message}`);
    }
    if (!result.ok) hasErrors = true;
  }
  return !hasErrors;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filesToValidate = options.entryPath
    ? [path.resolve(process.cwd(), options.entryPath)]
    : ENTRY_TYPES.flatMap((type) => listDataFiles(type));

  if (filesToValidate.length === 0) {
    if (options.json) {
      console.log("[]");
    } else {
      console.log("No entries found under data/ (nothing to validate).");
    }
    return;
  }

  const results = await validateFiles(filesToValidate, options);
  if (options.json) {
    console.log(JSON.stringify(results));
    if (!allResultsOk(results)) process.exitCode = 1;
    return;
  }
  const ok = printResults(results);
  if (!ok) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
