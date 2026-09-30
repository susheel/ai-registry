#!/usr/bin/env tsx
/**
 * scripts/apply-upstream-metadata.ts -- merges researched `upstream` and
 * `model_details` blocks into data/<type>/<id>.json entries.
 *
 * Usage:
 *   pnpm apply:upstream -- <input.json> [--dry-run] [--data-root <dir>]
 *
 * <input.json> is an object keyed by entry path. A key may be
 * "data/models/alphagenome.json", "models/alphagenome.json" or
 * "models/alphagenome"; keys starting with "$" or "_" are ignored. Each value
 * is either
 *   { "upstream": { publisher, name, version, version_source, version_date, archived },
 *     "model_details": { ... }, "evidence": ..., "notes": ... }
 * or the flat form with the upstream fields at the top level
 *   { "publisher": {...}, "name": ..., "version": ..., "version_source": ...,
 *     "version_date": ..., "model_details": {...}, "evidence": ..., "notes": ... }
 *
 * `evidence` and `notes` are reported, not written: the data files carry the
 * facts, the research file carries their provenance. `qualified_id` is never
 * written either (it is derived); an input value that disagrees with the
 * derivation is reported. `upstream` is replaced as a whole;
 * `model_details` fields are merged over any existing block (model entries
 * only).
 *
 * Every merged entry is validated offline before it is written, and an entry
 * with validation errors is left untouched. Edits are spliced into the
 * original text, so untouched fields keep their existing layout, and running
 * the script twice with the same input changes nothing the second time.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEntryOffline } from "./lib/validate-entry.js";
import { deriveQualifiedId, normaliseVersion } from "./lib/upstream.js";
import { DATA_DIR_FOR_TYPE, ENTRY_TYPES, type AnyEntry, type EntryType } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const UPSTREAM_KEYS = ["publisher", "name", "version", "version_source", "version_date", "archived"] as const;
const PUBLISHER_KEYS = ["id", "name", "type", "url"] as const;
const MODEL_DETAILS_KEYS = ["parameters", "reference_precision", "weights_availability", "licence", "quantisations"] as const;
const QUANTISATION_KEYS = ["format", "bits", "publisher", "url", "size_bytes"] as const;

/** Insert `upstream` directly after `version`. */
const UPSTREAM_AFTER = "version";
/** Insert `model_details` before the first of these that exists (else at the end). */
const MODEL_DETAILS_BEFORE = ["hosting_location", "access_uri", "install_command", "model_card_uri", "last_synced", "record"];

export interface EntryPatch {
  upstream?: JsonObject;
  model_details?: JsonObject;
  evidence?: Json;
  notes?: Json;
  /** Input-supplied qualified id, checked but never written. */
  claimedQualifiedId?: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copies the listed keys, in that order, dropping undefined ones. */
function pick(source: JsonObject, keys: readonly string[]): JsonObject {
  const out: JsonObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]!;
  }
  return out;
}

/** Normalises one input value into an EntryPatch with canonical key order. */
export function toEntryPatch(raw: unknown): EntryPatch {
  if (!isObject(raw)) throw new Error("each input value must be an object");
  const upstreamSource = isObject(raw["upstream"]) ? raw["upstream"] : UPSTREAM_KEYS.some((k) => k in raw) ? raw : undefined;
  const patch: EntryPatch = {};
  if (upstreamSource) {
    const upstream = pick(upstreamSource, UPSTREAM_KEYS);
    if (isObject(upstream["publisher"])) upstream["publisher"] = pick(upstream["publisher"], PUBLISHER_KEYS);
    if (typeof upstream["version"] === "string" || upstream["version"] === null) {
      upstream["version"] = normaliseVersion(upstream["version"] as string | null);
    }
    patch.upstream = upstream;
    if (typeof upstreamSource["qualified_id"] === "string") patch.claimedQualifiedId = upstreamSource["qualified_id"];
  }
  if (isObject(raw["model_details"])) {
    const details = pick(raw["model_details"], MODEL_DETAILS_KEYS);
    if (Array.isArray(details["quantisations"])) {
      details["quantisations"] = details["quantisations"].map((q) => (isObject(q) ? pick(q, QUANTISATION_KEYS) : q));
    }
    patch.model_details = details;
  }
  if (raw["evidence"] !== undefined) patch.evidence = raw["evidence"]!;
  if (raw["notes"] !== undefined) patch.notes = raw["notes"]!;
  return patch;
}

/** Resolves an input key to an absolute data file path and its entry type. */
export function resolveEntryPath(key: string, dataRoot: string): { filePath: string; type: EntryType } {
  let rel = key.replace(/\\/g, "/").replace(/^\.\//, "");
  if (rel.startsWith("data/")) rel = rel.slice("data/".length);
  if (!rel.endsWith(".json")) rel = `${rel}.json`;
  const [dir, file, ...rest] = rel.split("/");
  const type = ENTRY_TYPES.find((t) => DATA_DIR_FOR_TYPE[t] === dir);
  if (!type || !file || rest.length > 0 || file.includes("..")) {
    throw new Error(`"${key}" is not a data/<type>/<id>.json path`);
  }
  return { filePath: path.join(dataRoot, dir!, file), type };
}

// ---------------------------------------------------------------------------
// Text-preserving JSON editing.

interface Member {
  key: string;
  keyStart: number;
  valueStart: number;
  /** Exclusive end of the value text. */
  valueEnd: number;
}

function skipString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") i += 2;
    else if (ch === '"') return i + 1;
    else i += 1;
  }
  throw new Error("unterminated string");
}

