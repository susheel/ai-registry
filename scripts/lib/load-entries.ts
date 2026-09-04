import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR_FOR_TYPE, ENTRY_TYPES, type AnyEntry, type EntryType } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const DEFAULT_DATA_ROOT = path.join(REPO_ROOT, "data");

/**
 * A parsed entry plus the metadata every build script (TECH.md Section 7:
 * build-index, build-ai-catalog, build-mcp-server-docs, build-marketplace)
 * and scripts/validate.ts need in common. There is no separate "compiled
 * entry" TS type beyond this: the JSON Schemas remain the single source of
 * truth for an entry's shape (internal project documentation Section 1.1), so `data` stays
 * loosely typed as `AnyEntry` rather than re-declaring the schema a second
 * time in TypeScript.
 */
export interface LoadedEntry {
  filePath: string;
  type: EntryType;
  data: AnyEntry;
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

/** Every entry of one type under `<dataRoot>/<type-dir>/*.json`, sorted by filename for deterministic build output. */
export function loadEntriesForType(type: EntryType, dataRoot: string = DEFAULT_DATA_ROOT): LoadedEntry[] {
  const dir = path.join(dataRoot, DATA_DIR_FOR_TYPE[type]);
  return listJsonFiles(dir).map((filePath) => ({
    filePath,
    type,
    data: JSON.parse(readFileSync(filePath, "utf-8")) as AnyEntry,
  }));
}

/** Every entry of every type under `dataRoot`, grouped by type. */
export function loadAllEntries(dataRoot: string = DEFAULT_DATA_ROOT): Map<EntryType, LoadedEntry[]> {
  const byType = new Map<EntryType, LoadedEntry[]>();
  for (const type of ENTRY_TYPES) {
    byType.set(type, loadEntriesForType(type, dataRoot));
  }
  return byType;
}

/** Every entry of every type under `dataRoot`, flattened into one array. */
export function loadAllEntriesFlat(dataRoot: string = DEFAULT_DATA_ROOT): LoadedEntry[] {
  return ENTRY_TYPES.flatMap((type) => loadEntriesForType(type, dataRoot));
}
