# GA4GH AI Registry: MCP Server Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/mcp-server-entry.v1.schema.json`, embedding `schemas/vendor/server.schema.json`
**Applies to**: entries at `data/mcp-servers/<id>.json` with `"type": "mcp-server"`

## 1. Purpose

This document specifies the normative structure of an MCP server entry in the GA4GH AI Registry: how it embeds a verbatim, valid `server.json` document, where GA4GH-specific metadata is allowed to live inside that document, and what a validator or maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in `schemas/mcp-server-entry.v1.schema.json`, `schemas/entry-core.v1.schema.json`, or the vendored `schemas/vendor/server.schema.json`. Where this document and those schema files disagree, the schema files are authoritative.

## 2. Relationship to the official MCP Registry `server.json` format

An MCP server entry embeds the server's official MCP registry manifest, verbatim, under the `server` key. The embedded document MUST validate against the vendored `schemas/vendor/server.schema.json` (`ServerDetail`), the same schema the official MCP Registry (`registry.modelcontextprotocol.io`) uses, and MUST be lift-out-able: stripping the single key `server._meta["org.ga4gh/ai-registry"]` MUST leave a valid, unmodified `server.json` publishable to `registry.modelcontextprotocol.io` without further transformation.

Vendoring `server.schema.json` means an upstream schema update is a deliberate, reviewed bump (update the vendored file, re-run validation against every existing entry, commit), not a silent break.

All GA4GH additions live inside `server._meta["org.ga4gh/ai-registry"]`, the upstream schema's own sanctioned reverse-DNS extension point. No GA4GH field is ever added as a sibling key on the `server` document itself, because that would invalidate it against the upstream schema. This reverse-DNS reservation convention comes from the MCP protocol specification itself (its 2026-07-28 revision), not only from the separate MCP Registry `server.json` layer, and `org.ga4gh/ai-registry` sits safely outside the small set of reserved second labels (`modelcontextprotocol`, `mcp`) at both layers.

`server.packages[]` and `server.remotes[]` already cover any externally hosted distribution mechanism an MCP server might use (an npm, PyPI, OCI, or NuGet registry package; a direct-download URL; or a remote streamable-http/SSE endpoint). This schema therefore adds no separate hosting field of its own.

## 3. Field reference

### 3.1 Common core

See `spec/entry-core.md` for the fields common to every entry type. `type` is fixed to the literal `"mcp-server"`.

