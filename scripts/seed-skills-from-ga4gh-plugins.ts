#!/usr/bin/env tsx
/**
 * scripts/seed-skills-from-ga4gh-plugins.ts -- Phase 6 (internal project documentation) skill
 * seed-content generator.
 *
 * Reads each ga4gh-plugins package's real SKILL.md (YAML frontmatter, present
 * for all 25 packages already) and its newly-authored EVALUATION-CRITERIA.md
 * (a Phase 6 prerequisite: no such document existed before this phase; see
 * internal project documentation Phase 6 handoff notes) and emits one skill entry per package.
 *
 * Excludes mock-server (a testing fixture) and the 6 empty-harnesses[]
 * meta/infra packages, matching seed-from-ga4gh-plugins.ts's own exclusions.
 *
 * Usage: tsx scripts/seed-skills-from-ga4gh-plugins.ts [--ga4gh-plugins-root <path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
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

type Kind = "read" | "validate" | "authorize";

interface SkillSeed {
  pkg: string;
  standard: string;
  kind: Kind;
  category: string; // schemas/vocab/categories/skill.json
}

const SEEDS: SkillSeed[] = [
  { pkg: "trs", standard: "GA4GH Tool Registry Service (TRS)", kind: "read", category: "other" },
  { pkg: "drs", standard: "GA4GH Data Repository Service (DRS)", kind: "read", category: "other" },
  { pkg: "beacon", standard: "GA4GH Beacon v2", kind: "read", category: "other" },
  { pkg: "htsget", standard: "GA4GH htsget", kind: "read", category: "other" },
  { pkg: "data-connect", standard: "GA4GH Data Connect", kind: "read", category: "other" },
  { pkg: "wes", standard: "GA4GH Workflow Execution Service (WES)", kind: "read", category: "other" },
  { pkg: "vrs", standard: "GA4GH Variation Representation Specification (VRS)", kind: "read", category: "variant-interpretation" },
  { pkg: "gks", standard: "GA4GH Genomic Knowledge Standards (GKS) suite", kind: "read", category: "variant-interpretation" },
  { pkg: "passport", standard: "GA4GH Passport", kind: "authorize", category: "governance-support" },
  { pkg: "refget", standard: "GA4GH refget", kind: "read", category: "other" },
  { pkg: "service-info", standard: "GA4GH Service Info", kind: "read", category: "other" },
  { pkg: "service-registry", standard: "GA4GH Service Registry", kind: "read", category: "other" },
  { pkg: "tes", standard: "GA4GH Task Execution Service (TES)", kind: "read", category: "other" },
  { pkg: "crypt4gh", standard: "GA4GH Crypt4GH", kind: "validate", category: "governance-support" },
  { pkg: "phenopackets", standard: "GA4GH Phenopacket v2", kind: "validate", category: "data-curation" },
  { pkg: "pedigree", standard: "GA4GH pedigree", kind: "validate", category: "data-curation" },
  { pkg: "rnaget", standard: "GA4GH RNAget", kind: "read", category: "other" },
  { pkg: "security", standard: "GA4GH Passport and Crypt4GH (composed)", kind: "authorize", category: "governance-support" },
];

const IO_FOR_KIND: Record<Kind, { inputs: unknown[]; outputs: unknown[]; humanOversight: string }> = {
  read: {
    inputs: [
      { name: "endpoint_url", type: "string", description: "Base URL of the configured endpoint to query." },
      { name: "query_parameters", type: "object", description: "Standard-specific filter, search, or lookup parameters; see the skill's own tool table." },
    ],
    outputs: [
      { name: "result", type: "object", description: "Structured response from the queried endpoint, per the standard's own schema, unmodified." },
    ],
    humanOversight: "recommended",
  },
  validate: {
    inputs: [
      { name: "document", type: "string", description: "The document or file content to validate structurally against the standard." },
    ],
    outputs: [
      { name: "validation_result", type: "object", description: "Pass/fail outcome; on failure, the specific rule violated." },
    ],
    humanOversight: "recommended",
  },
  authorize: {
    inputs: [
      { name: "document_or_endpoint", type: "string", description: "The visa/credential document or clearinghouse endpoint to validate." },
    ],
    outputs: [
      { name: "validation_result", type: "object", description: "Pass/fail outcome; on failure, the specific rule violated. Informs, but does not itself make, a data-access decision." },
    ],
    humanOversight: "required",
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseFrontmatter(skillMd: string): Record<string, unknown> {
  const match = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("SKILL.md has no YAML frontmatter block");
  const yamlText = match[1]!;
  // Minimal, dependency-free YAML-subset parser sufficient for these files'
  // known shape (scalar keys, one nested `metadata:` object, one empty-array
  // `allowed-tools: []`). Not a general YAML parser.
  const lines = yamlText.split("\n");
  const result: Record<string, unknown> = {};
  let currentNested: string | null = null;
  for (const line of lines) {
    if (line.startsWith("  ") && currentNested) {
      const m = line.trim().match(/^([\w-]+):\s*(.*)$/);
      if (m) {
        (result[currentNested] as Record<string, unknown>)[m[1]!] = m[2]!.trim();
      }
      continue;
    }
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (rawValue === "" ) {
      result[key!] = {};
      currentNested = key!;
    } else if (rawValue === "[]") {
      result[key!] = [];
      currentNested = null;
    } else {
      result[key!] = rawValue;
      currentNested = null;
    }
  }
  return result;
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
  const packageJson = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf-8"));
  const skillMdRaw = readFileSync(path.join(dir, "SKILL.md"), "utf-8");
  const frontmatter = parseFrontmatter(skillMdRaw);

  const id = `ga4gh-${seed.pkg}`;
  const timestamp = nowIso();
  const io = IO_FOR_KIND[seed.kind];

  const skillEntry = {
    id,
    type: "skill",
    name: `${frontmatter.name} skill`,
    summary: (frontmatter.description as string).split(". ")[0]!.slice(0, 200),
    description: `Bundled Claude Code / MCP skill for ${seed.standard}, shipped alongside the \`${packageJson.name}\` Cordis plugin and standalone MCP server in the \`ga4gh-plugins\` monorepo. ${frontmatter.description}`,
    homepage: `${REPO_URL}/tree/main/packages/${seed.pkg}`,
    repository: REPO_URL,
    license: frontmatter.license ?? packageJson.license,
    maintainers: [MAINTAINER],
    version: packageJson.version,
    keywords: packageJson.keywords ?? [],
    category: seed.category,
    ga4gh_standards: [seed.pkg === "security" ? "passport" : seed.pkg === "gks" ? "vrs" : seed.pkg],
    safety_classification: [] as unknown[],
    certification_tier: "unsigned",
    record: { created: timestamp, updated: timestamp, last_verified: timestamp },
    skill: frontmatter,
    source: {
      repository: {
        url: `${REPO_URL}.git`,
        subfolder: `packages/${seed.pkg}`,
      },
    },
    inputs: io.inputs,
    outputs: io.outputs,
    human_oversight: io.humanOversight,
    provenance_logging: false,
    evaluation_criteria_uri: `${REPO_URL}/blob/main/packages/${seed.pkg}/EVALUATION-CRITERIA.md`,
    host_runtimes: ["claude-code", "codex", "gemini-cli", "opencode"],
  };

  written.push(writeEntry(DATA_DIR_FOR_TYPE["skill"], id, skillEntry));
}

console.log(`Wrote ${written.length} skill entries:`);
for (const f of written) console.log(" ", path.relative(REPO_ROOT, f));
