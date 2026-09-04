#!/usr/bin/env tsx
/**
 * scripts/build-marketplace.ts -- emits .claude-plugin/marketplace.json
 * (internal project documentation Section 7.4), a Claude Code marketplace manifest listing
 * every plugin entry, so `/plugin marketplace add ga4gh/ai-registry` works
 * directly against this repository.
 *
 * Shape confirmed against the current, live Claude Code marketplace schema
 * (https://json.schemastore.org/claude-code-marketplace.json, cross-checked
 * against docs.claude.com/en/docs/claude-code/plugin-marketplaces via
 * context7 on 2026-09-02, not assumed from training data alone): a
 * marketplace has `name`, `owner`, an optional `metadata` block, and a
 * `plugins[]` array where each entry needs `name` and `source`. Since every
 * plugin entry's actual source code lives in an external repository (this
 * project catalogues plugins, it does not host them -- internal project documentation Section
 * 8), `source` is always the external-source object form, never a relative
 * path: `{ source: "github", repo: "owner/repo" }` when `repository` is a
 * github.com URL, or `{ source: "git", url: repository }` for any other git
 * host, both confirmed current, documented Claude Code marketplace source
 * types.
 *
 * Usage: pnpm build:marketplace [--data-dir <path>] [--out-dir <path>]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntriesForType, DEFAULT_DATA_ROOT, REPO_ROOT } from "./lib/load-entries.js";
import type { AnyEntry } from "./lib/types.js";

type MarketplaceSource = { source: "github"; repo: string } | { source: "git"; url: string };

interface MarketplacePluginEntry {
  name: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string };
  homepage?: string;
  license?: string;
  category?: string;
  source: MarketplaceSource;
}

interface MarketplaceManifest {
  $schema: string;
  name: string;
  owner: { name: string };
  metadata: { description: string };
  plugins: MarketplacePluginEntry[];
}

function toMarketplaceSource(repositoryUrl: string): MarketplaceSource {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname === "github.com") {
      const [owner, repoWithGit] = url.pathname.replace(/^\//, "").split("/");
      if (owner && repoWithGit) {
        return { source: "github", repo: `${owner}/${repoWithGit.replace(/\.git$/, "")}` };
      }
    }
  } catch {
    // fall through to the generic git source below
  }
  return { source: "git", url: repositoryUrl };
}

export interface BuildMarketplaceOptions {
  dataRoot?: string;
}

export function buildMarketplace(options: BuildMarketplaceOptions = {}): MarketplaceManifest {
  const entries = loadEntriesForType("plugin", options.dataRoot ?? DEFAULT_DATA_ROOT);

  const plugins: MarketplacePluginEntry[] = entries.map((loaded) => {
    const entry = loaded.data as AnyEntry & {
      plugin?: { name?: string; description?: string; version?: string; author?: { name: string; email?: string } };
      ga4gh?: { category?: string };
    };
    const plugin = entry.plugin ?? {};
    return {
      name: String(plugin.name ?? entry.id),
      description: plugin.description ?? (typeof entry.summary === "string" ? entry.summary : undefined),
      version: plugin.version ?? (typeof entry.version === "string" ? entry.version : undefined),
      author: plugin.author,
      homepage: typeof entry.homepage === "string" ? entry.homepage : undefined,
      license: entry.license !== "other" && typeof entry.license === "string" ? entry.license : undefined,
      category: entry.ga4gh?.category,
      source: toMarketplaceSource(String(entry.repository)),
    };
  });

  plugins.sort((a, b) => a.name.localeCompare(b.name));

  return {
    $schema: "https://json.schemastore.org/claude-code-marketplace.json",
    name: "ga4gh-ai-registry",
    owner: { name: "GA4GH AI Workstream" },
    metadata: {
      description: "Coding-harness plugins catalogued by the GA4GH AI Registry.",
    },
    plugins,
  };
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

  const manifest = buildMarketplace({ dataRoot });
  const filePath = path.join(outDir, ".claude-plugin", "marketplace.json");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`Wrote .claude-plugin/marketplace.json (${manifest.plugins.length} plugin(s)) under ${path.relative(process.cwd(), outDir)}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
