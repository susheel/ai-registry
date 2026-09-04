#!/usr/bin/env tsx
/**
 * scripts/build-index.ts -- emits index.json and index/<type>.json
 * (internal project documentation Section 7.1), the GA4GH-native projection and the canonical
 * machine-readable output the ga4gh-plugins/packages/ai-registry client
 * consumes (internal project documentation Section 8.3).
 *
 * Both files carry compact IndexEntrySummary objects (scripts/lib/index-entry.ts),
 * not full entries: internal project documentation Section 8.2 draws that line explicitly
 * ("Returns ranked summaries, not full entries" for search). A full entry
 * stays available at data/<type>/<slug>.json, the one place it lives
 * (internal project documentation Section 1.1); this script does not republish full entries
 * under a second path, since internal project documentation Section 7's numbered projection
 * list names only index.json and index/<type>.json here.
 *
 * Usage: pnpm build:index [--data-dir <path>] [--out-dir <path>]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllEntries, DEFAULT_DATA_ROOT, REPO_ROOT } from "./lib/load-entries.js";
import { toIndexEntrySummary, type IndexEntrySummary } from "./lib/index-entry.js";
import { DATA_DIR_FOR_TYPE, ENTRY_TYPES, type EntryType } from "./lib/types.js";

export interface BuildIndexOptions {
  dataRoot?: string;
}

export interface BuildIndexResult {
  index: {
    generated_at: string;
    count: number;
    types: Record<EntryType, number>;
    entries: IndexEntrySummary[];
  };
  perType: Record<EntryType, { generated_at: string; count: number; entries: IndexEntrySummary[] }>;
}

export function buildIndex(options: BuildIndexOptions = {}): BuildIndexResult {
  const generated_at = new Date().toISOString();
  const byType = loadAllEntries(options.dataRoot ?? DEFAULT_DATA_ROOT);

  const perType = {} as BuildIndexResult["perType"];
  const allEntries: IndexEntrySummary[] = [];
  const counts = {} as Record<EntryType, number>;

  for (const type of ENTRY_TYPES) {
    const entries = (byType.get(type) ?? []).map((loaded) => toIndexEntrySummary(loaded.data, type));
    entries.sort((a, b) => a.id.localeCompare(b.id));
    perType[type] = { generated_at, count: entries.length, entries };
    counts[type] = entries.length;
    allEntries.push(...entries);
  }

  allEntries.sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type)));

  return {
    index: { generated_at, count: allEntries.length, types: counts, entries: allEntries },
    perType,
  };
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function parseArgs(argv: string[]): { dataDir?: string; outDir?: string } {
  const options: { dataDir?: string; outDir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--data-dir") options.dataDir = argv[++i];
    else if (arg === "--out-dir") options.outDir = argv[++i];
    else throw new Error(`Unrecognised argument: ${arg}`);
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.outDir ? path.resolve(process.cwd(), args.outDir) : REPO_ROOT;
  const dataRoot = args.dataDir ? path.resolve(process.cwd(), args.dataDir) : undefined;

  const { index, perType } = buildIndex({ dataRoot });

  await writeJson(path.join(outDir, "index.json"), index);
  for (const type of ENTRY_TYPES) {
    await writeJson(path.join(outDir, "index", `${DATA_DIR_FOR_TYPE[type]}.json`), perType[type]);
  }

  console.log(`Wrote index.json (${index.count} entries) and index/<type>.json under ${path.relative(process.cwd(), outDir)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
