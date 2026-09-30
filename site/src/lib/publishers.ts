/**
 * Publisher groups across every content collection, for /publishers/ and
 * /publishers/<id>/. The grouping itself lives in scripts/lib/publishers.ts
 * (shared with the validator and unit-tested there); this module only feeds
 * it the Astro collections.
 */
import { getCollection } from "astro:content";
import { groupEntriesByPublisher, type PublisherGroup } from "../../../scripts/lib/publishers.js";
import { COLLECTION_KEYS, TYPE_META } from "./registry-types.js";

export async function loadPublisherGroups(): Promise<PublisherGroup[]> {
  const inputs = [];
  for (const key of COLLECTION_KEYS) {
    for (const entry of await getCollection(key)) {
      inputs.push({ type: TYPE_META[key].type, collection: key, id: entry.id, data: entry.data as Record<string, unknown> });
    }
  }
  return groupEntriesByPublisher(inputs);
}
