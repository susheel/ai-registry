# GA4GH AI Registry: Common Entry Core Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json`
**Applies to**: every entry in `data/`, regardless of `type`

## 1. Purpose

This document specifies the normative structure of the fields every registry entry carries, regardless of its type. It is composed, via JSON Schema `allOf`, into each of the six per-type schemas (`schemas/model-entry.v1.schema.json`, `agent-entry.v1.schema.json`, `skill-entry.v1.schema.json`, `mcp-server-entry.v1.schema.json`, `plugin-entry.v1.schema.json`, `bundle-entry.v1.schema.json`). Each per-type specification (`spec/model-card.md`, `spec/agent-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md`, `spec/bundle.md`) states only what is specific to that type, and refers back to this document for the fields listed here.

This specification defines no fields that are not already present in `schemas/entry-core.v1.schema.json`. Where this document and that schema file disagree, the schema file is authoritative.

`entry-core.v1.schema.json` deliberately does not itself close its shape with `unevaluatedProperties: false`, precisely so it can be safely `allOf`-composed; each per-type schema closes the composed shape itself. A field is therefore permitted on an entry only if it is listed here or in that entry's own per-type specification.

## 2. Field reference

| Field | Requirement | Type | Description |
|---|---|---|---|
| `id` | MUST | string, pattern `^[a-z0-9][a-z0-9-]*$`, length 2-100 | Registry slug, unique within its type. Used as the filename stem (`data/<type>/<id>.json`) and in machine-readable output keys. |
| `type` | MUST | string, one of `model`, `agent`, `skill`, `mcp-server`, `plugin`, `bundle` | The content type this entry belongs to. A closed enumeration; each per-type schema fixes this to its own literal value. |
| `name` | MUST | string, length 1-200 | Display name. |
| `summary` | MUST | string, length 1-200 | Single line, used in listings and search results. |
| `description` | MUST | string, non-empty | Markdown, unbounded, rendered on the detail page. |
| `homepage` | MUST | string (URI) | Project or product homepage. |
| `repository` | MUST | string (URI) | Source code repository URL. |
| `license` | MUST | string, non-empty | An SPDX licence identifier present in `schemas/vocab/licenses.json`, or the literal string `"other"` paired with a required `license_url`. |
| `license_url` | conditional | string (URI) | MUST be present when `license` is `"other"`. |
| `maintainers` | MUST | array of objects, minItems 1 | At least one maintainer. See 2.1. |
| `version` | MUST | string, non-empty | The version of the underlying model, agent, skill, server, or plugin that this entry indexes. |
| `keywords` | MUST | string[], unique | Free-text search facet terms. MAY be empty. |
| `category` | MUST | string, non-empty | A single value from the per-type category vocabulary (`schemas/vocab/categories/<type>.json`), except for `plugin` and `bundle` entries, which use free text in v1 (see `spec/plugin-card.md` and `spec/bundle.md`). |
| `ga4gh_standards` | MAY (MUST for `mcp-server`) | string[], unique, pattern `^[a-z][a-z0-9-]*$` per item | The coarse, version-free browse and search facet for which GA4GH API specification(s) this entry touches, e.g. `trs`, `drs`, `beacon`, `htsget`. Values MUST NOT carry a version suffix; a version-qualified implementation claim belongs in a type-specific block instead (for `mcp-server` entries, `server._meta["org.ga4gh/ai-registry"].ga4gh_standards[]`, see `spec/mcp-server-card.md`). Open-ended in v1: no closed vocabulary file backs this field. |
| `safety_classification` | MUST | array of objects | Scheme-qualified safety classifications. MAY be empty. See 2.2. |
| `certification_tier` | MUST | string, one of `platform_verified`, `community_signed`, `unsigned`; default `unsigned` | See 3. |
| `record` | MUST | object | Provenance block. See 2.3. |

No property beyond those listed above, or in an entry's own per-type specification, is permitted: each per-type schema closes the composed shape with `unevaluatedProperties: false`.

### 2.1 `maintainers[]` item shape

| Field | Requirement | Type | Description |
|---|---|---|---|
| `name` | MUST | string, non-empty | |
| `github` | MUST | string, pattern-constrained | GitHub username, without a leading `@`. |
| `affiliation` | MAY | string | |
| `orcid` | MAY | string, pattern `^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$` | ORCID iD, if the maintainer has one. |

No property beyond `name`/`github`/`affiliation`/`orcid` is permitted per maintainer.

### 2.2 `safety_classification[]` item shape

One safety or certification claim, scheme-qualified. The registry represents the source scale; it does not adjudicate between schemes.

