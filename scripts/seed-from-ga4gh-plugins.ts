#!/usr/bin/env tsx
/**
 * scripts/seed-from-ga4gh-plugins.ts -- Phase 6 (internal project documentation) seed-content
 * generator for the mcp-server and plugin content types.
 *
 * Reads each ga4gh-plugins package's package.json (D12's keywords[]/ga4gh{}
 * annotation), server.json, and .claude-plugin/plugin.json (both newly
 * authored in the sibling repository as a Phase 6 prerequisite -- neither
 * existed before this phase; see internal project documentation Phase 6 handoff notes) and
 * emits one mcp-server entry and one plugin entry per package under data/.
 *
 * The embedded server/plugin documents are the real, unmodified upstream
 * files: GA4GH additions are added on top, never merged into them, so
 * stripping server._meta["org.ga4gh/ai-registry"] or the plugin's sibling
 * `ga4gh` object leaves the original document intact (TECH.md Section 3.1
 * lift-out-ability requirement).
 *
 * Deliberately excludes: mock-server (a testing fixture, not real catalogue
 * content -- the same discipline Phase 3 applied to its own fixture-seeding),
 * and the 6 packages D12 gave an empty harnesses[] (agent-trace,
 * agent-trace-attributes, clinpheno, cloud, discovery, federated-analysis):
 * no standalone MCP binary, so no server.json/plugin.json to seed from.
 *
 * Usage: tsx scripts/seed-from-ga4gh-plugins.ts [--ga4gh-plugins-root <path>]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR_FOR_TYPE } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function parseRoot(argv: string[]): string {
  const idx = argv.indexOf("--ga4gh-plugins-root");
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]!);
  return path.resolve(REPO_ROOT, "../ga4gh-plugins/packages");
}

const PLUGINS_ROOT = parseRoot(process.argv.slice(2));

const MAINTAINER = { name: "Susheel Varma", github: "susheel", affiliation: "GA4GH AI Workstream / Sage Bionetworks" };
const REPO_URL = "https://github.com/deepseek-ai/ga4gh-plugins";

interface PkgSeed {
  pkg: string;
  displayName: string;
  category: string; // ai-registry mcp-server closed-vocab category id
  ga4ghStandards: string[]; // common-core coarse facet, bare identifiers
  descriptionMd: string;
}

// One entry per seeded package: readable display name, the closed
// mcp-server category vocab id it maps to (schemas/vocab/categories/mcp-server.json,
// extended this phase for tes/crypt4gh/phenopackets/pedigree/rnaget), and
// which GA4GH standard(s) it implements for the common core's ga4gh_standards[].
const SEEDS: PkgSeed[] = [
  { pkg: "trs", displayName: "GA4GH Tool Registry Service (TRS) Server", category: "trs", ga4ghStandards: ["trs"], descriptionMd: "Searches a GA4GH Tool Registry Service (TRS) for registered tools and their versions. Ships as a Cordis plugin, a standalone stdio MCP server, and a bundled skill, part of the `ga4gh-plugins` monorepo." },
  { pkg: "drs", displayName: "GA4GH Data Repository Service (DRS) Server", category: "drs", ga4ghStandards: ["drs"], descriptionMd: "Fetches a DrsObject by id from a configured GA4GH Data Repository Service (DRS) endpoint, as a model-facing tool and a standalone stdio MCP server." },
  { pkg: "beacon", displayName: "GA4GH Beacon v2 Server", category: "beacon", ga4ghStandards: ["beacon"], descriptionMd: "Queries a GA4GH Beacon v2 endpoint's `g_variants` search for variant and dataset existence." },
  { pkg: "htsget", displayName: "GA4GH htsget Server", category: "htsget", ga4ghStandards: ["htsget"], descriptionMd: "Requests GA4GH htsget tickets (byte-range URLs) and service-info documents from a configured htsget server, downloading their data blocks. Bundles the `ga4gh-htsget` skill." },
  { pkg: "data-connect", displayName: "GA4GH Data Connect Server", category: "data-connect", ga4ghStandards: ["data-connect"], descriptionMd: "Searches a configured GA4GH Data Connect endpoint, as a model-facing tool and a standalone stdio MCP server." },
  { pkg: "wes", displayName: "GA4GH Workflow Execution Service (WES) Server", category: "wes", ga4ghStandards: ["wes"], descriptionMd: "Lists workflow runs from a configured GA4GH Workflow Execution Service (WES) endpoint. Bundles the `ga4gh-wes` skill." },
  { pkg: "vrs", displayName: "GA4GH Variation Representation Specification (VRS) Server", category: "vrs", ga4ghStandards: ["vrs"], descriptionMd: "Normalizes a genomic variation expression against a configured GA4GH VRS normalization service. Bundles the `ga4gh-vrs` skill." },
  { pkg: "gks", displayName: "GA4GH Genomic Knowledge Standards (GKS) Server", category: "gks", ga4ghStandards: ["vrs"], descriptionMd: "Meta-server for the GA4GH Genomic Knowledge Standards (GKS) suite: mounts the bundled `ga4gh-vrs` plugin and reports which GKS-family standards it currently bundles." },
  { pkg: "passport", displayName: "GA4GH Passport Server", category: "passport", ga4ghStandards: ["passport"], descriptionMd: "Validates GA4GH Passport visas against a configured clearinghouse. Bundles the `ga4gh-passport` skill." },
  { pkg: "refget", displayName: "GA4GH refget Server", category: "refget", ga4ghStandards: ["refget"], descriptionMd: "GA4GH refget v2.0 sequence-metadata lookup by checksum, as a Cordis plugin, a bundled skill, and a standalone MCP server." },
  { pkg: "service-info", displayName: "GA4GH Service Info Server", category: "service-info", ga4ghStandards: ["service-info"], descriptionMd: "Fetches the standard GA4GH Service Info document from a configured service. Bundles the `ga4gh-service-info` skill." },
  { pkg: "service-registry", displayName: "GA4GH Service Registry Server", category: "service-registry", ga4ghStandards: ["service-registry"], descriptionMd: "Lists services registered with a configured GA4GH Service Registry. Bundles the `ga4gh-service-registry` skill." },
  { pkg: "tes", displayName: "GA4GH Task Execution Service (TES) Server", category: "tes", ga4ghStandards: ["tes"], descriptionMd: "Lists tasks known to a configured GA4GH Task Execution Service (TES) server. Bundles the `ga4gh-tes` skill." },
  { pkg: "crypt4gh", displayName: "GA4GH Crypt4GH Inspector", category: "crypt4gh", ga4ghStandards: ["crypt4gh"], descriptionMd: "GA4GH Crypt4GH header inspector: structurally validates a file header's magic bytes, version, and packet accounting." },
  { pkg: "phenopackets", displayName: "GA4GH Phenopackets Validator", category: "phenopackets", ga4ghStandards: ["phenopackets"], descriptionMd: "Structural validation for GA4GH Phenopacket v2 documents, exposed as a Cordis plugin, a bundled skill, and a standalone MCP server." },
  { pkg: "pedigree", displayName: "GA4GH Pedigree Validator", category: "pedigree", ga4ghStandards: ["pedigree"], descriptionMd: "Structural validation for GA4GH pedigree documents, exposed as a Cordis plugin, a bundled skill, and a standalone MCP server." },
  { pkg: "rnaget", displayName: "GA4GH RNAget Server", category: "rnaget", ga4ghStandards: ["rnaget"], descriptionMd: "Browses GA4GH RNAget metadata and retrieves expression or continuous matrix data through policy-enforced ticket requests and anonymous byte fetches." },
  { pkg: "security", displayName: "GA4GH Security Suite (Passport + Crypt4GH)", category: "other", ga4ghStandards: ["passport", "crypt4gh"], descriptionMd: "Meta-server mounting the `ga4gh-passport` and `ga4gh-crypt4gh` plugins together, reporting which GA4GH security-domain standards the composition bundles." },
];

function nowIso(): string {
  return new Date().toISOString();
}

function readJson(p: string): any {
  return JSON.parse(readFileSync(p, "utf-8"));
}

function writeEntry(dir: string, id: string, entry: unknown) {
  const outDir = path.join(REPO_ROOT, "data", dir);
  const outPath = path.join(outDir, `${id}.json`);
  writeFileSync(outPath, JSON.stringify(entry, null, 2) + "\n");
  return outPath;
}

let written: string[] = [];

for (const seed of SEEDS) {
  const dir = path.join(PLUGINS_ROOT, seed.pkg);
  const packageJson = readJson(path.join(dir, "package.json"));
  const serverJson = readJson(path.join(dir, "server.json"));
  const pluginJsonPath = path.join(dir, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginJsonPath)) {
    throw new Error(`Missing ${pluginJsonPath} -- run the ga4gh-plugins manifest-authoring step first`);
  }
  const pluginJson = readJson(pluginJsonPath);

  const id = `ga4gh-${seed.pkg}`;
  const timestamp = nowIso();
  const common = {
    name: seed.displayName,
    summary: (packageJson.description as string).slice(0, 200),
    description: seed.descriptionMd,
    homepage: `${REPO_URL}/tree/main/packages/${seed.pkg}`,
    repository: REPO_URL,
    license: packageJson.license,
    maintainers: [MAINTAINER],
    version: packageJson.version,
    keywords: packageJson.keywords ?? [],
    ga4gh_standards: seed.ga4ghStandards,
    safety_classification: [] as unknown[],
    certification_tier: "unsigned",
    record: { created: timestamp, updated: timestamp, last_verified: timestamp },
  };

  // --- mcp-server entry ---
  const mcpServerEntry = {
    id,
    type: "mcp-server",
    ...common,
    category: seed.category,
    server: {
      ...serverJson,
      _meta: {
        "org.ga4gh/ai-registry": {
          ga4gh_standards: seed.ga4ghStandards,
        },
      },
    },
  };
  written.push(writeEntry(DATA_DIR_FOR_TYPE["mcp-server"], id, mcpServerEntry));

  // --- plugin entry ---
  const pluginCategory: string = packageJson.ga4gh?.category ?? "other";
  const pluginEntry = {
    id,
    type: "plugin",
    ...common,
    category: pluginCategory,
    plugin: pluginJson,
    ga4gh: {
      keywords: packageJson.keywords ?? [],
      category: pluginCategory,
      harnesses: packageJson.ga4gh.harnesses,
    },
  };
  written.push(writeEntry(DATA_DIR_FOR_TYPE["plugin"], id, pluginEntry));
}

console.log(`Wrote ${written.length} entries (${SEEDS.length} mcp-server + ${SEEDS.length} plugin):`);
for (const f of written) console.log(" ", path.relative(REPO_ROOT, f));
