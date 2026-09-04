#!/usr/bin/env tsx
/**
 * scripts/build-ai-catalog.ts -- emits .well-known/ai-catalog.json
 * (internal project documentation Section 7.2), the AAIF AI Catalog projection satisfying
 * ADR-002. Per internal project documentation Section 5, this MUST be published at that path
 * anyway, but is NOT a true RFC 8615 well-known URI at the GitHub Pages
 * subpath this project deploys to; do not advertise it as satisfying
 * origin-root discovery.
 *
 * **Best-effort projection, not schema-validated.** Per D7 of
 * internal research notes and internal project documentation Section
 * 1.3, this registry takes no runtime or schema dependency on the AI
 * Catalog. That decision is doubly justified for this specific projection:
 * `internal research notes` confirms
 * `Agent-Card/ai-catalog` has zero tagged releases, is still explicitly
 * "temporary" per its own governance section, and had a breaking field
 * rename (`media-type` -> `type`) merged two weeks before that research —
 * there is no stable schema to vendor the way server.schema.json and
 * plugin.schema.json are vendored for the two upstream documents that DO
 * have one. This script therefore builds a reasonable, documented
 * interpretation of the confirmed pattern (a `type` field using media
 * types, per-artifact `_meta`-style GA4GH extension data, "valid and useful"
 * once that extension is stripped) rather than a byte-exact conformance
 * claim, and MUST be revisited once the upstream spec tags a release this
 * project can vendor and validate against the way the other two are.
 *
 * The GA4GH extension lives entirely inside `_meta["org.ga4gh/ai-registry"]`
 * on each catalog item, mirroring the same extension-point discipline used
 * for the embedded server/plugin documents (internal project documentation Section 3.1):
 * stripping it leaves `{type, id, name, description, url}`, still a minimal
 * but useful catalog entry, satisfying TECH.md Section 7.2's requirement
 * that the projection "remain valid and useful with every GA4GH extension
 * stripped".
 *
 * Usage: pnpm build:ai-catalog [--data-dir <path>] [--out-dir <path>]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllEntriesFlat, DEFAULT_DATA_ROOT, REPO_ROOT } from "./lib/load-entries.js";
import type { AnyEntry, EntryType } from "./lib/types.js";

/** This project's own documented convention, not an officially registered
 * IANA media type: application/vnd.ga4gh.ai-registry.<type>+json. */
function mediaTypeFor(type: EntryType): string {
  return `application/vnd.ga4gh.ai-registry.${type}+json`;
}

interface AiCatalogItem {
  type: string;
  id: string;
  name: string;
  description: string;
  url: string;
  _meta?: {
    "org.ga4gh/ai-registry": {
      id: string;
      type: EntryType;
      category: string;
      ga4gh_standards: string[];
      safety_classification: unknown[];
      certification_tier: string;
      record: unknown;
    };
  };
}

interface AiCatalogManifest {
  catalog: AiCatalogItem[];
}

function toCatalogItem(entry: AnyEntry, type: EntryType): AiCatalogItem {
  return {
    type: mediaTypeFor(type),
    id: String(entry.id ?? ""),
    name: String(entry.name ?? ""),
    description: String(entry.summary ?? ""),
    url: String(entry.homepage ?? entry.repository ?? ""),
    _meta: {
      "org.ga4gh/ai-registry": {
        id: String(entry.id ?? ""),
        type,
        category: String(entry.category ?? ""),
        ga4gh_standards: Array.isArray(entry.ga4gh_standards) ? (entry.ga4gh_standards as string[]) : [],
        safety_classification: Array.isArray(entry.safety_classification) ? entry.safety_classification : [],
        certification_tier: String(entry.certification_tier ?? "unsigned"),
        record: entry.record ?? {},
      },
    },
  };
}

export interface BuildAiCatalogOptions {
  dataRoot?: string;
}

export function buildAiCatalog(options: BuildAiCatalogOptions = {}): AiCatalogManifest {
  const entries = loadAllEntriesFlat(options.dataRoot ?? DEFAULT_DATA_ROOT);
  const catalog = entries
    .map((loaded) => toCatalogItem(loaded.data, loaded.type))
    .sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type)));
  return { catalog };
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

  const manifest = buildAiCatalog({ dataRoot });
  const filePath = path.join(outDir, ".well-known", "ai-catalog.json");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`Wrote .well-known/ai-catalog.json (${manifest.catalog.length} item(s)) under ${path.relative(process.cwd(), outDir)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
