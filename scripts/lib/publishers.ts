/**
 * Groups registry entries by `upstream.publisher.id`, for the site's
 * /publishers/ index and /publishers/<id>/ pages, and for the cross-file
 * consistency check in scripts/validate.ts. Pure: takes plain entry records,
 * so the site (Astro collections) and the scripts (data/ files) share it.
 */
import { deriveQualifiedId, normaliseSegment, readUpstream, type UpstreamPublisher } from "./upstream.js";
import type { EntryType } from "./types.js";

export interface PublisherEntryInput {
  type: EntryType;
  /** Collection key used in site URLs, e.g. "mcp-servers". */
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface PublisherEntry {
  type: EntryType;
  collection: string;
  id: string;
  name: string;
  qualifiedId: string;
}

export interface PublisherGroup {
  /** Normalised publisher id, used as the URL segment. */
  id: string;
  name: string;
  type: UpstreamPublisher["type"];
  url?: string;
  entries: PublisherEntry[];
  /** Distinct names or types seen for this id across entries, when they disagree. */
  conflicts: string[];
}

export function groupEntriesByPublisher(inputs: PublisherEntryInput[]): PublisherGroup[] {
  const groups = new Map<string, PublisherGroup>();
  for (const input of inputs) {
    const upstream = readUpstream(input.data);
    if (!upstream) continue;
    const id = normaliseSegment(upstream.publisher.id);
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: upstream.publisher.name,
        type: upstream.publisher.type,
        url: upstream.publisher.url,
        entries: [],
        conflicts: [],
      };
      groups.set(id, group);
    } else {
      if (upstream.publisher.name !== group.name) {
        group.conflicts.push(`name "${upstream.publisher.name}" (${input.collection}/${input.id}) vs "${group.name}"`);
      }
      if (upstream.publisher.type !== group.type) {
        group.conflicts.push(`type "${upstream.publisher.type}" (${input.collection}/${input.id}) vs "${group.type}"`);
      }
      group.url ??= upstream.publisher.url;
    }
    group.entries.push({
      type: input.type,
      collection: input.collection,
      id: input.id,
      name: typeof input.data["name"] === "string" ? (input.data["name"] as string) : input.id,
      qualifiedId: deriveQualifiedId(upstream),
    });
  }
  for (const group of groups.values()) {
    group.entries.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}
