/**
 * Closed-vocabulary lookups for facet labels, read directly from
 * schemas/vocab/*.json (internal project documentation Section 3.6) rather than re-derived from
 * schema enums: some facets, `category` included, are vocab-file-only with no
 * schema-level enum at all (the local continuation-prompt file's Phase 3 reading-order note).
 */
import categoriesModel from "../../../schemas/vocab/categories/model.json";
import categoriesAgent from "../../../schemas/vocab/categories/agent.json";
import categoriesSkill from "../../../schemas/vocab/categories/skill.json";
import categoriesMcpServer from "../../../schemas/vocab/categories/mcp-server.json";
import harnessesVocab from "../../../schemas/vocab/harnesses.json";
import safetySchemesVocab from "../../../schemas/vocab/safety-schemes.json";

import type { CollectionKey } from "./registry-types.js";

interface VocabItem {
  id: string;
  name: string;
}

const CATEGORY_VOCAB: Partial<Record<CollectionKey, VocabItem[]>> = {
  models: categoriesModel.categories,
  agents: categoriesAgent.categories,
  skills: categoriesSkill.categories,
  "mcp-servers": categoriesMcpServer.categories,
  // plugins: free text in v1 (internal project documentation Section 3.6, D12) -- no closed vocab file.
};

export function categoriesForCollection(key: CollectionKey): VocabItem[] {
  return CATEGORY_VOCAB[key] ?? [];
}

export function categoryLabel(key: CollectionKey, categoryId: string): string {
  return categoriesForCollection(key).find((c) => c.id === categoryId)?.name ?? categoryId;
}

export const HARNESSES: VocabItem[] = harnessesVocab.harnesses;

export function harnessLabel(harnessId: string): string {
  return HARNESSES.find((h) => h.id === harnessId)?.name ?? harnessId;
}

export interface SafetyScheme extends VocabItem {
  description: string;
  levels: string[];
}

export const SAFETY_SCHEMES: SafetyScheme[] = safetySchemesVocab.schemes;

export function safetySchemeLabel(schemeId: string): string {
  return SAFETY_SCHEMES.find((s) => s.id === schemeId)?.name ?? schemeId;
}

/**
 * Reader-facing labels for the two safety schemes. The scheme `name` in
 * schemas/vocab/safety-schemes.json is the formal title of the scheme; the
 * interface shows these shorter labels instead and links each one to its
 * explanation on /safety-levels/. Scheme ids and level codes are unchanged.
 */
export const SAFETY_DISPLAY: Record<string, { label: string; anchor: string }> = {
  "ga4gh-gase": { label: "Safety level", anchor: "safety-level" },
  "ga4gh-agent-runtime-risk": { label: "Runtime risk tier", anchor: "runtime-risk-tier" },
};

export function safetyDisplayLabel(schemeId: string): string {
  return SAFETY_DISPLAY[schemeId]?.label ?? safetySchemeLabel(schemeId);
}

/** Fragment on /safety-levels/ explaining one scheme, or one level within it. */
export function safetyLevelAnchor(schemeId: string, level?: string): string {
  const base = SAFETY_DISPLAY[schemeId]?.anchor ?? "top";
  if (!level) return base;
  const slug = level.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return schemeId === "ga4gh-gase" ? slug : `${base}-${slug}`;
}
