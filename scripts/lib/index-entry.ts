import { deriveAllInstallSnippets, type InstallableServer, type InstallSnippet } from "../install-snippets.js";
import type { AnyEntry, EntryType } from "./types.js";

/**
 * The compact per-entry shape published in index.json and index/<type>.json
 * (internal project documentation Section 7.1). This is deliberately a summary, not the full
 * entry: internal project documentation Section 8.2 says `ga4gh_ai_registry_search` "Returns
 * ranked summaries, not full entries", while `ga4gh_ai_registry_get` fetches
 * one full entry -- from data/<type>/<slug>.json, the one place a full entry
 * lives (internal project documentation Section 1.1). Fields chosen are exactly the ones
 * internal project documentation Section 4.2 and Section 8.2 name as facets or listing fields:
 * type, category, keywords, ga4gh_standards, certification_tier,
 * safety_classification (all facets), plus enough identity to render a
 * listing without a second fetch (id, name, summary, license, homepage,
 * repository, version, record). `harnesses` is included only for plugin
 * entries, since internal project documentation Section 8.2 names `harness` as a facet
 * specific to that type. `install` is included only for mcp-server entries:
 * this is the install-snippets.ts packaging decision (see that module's own
 * header) in effect -- snippets are derived once, here at build time, and
 * embedded in the published index, so `ga4gh_ai_registry_install` (TECH.md
 * Section 8.2) is a pure consumer of an already-derived value rather than
 * re-deriving it. A server with nothing derivable (internal project documentation Section
 * 3.5.4's mcpb case) simply carries an empty `install` array.
 */
export interface IndexEntrySummary {
  id: string;
  type: EntryType;
  name: string;
  summary: string;
  category: string;
  keywords: string[];
  ga4gh_standards: string[];
  certification_tier: string;
  safety_classification: unknown[];
  license: string;
  homepage: string;
  repository: string;
  version: string;
  record: unknown;
  harnesses?: string[];
  install?: InstallSnippet[];
}

export function toIndexEntrySummary(entry: AnyEntry, type: EntryType): IndexEntrySummary {
  const summary: IndexEntrySummary = {
    id: String(entry.id ?? ""),
    type,
    name: String(entry.name ?? ""),
    summary: String(entry.summary ?? ""),
    category: String(entry.category ?? ""),
    keywords: Array.isArray(entry.keywords) ? (entry.keywords as string[]) : [],
    ga4gh_standards: Array.isArray(entry.ga4gh_standards) ? (entry.ga4gh_standards as string[]) : [],
    certification_tier: String(entry.certification_tier ?? "unsigned"),
    safety_classification: Array.isArray(entry.safety_classification) ? entry.safety_classification : [],
    license: String(entry.license ?? ""),
    homepage: String(entry.homepage ?? ""),
    repository: String(entry.repository ?? ""),
    version: String(entry.version ?? ""),
    record: entry.record ?? {},
  };

  if (type === "plugin") {
    const ga4gh = entry.ga4gh as { harnesses?: Array<{ harness?: string }> } | undefined;
    summary.harnesses = (ga4gh?.harnesses ?? [])
      .map((h) => h.harness)
      .filter((h): h is string => typeof h === "string");
  }

  if (type === "mcp-server" && entry.server) {
    const server = entry.server as { name?: string; packages?: unknown; remotes?: unknown };
    summary.install = deriveAllInstallSnippets({
      name: String(server.name ?? summary.id),
      packages: server.packages,
      remotes: server.remotes,
    } as unknown as InstallableServer);
  }

  return summary;
}