| Field | Requirement | Type | Description |
|---|---|---|---|
| `scheme` | MUST | string, one of `ga4gh-gase`, `ga4gh-agent-runtime-risk` | The issuing scheme. Closed enumeration, backed by `schemas/vocab/safety-schemes.json`; extensible by adding a value, never by editing an existing one's meaning. |
| `level` | MUST | string, non-empty | The level, in the issuing scheme's own notation: e.g. `"GASL-2"` or `"GASL-3E"` for `ga4gh-gase`; `"0"` through `"4"` for `ga4gh-agent-runtime-risk`. Never normalised or cross-mapped to the other scheme. |
| `certifying_body` | MAY | string | Who issued or performed the certification, if known. |
| `evaluation_date` | MAY | string (date) | When the classification was evaluated. |
| `valid_until` | MAY | string (date) | When the classification expires, if it does. |
| `evidence_uri` | MAY | string (URI) | Link to the certification record or evaluation report. |
| `source` | MUST | string, one of `submitter-attested`, `maintainer-verified`, `synced-from-endpoint` | How this classification entered the registry. |

An entry MAY carry zero, one, or both schemes for a given claim. Every rendered `safety_classification` entry MUST show its `scheme` alongside its `level`; a bare level with no scheme MUST NOT be shown or filtered on. Filtering and sorting MUST operate within a single scheme at a time: no cross-scheme "sort by safety level" control is permitted, because no faithful ordering exists between `ga4gh-gase` and `ga4gh-agent-runtime-risk`.

No property beyond those listed above is permitted per classification item.

### 2.3 `record` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `created` | MUST | string (date-time) | When this entry was first merged to `data/`. |
| `updated` | MUST | string (date-time) | The merge date of the most recent accepted change. |
| `last_verified` | MUST | string (date-time) | When a maintainer last confirmed this entry's claims, independent of a content edit. |
| `source_issue` | MAY | integer, >= 1 | The GitHub issue number that produced this entry via the submission pipeline. Omitted for entries authored directly through a pull request that never passed through an issue. |

No property beyond `created`/`updated`/`last_verified`/`source_issue` is permitted in `record`.

## 3. `certification_tier`: submission and promotion rules

`certification_tier` reuses ADR-003's three-tier certification model verbatim:

- `platform_verified`: GA4GH or a certification body has reviewed the entry.
- `community_signed`: two or more independent institutional maintainers have signed off.
- `unsigned`: community-contributed and discoverable, but unverified. This is the default.

A submission arriving through the issue-form path with any `certification_tier` other than `unsigned` MUST be rejected at the automated-validation gate. Only a maintainer-authored edit against an already-merged entry may raise `certification_tier`, and that edit MUST pass the same review gates as any other change (`spec/README.md`'s submission-flow summary and `docs/PRD.md` Section 5.4-5.5 give the full pipeline).

## 4. Cross-cutting validation rules

These rules apply to every entry, regardless of type, in addition to whatever a per-type specification adds:

1. `id` MUST be unique within its `type`'s directory (`data/<type>/`), MUST match `^[a-z0-9][a-z0-9-]*$`, and MUST equal the entry's filename stem.
2. `type` MUST match the literal value the entry's own file lives under (an entry at `data/models/<id>.json` MUST have `"type": "model"`, and so on).
3. `license_url` MUST be present whenever `license` is exactly the string `"other"`, and MAY be omitted otherwise.
4. `license`, when not `"other"`, MUST be a value present in `schemas/vocab/licenses.json`. Allow-list membership is enforced by `scripts/validate.ts`, not by the JSON Schema itself, so the allow-list can grow without a schema change.
5. `category` MUST be a value from that type's own vocabulary file at `schemas/vocab/categories/<type>.json`, except for `plugin` and `bundle` entries, which accept free text in v1.
6. Every declared URL (`homepage`, `repository`, `license_url`, and any type-specific URI field) SHOULD resolve; automated validation checks this on every submission and re-checks it on every edit, unless explicitly skipped (`scripts/validate.ts --skip-network`).
7. `certification_tier` MUST NOT be set to anything other than `unsigned` by a submitter; see Section 3.
8. No entry may carry a top-level or nested property that neither this document nor its own per-type specification defines.

## 5. See also

- `spec/README.md` for the index of every specification in this directory.
- `spec/model-card.md`, `spec/agent-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md`, `spec/bundle.md` for the six per-type profiles that build on this common core.
- `docs/TECH.md` Section 3.2 and Section 3.3, and `docs/PRD.md` Section 6.1 and Section 5.4-5.5, for the design rationale and submission-pipeline detail behind this specification.