function skipWhitespace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return i;
}

/** Finds the end (exclusive) of the JSON value starting at `start`. */
function skipValue(text: string, start: number): number {
  const ch = text[start];
  if (ch === '"') return skipString(text, start);
  if (ch === "{" || ch === "[") {
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        i = skipString(text, i);
        continue;
      }
      if (c === "{" || c === "[") depth += 1;
      if (c === "}" || c === "]") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    throw new Error("unbalanced brackets");
  }
  let i = start;
  while (i < text.length && !/[\s,}\]]/.test(text[i]!)) i += 1;
  return i;
}

/** Top-level members of a JSON object text, with their source offsets. */
export function scanTopLevelMembers(text: string): Member[] {
  let i = skipWhitespace(text, 0);
  if (text[i] !== "{") throw new Error("entry file is not a JSON object");
  i += 1;
  const members: Member[] = [];
  for (;;) {
    i = skipWhitespace(text, i);
    if (text[i] === "}") return members;
    if (text[i] !== '"') throw new Error(`expected a key at offset ${i}`);
    const keyStart = i;
    const keyEnd = skipString(text, i);
    const key = JSON.parse(text.slice(keyStart, keyEnd)) as string;
    i = skipWhitespace(text, keyEnd);
    if (text[i] !== ":") throw new Error(`expected ":" at offset ${i}`);
    const valueStart = skipWhitespace(text, i + 1);
    const valueEnd = skipValue(text, valueStart);
    members.push({ key, keyStart, valueStart, valueEnd });
    i = skipWhitespace(text, valueEnd);
    if (text[i] === ",") i += 1;
  }
}

/**
 * Serialises a value in the data files' own style: objects one key per line,
 * arrays of scalars inline (`["a", "b"]`), arrays of objects one per line.
 */
