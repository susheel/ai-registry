#!/usr/bin/env tsx
/**
 * scripts/check-bundle-freshness.ts -- Phase 11 (internal project documentation): a
 * maintainer-run, bundle-only freshness check.
 *
 * `pnpm run validate` already runs this same check (via
 * scripts/lib/fetch-checks.ts's checkBundleFreshness, wired into
 * runNetworkChecks) as part of every full validation pass, including in CI on
 * every merge to main. This script exists alongside that for one reason:
 * a maintainer who just wants to know "which bundles have drifted from their
 * source" without waiting on schema/licence/category/every-other-type's
 * network checks gets a fast, bundle-only answer. It intentionally does not
 * write anything back to data/bundles/ -- refreshing a stale entry (updating
 * `marketplace`, `last_synced`, and re-running the deep-equality check this
 * registry's own discipline requires) is a deliberate content decision, not
 * something this script should do unattended.
 *
 * This is a manual, on-demand command. Whether to also run it on a schedule
 * (a new GitHub Actions cron workflow) is a separate, not-yet-made decision:
 * this repository's existing CI (internal project documentation Section 5) triggers only on
 * push-to-main and workflow_dispatch, deliberately, and adding a new
 * scheduled workflow is a CI/CD change that needs its own explicit sign-off,
 * not something to bundle into this phase's Bash-tool-only work.
 *
 * Usage:
 *   pnpm run check-bundle-freshness
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundleFreshness } from "./lib/fetch-checks.js";
import { DATA_DIR_FOR_TYPE, type AnyEntry } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BUNDLES_DIR = path.join(REPO_ROOT, "data", DATA_DIR_FOR_TYPE.bundle);

function listBundleFiles(): string[] {
  if (!existsSync(BUNDLES_DIR)) return [];
  return readdirSync(BUNDLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(BUNDLES_DIR, f));
}

function loadEntry(filePath: string): AnyEntry {
  return JSON.parse(readFileSync(filePath, "utf-8")) as AnyEntry;
}

async function main() {
  const files = listBundleFiles();
  if (files.length === 0) {
    console.log("No entries found under data/bundles/ (nothing to check).");
    return;
  }

  let staleCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const entry = loadEntry(file);
    const relFile = path.relative(REPO_ROOT, file);
    if (typeof entry.source_uri !== "string") {
      console.log(`✗ ${relFile}`);
      console.log(`  [ERROR] entry has no source_uri to check`);
      errorCount++;
      continue;
    }

    const issues = await checkBundleFreshness(entry.source_uri, entry.marketplace);
    if (issues.length === 0) {
      console.log(`✓ ${relFile} (last_synced: ${String(entry.last_synced)})`);
      continue;
    }
    console.log(`${issues.some((i) => i.severity === "error") ? "✗" : "!"} ${relFile}`);
    for (const issue of issues) {
      const marker = issue.severity === "error" ? "ERROR" : "STALE";
      console.log(`  [${marker}] (${issue.code}) ${issue.message}`);
      if (issue.severity === "error") errorCount++;
      else staleCount++;
    }
  }

  console.log("");
  console.log(
    `${files.length} bundle entr${files.length === 1 ? "y" : "ies"} checked: ${staleCount} stale, ${errorCount} unreachable/invalid.`,
  );
  if (errorCount > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
