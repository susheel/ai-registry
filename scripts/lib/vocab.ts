import { readFileSync } from "node:fs";
import path from "node:path";
import { SCHEMAS_DIR } from "./schemas.js";
import type { EntryType } from "./types.js";

interface VocabEntry {
  id: string;
  name: string;
  [key: string]: unknown;
}

function loadIds(relPath: string, listKey: string): Set<string> {
  const raw = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, relPath), "utf-8")) as Record<
    string,
    VocabEntry[]
  >;
  const list = raw[listKey] ?? [];
  return new Set(list.map((entry) => entry.id));
}

let licenseIds: Set<string> | undefined;
export function getAllowedLicenseIds(): Set<string> {
  licenseIds ??= loadIds("vocab/licenses.json", "licenses");
  return licenseIds;
}

let harnessIds: Set<string> | undefined;
export function getAllowedHarnessIds(): Set<string> {
  harnessIds ??= loadIds("vocab/harnesses.json", "harnesses");
  return harnessIds;
}

let safetySchemeIds: Set<string> | undefined;
export function getAllowedSafetySchemeIds(): Set<string> {
  safetySchemeIds ??= loadIds("vocab/safety-schemes.json", "schemes");
  return safetySchemeIds;
}

const categoryIdsByType = new Map<EntryType, Set<string>>();

/**
 * Category vocabulary for a type, or undefined for "plugin" and "bundle",
 * whose category is free text (internal project documentation Section 3.6, and the same
 * precedent applied to bundle entries in internal project documentation Phase 10) and has no
 * vocab file to check against.
 */
export function getAllowedCategoryIds(type: EntryType): Set<string> | undefined {
  if (type === "plugin" || type === "bundle") return undefined;
  const cached = categoryIdsByType.get(type);
  if (cached) return cached;
  const ids = loadIds(`vocab/categories/${type}.json`, "categories");
  categoryIdsByType.set(type, ids);
  return ids;
}
