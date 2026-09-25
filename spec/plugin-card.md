# GA4GH AI Registry: Plugin Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/plugin-entry.v1.schema.json`, embedding `schemas/vendor/plugin.schema.json`
**Applies to**: entries at `data/plugins/<id>.json` with `"type": "plugin"`

## 1. Purpose

This document specifies the normative structure of a coding-harness plugin entry in the GA4GH AI Registry: how it embeds a verbatim Claude Code `plugin.json` document, how the `ga4gh` sibling object records which coding harnesses the plugin targets and how to install it for each, and what a validator or maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in `schemas/plugin-entry.v1.schema.json`, `schemas/entry-core.v1.schema.json`, or the vendored `schemas/vendor/plugin.schema.json`. Where this document and those schema files disagree, the schema files are authoritative.

## 2. Relationship to the Claude Code plugin manifest

A plugin entry embeds the plugin's Claude Code manifest, verbatim, under the `plugin` key, validated against the vendored `schemas/vendor/plugin.schema.json`. The vendored schema places no `additionalProperties` restriction at its root (Claude Code itself documents that it ignores unrecognised top-level fields), so the `ga4gh` sibling object sits alongside `plugin`'s own fields without invalidating it as a `plugin.json`. Stripping `ga4gh` MUST leave a valid, unmodified `plugin.json`.

The `ga4gh` object exists because none of the six surveyed plugin ecosystems (Claude Code, Codex, Gemini CLI, opencode, VS Code, JetBrains) expresses more than one target harness natively, each targeting exactly one by construction. A single upstream package routinely ships both a coding-harness plugin and a standalone MCP server usable by any MCP-capable harness, so `ga4gh.harnesses[]` is this registry's distinctive, multi-harness contribution: it must be able to express more than one target.

## 3. Field reference

### 3.1 Common core

See `spec/entry-core.md` for the fields common to every entry type. `type` is fixed to the literal `"plugin"`.

`category` is free text in v1 (unlike model, agent, skill, and mcp-server entries, which use a closed per-type vocabulary): a closed enumeration is premature at roughly two dozen catalogued packages.

### 3.2 Plugin-specific top-level fields

| Field | Requirement | Type | Description |
|---|---|---|---|
| `plugin` | MUST | object | A verbatim, valid Claude Code `plugin.json` document, per `schemas/vendor/plugin.schema.json` (its only upstream-required field is `name`). |
| `ga4gh` | MUST | object | GA4GH-specific extension, sibling to `plugin`, never inside it. See 3.3. |

### 3.3 `ga4gh` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `keywords` | MAY | string[], unique | |
| `category` | MAY | string | Free text in v1: a closed enumeration is premature at the current catalogue scale. |
| `harnesses` | MUST | array of objects, minItems 1 | Which coding harnesses this plugin targets, and how to install it for each. See 3.4. |

### 3.4 `ga4gh.harnesses[]` item shape

| Field | Requirement | Type | Description |
|---|---|---|---|
| `harness` | MUST | string, one of `claude-code`, `codex`, `gemini-cli`, `opencode`, `mcp-generic`, `agent-plugins` | Closed enumeration, backed by `schemas/vocab/harnesses.json`. `mcp-generic` covers any MCP-capable harness generically; `agent-plugins` names conformance with the vendor-neutral Agent Plugins Specification v1.0.0 (agent-plugins.org), a distinct, governed packaging format from `mcp-generic`. |
| `installCommand` | MUST | string | Exact copy-to-clipboard command or configuration snippet for this harness. |
| `manifestPath` | MAY | string | Path to a harness-specific manifest within the plugin's repository. |
| `compatibility` | MAY | object | `{ minVersion (MUST), maxVersion (MAY) }`. JetBrains-style: set a lower bound, generally omit the upper bound so the plugin is not needlessly pinned to an older harness release. |

No property beyond those listed in 3.2-3.4 is permitted anywhere in a plugin entry's type-specific block: the composed plugin-entry schema, and each nested object within it, closes with `unevaluatedProperties: false`.

## 4. Validation rules

A conforming plugin entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"plugin"`.
2. `plugin` and `ga4gh` MUST both be present; `ga4gh.harnesses` MUST be present and MUST contain at least one item.
3. `plugin` MUST validate against the vendored `schemas/vendor/plugin.schema.json`, independent of and without reference to the `ga4gh` object.
4. Each item in `ga4gh.harnesses[]` MUST carry both `harness` and `installCommand`; `harness` MUST be one of the values in `schemas/vocab/harnesses.json`.
5. `compatibility.minVersion`, when `compatibility` is present, MUST be set; `compatibility.maxVersion` SHOULD generally be omitted unless the plugin is genuinely incompatible with a specific later harness release.
6. Every install snippet rendered for a declared target harness MUST be exactly the `installCommand` string recorded for that harness; the site and any client-side tooling MUST derive it from this field rather than re-deriving or hand-typing a per-harness snippet elsewhere.
7. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate.

## 5. Worked example

Adapted from the real, currently-catalogued entry `data/plugins/biomcp.json`:

```json
{
  "id": "biomcp",
  "type": "plugin",
  "name": "BioMCP",
  "summary": "Claude Code / Codex plugin and MCP server reaching ~30 biomedical data sources (PubMed, ClinVar, ClinicalTrials.gov, OncoKB, Reactome) via one CLI command grammar",
  "description": "BioMCP is a single CLI binary and MCP server exposing one command grammar over roughly thirty trusted biomedical sources for genes, variants, trials, articles, drugs, diseases, pathways, and proteins.",
  "homepage": "https://biomcp.org",
  "repository": "https://github.com/genomoncology/biomcp",
  "license": "MIT",
  "maintainers": [
    { "name": "Susheel Varma", "github": "susheel", "affiliation": "GA4GH AI Workstream / Sage Bionetworks" }
  ],
  "version": "1.0.0",
  "keywords": ["biomedical", "clinvar", "pubmed", "clinical-trials", "mcp-server", "claude-code-plugin"],
  "safety_classification": [],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-08T00:00:00.000Z",
    "updated": "2026-09-08T00:00:00.000Z",
    "last_verified": "2026-09-08T00:00:00.000Z"
  },
  "category": "clinical-genomics",
  "plugin": {
    "name": "biomcp",
    "description": "Biomedical search and evidence retrieval MCP server",
    "version": "1.0.0",
    "author": { "name": "GenomOncology" }
  },
  "ga4gh": {
    "keywords": ["clinvar", "pubmed", "clinical-trials", "biomedical"],
    "category": "clinical-genomics",
    "harnesses": [
      {
        "harness": "claude-code",
        "installCommand": "/plugin marketplace add genomoncology/biomcp\n/plugin install biomcp@biomcp"
      },
      {
        "harness": "codex",
        "installCommand": "codex mcp add biomcp -- biomcp serve"
      },
      {
        "harness": "mcp-generic",
        "installCommand": "{\n  \"mcpServers\": {\n    \"biomcp\": {\n      \"command\": \"biomcp\",\n      \"args\": [\"serve\"]\n    }\n  }\n}"
      }
    ]
  }
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/model-card.md`, `spec/agent-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/bundle.md` for the other five entry types.
- `schemas/vendor/plugin.schema.json` for the full vendored upstream `plugin.json` shape.
- `docs/TECH.md` Section 3.5.5 and `docs/PRD.md` Section 6.6 for the design rationale behind this profile.
