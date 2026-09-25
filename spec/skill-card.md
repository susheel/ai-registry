# GA4GH AI Registry: Skill Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/skill-entry.v1.schema.json`
**Applies to**: entries at `data/skills/<id>.json` with `"type": "skill"`

## 1. Purpose

This document specifies the normative structure of a skill entry in the GA4GH AI Registry: which fields it MUST, SHOULD, or MAY carry, how it embeds a `SKILL.md`-style description, and what a validator or maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in `schemas/skill-entry.v1.schema.json` and `schemas/entry-core.v1.schema.json`. Where this document and the schema files disagree, the schema files are authoritative.

## 2. Relationship to upstream skill formats

Unlike a model or an agent entry, a skill entry embeds its upstream document rather than referencing it: `skill` is an embedded, `SKILL.md`-style frontmatter object, carried inline in the entry file rather than fetched live.

A skill entry additionally carries the fields Project #24 specifies as required for a certifiable skill: defined `inputs`, defined `outputs`, a `human_oversight` requirement level, whether the skill performs `provenance_logging`, and a pointer to its `evaluation_criteria_uri`. These fields are drawn from Project #24's own stated certification requirements, not invented generically for this registry.

`skill.name`/`skill.description` are deliberately unconstrained beyond non-empty. The registry only indexes an already-authored `SKILL.md`; it does not re-validate conformance to any upstream skill-format specification it does not itself own (for example, agentskills.io's own length limits on `name` and `description`). A submitter targeting a specific upstream ecosystem's compatibility SHOULD keep within that ecosystem's own limits, but this registry's schema will not reject a submission that exceeds them.

`skill.` frontmatter fields beyond `name` and `description` are preserved as submitted: the `skill` object's shape is intentionally open beyond its two required fields, mirroring how Claude Code itself tolerates unrecognised `SKILL.md` frontmatter keys.

`source.repository` is shaped to match the `agentregistry` project's own `Skill` kind (`{ url, subfolder? }`), so that a future integration with `agentregistry`, should one happen, is a mapping exercise rather than a schema rework. `source.repository.url` MUST be present: it is a registry-side requirement, not one imposed by any upstream skill-format specification, because every browse and detail page, and the submission pipeline, need a canonical source location to link to and re-verify against.

## 3. Field reference

### 3.1 Common core

See `spec/entry-core.md` for the fields common to every entry type. `type` is fixed to the literal `"skill"`.

`category` MUST be one value from `schemas/vocab/categories/skill.json`: `scientific-writing`, `consent-review`, `governance-support`, `data-curation`, `variant-interpretation`, `literature-extraction`, `regulatory-compliance`, or `other`.

### 3.2 Skill-specific top-level fields

| Field | Requirement | Type | Description |
|---|---|---|---|
| `skill` | MUST | object | Embedded `SKILL.md`-style frontmatter. See 3.3. |
| `source` | MUST | object | `{ repository: { url (MUST), subfolder? } }`. See 3.4. |
| `inputs` | MUST | array of objects | Defined inputs the skill accepts. See 3.5. MAY be an empty array. |
| `outputs` | MUST | array of objects | Defined outputs the skill produces. See 3.5. MAY be an empty array. |
| `human_oversight` | MUST | string, one of `required`, `recommended`, `none` | The level of human oversight this skill's use requires. |
| `provenance_logging` | MUST | boolean | Whether the skill performs provenance logging of its own use. |
| `evaluation_criteria_uri` | MUST | string (URI) | Pointer to the skill's evaluation criteria document. |
| `auo_capabilities` | MAY | string[] | Autonomous-use-operation capabilities the skill declares. |
| `host_runtimes` | MAY | string[] | Coding harnesses or runtimes this skill has been verified to run under. Each value SHOULD be one of the closed enumeration in `schemas/vocab/harnesses.json` (`claude-code`, `codex`, `gemini-cli`, `opencode`, `mcp-generic`, `agent-plugins`); this constraint is enforced by `scripts/validate.ts` against the vocabulary file, not by a schema enum, so the vocabulary can grow without a schema change. |

### 3.3 `skill` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `name` | MUST | string, non-empty | The skill's own name, as declared in its `SKILL.md` frontmatter. |
| `description` | MUST | string, non-empty | The skill's own description, as declared in its `SKILL.md` frontmatter. |
| *(other keys)* | MAY | any | Ecosystem-specific frontmatter fields beyond `name`/`description` are preserved as submitted. |

### 3.4 `source` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `repository.url` | MUST | string (URI) | Source repository for the skill, on any git hosting service (GitHub, GitLab, self-hosted, or other); not limited to a GA4GH-controlled host. |
| `repository.subfolder` | MAY | string | Relative path from the repository root to the skill, for a skill living in a monorepo or a nested package structure. |

No property beyond `repository` (and, within it, beyond `url`/`subfolder`) is permitted in `source`.

### 3.5 `inputs[]` / `outputs[]` item shape

| Field | Requirement | Type | Description |
|---|---|---|---|
| `name` | MUST | string, non-empty | |
| `type` | MAY | string | |
| `description` | MAY | string | |

No property beyond `name`/`type`/`description` is permitted per item.

No property beyond those listed in 3.1-3.5 is permitted anywhere in a skill entry's type-specific block: the composed skill-entry schema closes with `unevaluatedProperties: false` at its root, and each nested object (`source`, `source.repository`, each `inputs[]`/`outputs[]` item) closes the same way.

## 4. Validation rules

A conforming skill entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"skill"`.
2. `skill`, `source`, `inputs`, `outputs`, `human_oversight`, `provenance_logging`, and `evaluation_criteria_uri` MUST all be present.
3. `skill.name` and `skill.description` MUST both be non-empty strings.
4. `source.repository.url` MUST be present and MUST resolve (link resolution is checked by `scripts/validate.ts`, not by the schema).
5. Each item in `inputs[]` and `outputs[]` MUST carry a non-empty `name`.
6. `human_oversight` MUST be exactly one of `required`, `recommended`, or `none`.
7. `host_runtimes[]`, when present, SHOULD be checked against `schemas/vocab/harnesses.json` by the validation pipeline (this is a vocabulary check, not a schema-level enum, matching the convention `checkCategory`/`checkLicense` already use).
8. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate.

## 5. Worked example

Adapted from the real, currently-catalogued entry `data/skills/bioskills-acmg-classification.json`, trimmed for brevity:

```json
{
  "id": "bioskills-acmg-classification",
  "type": "skill",
  "name": "bioSkills ACMG Classification skill",
  "summary": "Applies the ACMG/AMP 2015 framework with ClinGen SVI specifications and the Tavtigian Bayesian point system to classify germline variants P/LP/VUS/LB/B, with a full evidence trail.",
  "description": "The bio-clinical-databases-acmg-classification skill from GPTomics' bioSkills library...",
  "homepage": "https://github.com/GPTomics/bioSkills/tree/main/clinical-databases/acmg-classification",
  "repository": "https://github.com/GPTomics/bioSkills",
  "license": "MIT",
  "maintainers": [
    { "name": "Susheel Varma", "github": "susheel", "affiliation": "GA4GH AI Workstream / Sage Bionetworks" }
  ],
  "version": "3.0",
  "keywords": ["acmg", "clingen-svi", "variant-classification", "clinical-genomics", "pathogenicity", "bioskills"],
  "category": "variant-interpretation",
  "safety_classification": [],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-08T00:00:00.000Z",
    "updated": "2026-09-08T00:00:00.000Z",
    "last_verified": "2026-09-08T00:00:00.000Z"
  },
  "skill": {
    "name": "bio-clinical-databases-acmg-classification",
    "description": "Applies ACMG/AMP 2015 framework with ClinGen SVI specifications...",
    "license": "MIT",
    "metadata": {
      "homepage": "https://github.com/GPTomics/bioSkills/tree/main/clinical-databases/acmg-classification"
    }
  },
  "source": {
    "repository": {
      "url": "https://github.com/GPTomics/bioSkills.git",
      "subfolder": "clinical-databases/acmg-classification"
    }
  },
  "inputs": [
    { "name": "variant", "type": "string", "description": "Variant identifier (HGVS, VCF record, or genomic coordinate) plus gene context." },
    { "name": "evidence_codes", "type": "array", "description": "Population frequency, computational, functional-assay, and segregation evidence." }
  ],
  "outputs": [
    { "name": "classification", "type": "object", "description": "The five-tier ACMG/AMP classification with a per-criterion evidence trail." }
  ],
  "human_oversight": "required",
  "provenance_logging": true,
  "evaluation_criteria_uri": "https://github.com/GPTomics/bioSkills/blob/main/resources/bioskills_eval_20260328.pdf",
  "host_runtimes": ["claude-code", "codex", "opencode"]
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/model-card.md`, `spec/agent-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md`, `spec/bundle.md` for the other five entry types.
- `docs/TECH.md` Section 3.5.3 and `docs/PRD.md` Section 6.4 for the design rationale behind this profile, and Project #24 for the certifiable-skill requirements it draws on.
