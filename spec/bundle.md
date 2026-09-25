# GA4GH AI Registry: Bundle Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/bundle-entry.v1.schema.json`, embedding `schemas/vendor/marketplace.schema.json`
**Applies to**: entries at `data/bundles/<id>.json` with `"type": "bundle"`

## 1. Purpose

This document specifies the normative structure of a bundle entry in the GA4GH AI Registry: how it embeds a verbatim Claude Code `marketplace.json` document, how the `ga4gh` sibling object records provenance and cross-references, and what a validator or maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in `schemas/bundle-entry.v1.schema.json`, `schemas/entry-core.v1.schema.json`, or the vendored `schemas/vendor/marketplace.schema.json`. Where this document and those schema files disagree, the schema files are authoritative.

## 2. Relationship to the Claude Code marketplace manifest, and to the other five entry types

A bundle entry catalogues a vendor-curated collection, a marketplace, of plugins and skills as a single registry entry, rather than requiring every member of that collection to be submitted individually. It embeds the marketplace's manifest, verbatim, under the `marketplace` key, validated against the vendored `schemas/vendor/marketplace.schema.json`. As with a plugin entry, the vendored schema places no `additionalProperties` restriction at its root, so the `ga4gh` sibling object sits alongside `marketplace`'s own fields without invalidating it. Stripping `ga4gh`, `source_uri`, and `last_synced` MUST leave a valid, unmodified `marketplace.json`.