export function serialiseValue(value: Json, indent: string, level: number): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const pad = indent.repeat(level + 1);
  const closePad = indent.repeat(level);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => v === null || typeof v !== "object")) {
      return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `[\n${value.map((v) => pad + serialiseValue(v, indent, level + 1)).join(",\n")}\n${closePad}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  return `{\n${keys
    .map((k) => `${pad}${JSON.stringify(k)}: ${serialiseValue(value[k]!, indent, level + 1)}`)
    .join(",\n")}\n${closePad}}`;
}

function detectIndent(text: string, members: Member[]): string {
  const first = members[0];
  if (!first) return "  ";
  const lineStart = text.lastIndexOf("\n", first.keyStart) + 1;
  const indent = text.slice(lineStart, first.keyStart);
  return /^[ \t]+$/.test(indent) ? indent : "  ";
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * Sets top-level `key` to `value` in `text`: replaces the value in place when
 * the key exists, otherwise inserts a new member after `after` or before the
 * first present key in `before`, falling back to the end of the object.
 */
function planSet(text: string, members: Member[], indent: string, key: string, value: Json, placement: { after?: string; before?: string[] }): Edit {
  const serialised = serialiseValue(value, indent, 1);
  const existing = members.find((m) => m.key === key);
  if (existing) return { start: existing.valueStart, end: existing.valueEnd, text: serialised };
  const member = `${JSON.stringify(key)}: ${serialised}`;
  const afterMember = placement.after ? members.find((m) => m.key === placement.after) : undefined;
  if (afterMember) return { start: afterMember.valueEnd, end: afterMember.valueEnd, text: `,\n${indent}${member}` };
  for (const beforeKey of placement.before ?? []) {
    const beforeMember = members.find((m) => m.key === beforeKey);
    if (beforeMember) return { start: beforeMember.keyStart, end: beforeMember.keyStart, text: `${member},\n${indent}` };
  }
  const last = members[members.length - 1];
  if (!last) throw new Error("cannot insert into an empty object");
  return { start: last.valueEnd, end: last.valueEnd, text: `,\n${indent}${member}` };
}

/**
 * Returns the entry text with the patch applied, plus the merged entry for
 * validation. Pure: no file access.
 */
export function applyPatchToText(text: string, type: EntryType, patch: EntryPatch): { text: string; entry: AnyEntry } {
  const entry = JSON.parse(text) as JsonObject;
  const members = scanTopLevelMembers(text);
  const indent = detectIndent(text, members);
  const edits: Edit[] = [];

  if (patch.upstream) {
    entry["upstream"] = patch.upstream;
    edits.push(planSet(text, members, indent, "upstream", patch.upstream, { after: UPSTREAM_AFTER }));
  }
  if (patch.model_details) {
    if (type !== "model") throw new Error(`model_details given for a ${type} entry; it applies to models only`);
    const merged = { ...(isObject(entry["model_details"]) ? entry["model_details"] : {}), ...patch.model_details };
    const ordered = { ...pick(merged, MODEL_DETAILS_KEYS), ...merged };
    entry["model_details"] = ordered;
    edits.push(planSet(text, members, indent, "model_details", ordered, { before: MODEL_DETAILS_BEFORE }));
  }

  // Apply from the end so earlier offsets stay valid. Two insertions at one
  // offset keep their planned order.
  let out = text;
  const ordered = edits.map((e, i) => ({ ...e, i })).sort((a, b) => b.start - a.start || b.i - a.i);
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);

  // Re-parse the result: the splice must yield exactly the merged object.
  const reparsed = JSON.parse(out) as JsonObject;
  if (JSON.stringify(sortKeysDeep(reparsed)) !== JSON.stringify(sortKeysDeep(entry))) {
    throw new Error("internal error: spliced text does not match the merged entry");
  }
  return { text: out, entry: reparsed as AnyEntry };
}

function sortKeysDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeysDeep(value[k]!)]));
  }
  return value;
}

// ---------------------------------------------------------------------------

export interface ApplyResult {
  key: string;
  file: string;
  status: "updated" | "unchanged" | "error";
  qualifiedId?: string;
  messages: string[];
}

export function applyUpstreamMetadata(input: unknown, options: { dataRoot: string; dryRun: boolean }): ApplyResult[] {
  if (!isObject(input)) throw new Error("input must be a JSON object keyed by entry path");
  const results: ApplyResult[] = [];
  for (const [key, raw] of Object.entries(input)) {
    if (key.startsWith("$") || key.startsWith("_")) continue;
    const result: ApplyResult = { key, file: key, status: "error", messages: [] };
    results.push(result);
    try {
      const { filePath, type } = resolveEntryPath(key, options.dataRoot);
      result.file = path.relative(REPO_ROOT, filePath);
      if (!existsSync(filePath)) throw new Error(`no such entry file: ${result.file}`);
      const patch = toEntryPatch(raw);
      if (!patch.upstream && !patch.model_details) throw new Error("nothing to apply (no upstream or model_details fields)");
      const original = readFileSync(filePath, "utf-8");
      const { text, entry } = applyPatchToText(original, type, patch);

      if (patch.upstream) {
        result.qualifiedId = deriveQualifiedId(patch.upstream as never);
        if (patch.claimedQualifiedId !== undefined && patch.claimedQualifiedId !== result.qualifiedId) {
          result.messages.push(`input qualified_id "${patch.claimedQualifiedId}" ignored; derived value is "${result.qualifiedId}"`);
        }
      }
      if (patch.notes !== undefined) result.messages.push(`notes: ${typeof patch.notes === "string" ? patch.notes : JSON.stringify(patch.notes)}`);

      const errors = validateEntryOffline(entry, type).filter((i) => i.severity === "error");
      if (errors.length > 0) {
        result.messages.push(...errors.map((e) => `invalid after merge: (${e.code}) ${e.message}`));
        continue;
      }
      if (text === original) {
        result.status = "unchanged";
        continue;
      }
      result.status = "updated";
      if (!options.dryRun) writeFileSync(filePath, text, "utf-8");
    } catch (err) {
      result.status = "error";
      result.messages.push(err instanceof Error ? err.message : String(err));
    }
  }
  return results;
}

function parseArgs(argv: string[]): { inputPath: string; dryRun: boolean; dataRoot: string } {
  let inputPath: string | undefined;
  let dryRun = false;
  let dataRoot = path.join(REPO_ROOT, "data");
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--data-root") {
      const value = argv[++i];
      if (!value) throw new Error("--data-root requires a path");
      dataRoot = path.resolve(process.cwd(), value);
    } else if (arg.startsWith("--")) throw new Error(`Unrecognised argument: ${arg}`);
    else if (inputPath) throw new Error("only one input file may be given");
    else inputPath = path.resolve(process.cwd(), arg);
  }
  if (!inputPath) throw new Error("usage: apply-upstream-metadata.ts <input.json> [--dry-run] [--data-root <dir>]");
  return { inputPath, dryRun, dataRoot };
}

function main() {
  const { inputPath, dryRun, dataRoot } = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(inputPath, "utf-8")) as unknown;
  const results = applyUpstreamMetadata(input, { dataRoot, dryRun });
  for (const r of results) {
    const verb = r.status === "updated" && dryRun ? "would update" : r.status;
    console.log(`${r.status === "error" ? "✗" : "✓"} ${r.file}: ${verb}${r.qualifiedId ? ` (${r.qualifiedId})` : ""}`);
    for (const m of r.messages) console.log(`    ${m}`);
  }
  const counts = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  console.log(
    `${dryRun ? "Dry run: " : ""}${counts["updated"] ?? 0} ${dryRun ? "to update" : "updated"}, ${counts["unchanged"] ?? 0} unchanged, ${counts["error"] ?? 0} error(s)`,
  );
  if (counts["error"]) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
