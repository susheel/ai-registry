#!/usr/bin/env tsx
/**
 * scripts/build-mcp-server-docs.ts -- emits mcp/<slug>/server.json per
 * MCP-server entry (internal project documentation Section 7.3): each entry's embedded
 * `server` sub-document, published standalone so it can be cross-listed to
 * registry.modelcontextprotocol.io "without transformation".
 *
 * The published file is `server` verbatim, GA4GH `_meta` block included: the
 * vendored server.schema.json's own `_meta` property is
 * `additionalProperties: true` (reverse-DNS-namespaced vendor extension
 * data is exactly what it exists for), so a server.json carrying
 * `_meta["org.ga4gh/ai-registry"]` is already a valid, standalone,
 * publishable server.json on its own -- "without transformation" describes
 * what a third party does not have to do to it, not a strip this script
 * must perform before publishing.
 *
 * Usage: pnpm build:mcp-docs [--data-dir <path>] [--out-dir <path>]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntriesForType, DEFAULT_DATA_ROOT, REPO_ROOT } from "./lib/load-entries.js";

export interface BuildMcpServerDocsOptions {
  dataRoot?: string;
}

export interface BuiltMcpServerDoc {
  slug: string;
  server: unknown;
}

export function buildMcpServerDocs(options: BuildMcpServerDocsOptions = {}): BuiltMcpServerDoc[] {
  const entries = loadEntriesForType("mcp-server", options.dataRoot ?? DEFAULT_DATA_ROOT);
  return entries
    .filter((loaded) => loaded.data.server !== undefined)
    .map((loaded) => ({ slug: String(loaded.data.id), server: loaded.data.server }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
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

  const docs = buildMcpServerDocs({ dataRoot });
  for (const doc of docs) {
    const filePath = path.join(outDir, "mcp", doc.slug, "server.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(doc.server, null, 2) + "\n", "utf-8");
  }

  console.log(`Wrote ${docs.length} mcp/<slug>/server.json file(s) under ${path.relative(process.cwd(), outDir)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