`category` MUST be one value from `schemas/vocab/categories/mcp-server.json`: `trs`, `drs`, `beacon`, `htsget`, `data-connect`, `wes`, `vrs`, `gks`, `passport`, `refget`, `service-info`, `service-registry`, `tes`, `crypt4gh`, `phenopackets`, `pedigree`, `rnaget`, or `other`. `service-info` (a single service's own self-description endpoint) and `service-registry` (a registry listing many services) are deliberately kept as separate categories: the two protocols are adjacent but distinct, and conflating them would mis-file a server that implements one but not the other.

The common core's `ga4gh_standards[]` is REQUIRED on an MCP server entry (unlike on other entry types, where it is optional): it is the coarse, version-free browse and search facet for which GA4GH API specification(s) the entry touches, and it MUST be present so the server is browsable and filterable by standard.

### 3.2 MCP-server-specific top-level field

| Field | Requirement | Type | Description |
|---|---|---|---|
| `server` | MUST | object | A verbatim, valid `server.json` document (per `schemas/vendor/server.schema.json`'s `ServerDetail` definition), plus the required `_meta["org.ga4gh/ai-registry"]` extension block. See 3.3 and 3.4. |

### 3.3 `server` object: upstream fields (unmodified by this profile)

These fields are defined by the vendored `server.schema.json`, not by this registry, and are listed here for completeness. `name`, `description`, and `version` are required by the upstream `Server` definition; `packages[]`, `remotes[]`, `repository`, `status`, and `websiteUrl` are optional upstream fields this registry does not further constrain. See `schemas/vendor/server.schema.json` for the complete upstream shape.

### 3.4 `server._meta["org.ga4gh/ai-registry"]` object (the sole GA4GH extension point)

| Field | Requirement | Type | Description |
|---|---|---|---|
| `ga4gh_standards` | MUST | string[], unique, minItems 1 | Which GA4GH API specification(s) this server implements, and at what version, e.g. `"trs@2.0.1"`: a bare kebab-case identifier with an optional `@version` suffix whose version part starts with a digit (so `"trs@v2.0.1"` is not a second spelling of `"trs@2.0.1"`). This is the precise implementation claim; the common core's `ga4gh_standards[]` (3.1) is the coarse, version-free browse facet. |
| `safety_classification` | MAY | array | Same shape as the common core's `safety_classification[]` (`spec/entry-core.md` Section 3.3). |
| `duo` | MAY | string[] | Optional Data Use Ontology / consent metadata associated with data this server exposes. |
| `protocol_era` | MAY | string, one of `legacy`, `modern`, `dual` | Optional, submitter-asserted: which MCP protocol era (2026-07-28 revision) this server supports. A GA4GH addition, not an upstream field. |

No property beyond those listed in 3.4 is permitted inside `server._meta["org.ga4gh/ai-registry"]`; no property beyond `_meta` and the upstream `server.schema.json` fields is permitted inside `server` itself.

## 4. Validation rules

A conforming MCP server entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"mcp-server"`.
2. `server` and the common core's `ga4gh_standards[]` MUST both be present.
3. `server` MUST validate against `schemas/vendor/server.schema.json`'s `ServerDetail` definition, including its own `name`, `description`, and `version` requirements.
4. `server._meta["org.ga4gh/ai-registry"]` MUST be present and MUST carry a non-empty `ga4gh_standards[]`.
5. Stripping any `@<version>` suffix from every item in `server._meta["org.ga4gh/ai-registry"].ga4gh_standards[]` MUST yield a subset of the common core's `ga4gh_standards[]`: every standard a server claims to implement precisely MUST also be browsable at the coarse facet level, while the coarse facet array MAY additionally name a standard the server merely touches without a version-qualified implementation claim.
6. Stripping `server._meta["org.ga4gh/ai-registry"]` from `server` MUST leave a document that independently validates as a standalone, unmodified `server.json` against the unmodified vendored schema.
7. Every install snippet a consumer derives for this entry (Claude Desktop, Claude Code, Cursor, VS Code, and a Cursor deeplink where applicable) MUST be derived from `server.packages[].transport` and `server.remotes[].type`/`headers[]` at build or request time; no per-client snippet is stored on the entry itself.
8. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate.

## 5. Worked example

Adapted from the real, currently-catalogued entry `data/mcp-servers/ga4gh-trs.json`:

```json
{
  "id": "ga4gh-trs",
  "type": "mcp-server",
  "name": "GA4GH Tool Registry Service (TRS) Server",
  "summary": "Searches a GA4GH Tool Registry Service (TRS) for registered tools and their versions, and registers the bundled ga4gh-trs skill",
  "description": "Searches a GA4GH Tool Registry Service (TRS) for registered tools and their versions. Ships as a Cordis plugin, a standalone stdio MCP server, and a bundled skill, part of the ga4gh-plugins monorepo.",
  "homepage": "https://github.com/susheel/ga4gh-plugins/tree/main/packages/trs",
  "repository": "https://github.com/susheel/ga4gh-plugins",
  "license": "MIT",
  "maintainers": [
    { "name": "Susheel Varma", "github": "susheel", "affiliation": "GA4GH AI Workstream / Sage Bionetworks" }
  ],
  "version": "0.1.0-rc.5",
  "keywords": ["ga4gh", "trs", "cordis-plugin", "mcp-server"],
  "ga4gh_standards": ["trs"],
  "safety_classification": [],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-03T19:00:06.074Z",
    "updated": "2026-09-03T19:00:06.074Z",
    "last_verified": "2026-09-03T19:00:06.074Z"
  },
  "category": "trs",
  "server": {
    "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json",
    "name": "io.github.deepseek-ai/ga4gh-trs",
    "description": "Searches a GA4GH Tool Registry Service (TRS) for registered tools and their versions",
    "version": "0.1.0-rc.5",
    "websiteUrl": "https://github.com/susheel/ga4gh-plugins/tree/main/packages/trs",
    "repository": {
      "url": "https://github.com/susheel/ga4gh-plugins.git",
      "source": "github",
      "subfolder": "packages/trs"
    },
    "packages": [
      {
        "registryType": "npm",
        "registryBaseUrl": "https://registry.npmjs.org",
        "identifier": "@deepseek-ai/dsh-ga4gh-trs",
        "version": "0.1.0-rc.5",
        "transport": { "type": "stdio" }
      }
    ],
    "_meta": {
      "org.ga4gh/ai-registry": {
        "ga4gh_standards": ["trs"]
      }
    }
  }
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/model-card.md`, `spec/agent-card.md`, `spec/skill-card.md`, `spec/plugin-card.md`, `spec/bundle.md` for the other five entry types.
- `schemas/vendor/server.schema.json` for the full vendored upstream `server.json` shape.
- `docs/TECH.md` Section 3.5.4 and `docs/PRD.md` Section 6.5 for the design rationale behind this profile.