Bundle is the one entry type admitted on a different rationale than the other five. A bundle curator has no named GA4GH project sponsorship of its own by definition; a bundle is instead admitted case by case at submission review as a real, publicly discoverable collection with clear genomics or health-research relevance. `category` and `license` follow the same free-text and `"other"`-with-`license_url` precedent as a plugin entry, for the same reason: a closed vocabulary, or a single licence value, is premature (and for licence, often simply inapplicable, since a marketplace's member plugins are typically licensed separately by their own providers) at bundle-catalogue scale.

A bundle entry represents a cached snapshot of an externally maintained collection, not a live feed: `source_uri` records where the embedded document was fetched from, and `last_synced` records when that snapshot was last refreshed, matching the convention model entries use for external mirrors.

## 3. Field reference

### 3.1 Common core

See `spec/entry-core.md` for the fields common to every entry type. `type` is fixed to the literal `"bundle"`.

`category` is free text in v1, following the same precedent as a plugin entry's `ga4gh.category`. `license` commonly has no single value for a bundle; `license: "other"` with `license_url` pointing at whatever page explains the licensing situation (a repository README section, for example) is the expected shape, not a workaround.

### 3.2 Bundle-specific top-level fields

| Field | Requirement | Type | Description |
|---|---|---|---|
| `marketplace` | MUST | object | A verbatim, valid Claude Code `marketplace.json` document, per `schemas/vendor/marketplace.schema.json` (its upstream-required fields are `name`, `owner`, and `plugins`). |
| `source_uri` | MUST | string (URI) | Where this entry's embedded marketplace document was fetched from, so a maintainer can re-verify or refresh the mirrored content. |
| `last_synced` | MAY | string (date-time) | Timestamp of the last mirror refresh of the embedded marketplace document from `source_uri`. SHOULD be present and rendered on the detail page. |
| `ga4gh` | MAY | object | GA4GH-specific extension, sibling to `marketplace`, never inside it. See 3.3. |

### 3.3 `ga4gh` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `keywords` | MAY | string[], unique | |
| `members` | MAY | array of objects, unique | Cross-references from this bundle to entries already catalogued elsewhere in this registry. See 3.4. Most of a bundle's listed member plugins will have no corresponding registry entry and are simply not referenced here; this is expected, not an error. |

### 3.4 `ga4gh.members[]` item shape

| Field | Requirement | Type | Description |
|---|---|---|---|
| `type` | MUST | string, one of `model`, `agent`, `skill`, `mcp-server`, `plugin` | The referenced entry's own registry type. Deliberately never `"bundle"`: a bundle cross-referencing another bundle is out of scope for v1. |
| `id` | MUST | string | The referenced entry's registry slug (`data/<type>/<id>.json`). |

No property beyond those listed in 3.2-3.4 is permitted anywhere in a bundle entry's type-specific block: the composed bundle-entry schema, and each nested object within it, closes with `unevaluatedProperties: false`.

## 4. Validation rules

A conforming bundle entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"bundle"`.
2. `marketplace` and `source_uri` MUST both be present.
3. `marketplace` MUST validate against the vendored `schemas/vendor/marketplace.schema.json`, independent of and without reference to the `ga4gh` object, `source_uri`, or `last_synced`.
4. Each item in `ga4gh.members[]`, when present, MUST carry both `type` and `id`, and `type` MUST NOT be `"bundle"`.
5. Each `(type, id)` pair in `ga4gh.members[]` MUST resolve to an existing `data/<type>/<id>.json` file. This is a cross-file check performed by `scripts/validate.ts`, alongside slug-uniqueness, not a per-entry schema rule.
6. `license: "other"` MUST be paired with a `license_url` explaining the bundle's actual licensing situation, per the common-core rule (`spec/entry-core.md` Section 3.2), when no single licence value applies across the bundle's members.
7. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate.

## 5. Worked example

Adapted from the real, currently-catalogued entry `data/bundles/anthropic-life-sciences.json`, trimmed for brevity:

```json
{
  "id": "anthropic-life-sciences",
  "type": "bundle",
  "name": "Anthropic Life Sciences Marketplace",
  "summary": "A vendor-curated Claude Code marketplace of MCP servers and skills for life-sciences research, data analysis, and discovery.",
  "description": "Anthropic's own Claude Code plugin marketplace for life sciences: 21 plugins bundling MCP servers and skills for biomedical and genomic research workflows.",
  "homepage": "https://github.com/anthropics/life-sciences",
  "repository": "https://github.com/anthropics/life-sciences",
  "license": "other",
  "license_url": "https://github.com/anthropics/life-sciences#license",
  "maintainers": [
    { "name": "Susheel Varma", "github": "susheel", "affiliation": "GA4GH AI Workstream / Sage Bionetworks" }
  ],
  "version": "1.0.0",
  "keywords": ["life-sciences", "biomedical-research", "claude-code-marketplace"],
  "category": "life-sciences",
  "safety_classification": [],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-07T00:00:00.000Z",
    "updated": "2026-09-07T00:00:00.000Z",
    "last_verified": "2026-09-07T00:00:00.000Z"
  },
  "marketplace": {
    "name": "life-sciences",
    "owner": { "name": "Anthropic", "email": "support@anthropic.com" },
    "metadata": {
      "version": "1.0.0",
      "description": "MCP servers and skills for life sciences research, data analysis, and discovery"
    },
    "plugins": [
      {
        "name": "synapse",
        "source": "./synapse",
        "description": "Synapse.org MCP server by Sage Bionetworks for collaborative research data management",
        "category": "life-sciences",
        "tags": ["research", "data-management", "collaboration"]
      }
    ]
  },
  "source_uri": "https://raw.githubusercontent.com/anthropics/life-sciences/main/.claude-plugin/marketplace.json",
  "last_synced": "2026-09-07T00:00:00.000Z",
  "ga4gh": {
    "keywords": ["life-sciences"],
    "members": []
  }
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/model-card.md`, `spec/agent-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md` for the other five entry types.
- `schemas/vendor/marketplace.schema.json` for the full vendored upstream `marketplace.json` shape.
- `docs/TECH.md` Section 3.5.6 and `docs/PRD.md` Section 4.3 and Section 6.9 for the design rationale behind this profile, and `research/2026-09-04-bundle-grouping-decision-analysis.md` (D47) for the admission-rationale decision record.
