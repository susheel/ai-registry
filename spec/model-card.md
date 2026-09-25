# GA4GH AI Registry: Model Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/model-entry.v1.schema.json`
**Applies to**: entries at `data/models/<id>.json` with `"type": "model"`

## 1. Purpose

This document specifies the normative structure of a model entry in the GA4GH AI Registry. It states, in prose, what `schemas/model-entry.v1.schema.json` and `schemas/entry-core.v1.schema.json` already enforce mechanically: which fields a model entry MUST, SHOULD, or MAY carry, how those fields relate to the upstream GA4GH Genomic AI Model Card standard, and what a validator or a maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in the schemas. Where this document and the schema files disagree, the schema files are authoritative; this document should be corrected to match.

## 2. Relationship to the GA4GH Genomic AI Model Card

A model entry does not restate a model card. It is a small index record that points at one, plus a set of fields mirrored, by name, from the Model Card and from Hugging Face's own listing conventions, so that a model can be browsed, filtered, and searched in the registry without reading the full card.

The registry MUST NOT duplicate any Model Card content beyond the fields this specification names. The Model Card, at the URI given in `model_card_uri`, remains the single authoritative document for a model's intended use, training data provenance, population representation, clinical validation, and processing directives. This mirrors the relationship Hugging Face itself maintains between a compact model listing record and a model's full model card.

The registry targets **GA4GH Genomic AI Model Card v0.6.0** (`model-card/GA4GH-Model-Card.md`, dated 2026-05-26) as the version `model_card_uri` is expected to resolve to. A model entry profiles this upstream standard; it does not define a competing one.

Two Model Card sections are mirrored verbatim into specific model entry fields, and MUST NOT be recomputed independently by the registry:

- Model Card Section 6.1 ("Model Details") supplies `developed_by` and `release_date`.
- Model Card Section 6.8b ("Agent Registry Enrichment Metadata") supplies the whole `registry_enrichment` object (`completeness_score`, `genomic_quality_score`, `compliance_indicators[]`, `last_validated`), field for field.

Model Card Section 5 (the YAML frontmatter specification, including its pipeline tag vocabulary at Section 5.3) supplies `pipeline_tag`, `tags[]`, `library_name`, and `base_model`, mirroring Hugging Face's own model card frontmatter conventions.

`registry_enrichment` (documentation-completeness oriented, from Model Card Section 6.8b) is a distinct concept from an agent entry's `agent_info_snapshot.enrichment` (trust-and-behaviour oriented, from the agent's live endpoint; see `spec/agent-card.md`). The two MUST NOT be merged into a single score, and a model entry never carries the latter.

## 3. Field reference

### 3.1 Common core (required on every entry, see `spec/entry-core.md`)

`id`, `type` (fixed to the literal `"model"`), `name`, `summary`, `description`, `homepage`, `repository`, `license` (plus `license_url` when `license` is `"other"`), `maintainers[]`, `version`, `keywords[]`, `category`, `safety_classification[]`, `certification_tier`, and `record` are common to every entry type and are specified in full in `spec/entry-core.md`. This section states only what is specific to a model entry.

`category` MUST be one value from `schemas/vocab/categories/model.json`: `variant-effect-prediction`, `genomic-foundation-model`, `clinical-nlp`, `phenotype-prediction`, `population-genomics`, `protein-structure`, `medical-imaging`, `multimodal`, `drug-discovery`, or `other`.

### 3.2 Model-specific fields

| Field | Requirement | Type | Description |
|---|---|---|---|
| `model_card_uri` | MUST | string (URI) | URI to a full GA4GH Genomic AI Model Card. This is the deep-dive link the detail page renders prominently. |
| `pipeline_tag` | MAY | string | Mirrored from Hugging Face / Model Card Section 5's pipeline tag vocabulary, e.g. `text-generation`, `variant-effect-prediction`. |
| `tags` | MAY | string[], unique | Mirrored from Hugging Face / Model Card Section 5. |
| `library_name` | MAY | string | Mirrored from Hugging Face / Model Card Section 5, e.g. `transformers`, `pytorch`. |
| `base_model` | MAY | string | The base or foundation model this model was fine-tuned or derived from, if any. Mirrored from Hugging Face / Model Card Section 5. |
| `openness_class` | MAY | string, one of `I`, `II`, `III` | Optional, non-normative, submitter-asserted classification under the Model Openness Framework (MOF, Generative AI Commons at the LF AI & Data Foundation). Points at MOF's own class rather than the registry re-deriving one; see the Model Openness Tool for the authoritative per-class checklist. Deliberately independent of `safety_classification[]` and `certification_tier`: openness and safety/trust are orthogonal axes and MUST NOT be cross-checked against each other. |
| `intended_domain` | MAY | string | Model Card Section 5.3 fallback for a genomic task with no accepted Hugging Face `pipeline_tag`. |
| `developed_by` | MAY | string | Mirrored from Model Card Section 6.1. |
| `release_date` | MAY | string (date) | Mirrored from Model Card Section 6.1. |
| `hosting_location` | MAY | string, one of `huggingface`, `github`, `docker`, `self-hosted`, `gated-request`, `other` | Where the model itself (weights, container, or gated-access endpoint) is hosted, distinct from where its source repository lives. |
| `access_uri` | MAY | string (URI) | Where to access or request the model, appropriate to `hosting_location`: a Hugging Face Hub URL, a GitHub Releases URL, a container registry reference, or a gated-access request form URL. |
| `install_command` | MAY | string | Copy-paste string to install or load the model, Ollama-style, e.g. a Hugging Face `pip install` and load snippet. Omitted where no meaningful install action exists (for example, a gated-request-only model). |
| `recommended_version` | MAY | string | MLflow-alias-shaped pointer to the version a visitor should use by default, when this entry tracks more than one published version. |
| `last_synced` | MAY | string (date-time) | Timestamp of the last mirror refresh of any field on this entry sourced from an external listing (e.g. Hugging Face Hub metadata). SHOULD be present, and rendered on the detail page, whenever any field above is populated from a live external source, so a reader is never left assuming a mirrored field is live data. |
| `registry_enrichment` | MAY | object | Mirrored verbatim from Model Card Section 6.8b. See 3.3. |

### 3.3 `registry_enrichment` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `completeness_score` | MAY | number, 0.0-1.0 | Automatic validation score based on the proportion of Recommended and Required Model Card fields populated (Model Card Section 6.8b). |
| `genomic_quality_score` | MAY | number, 0.0-1.0 | Domain-specific quality score based on genomic extension field completeness (population representation, DUO compliance, clinical validation, ancestry bias assessment, GASL level assignment). |
| `compliance_indicators` | MAY | string[] | Compliance indicators derived from Model Card fields, e.g. `duo-aligned`, `ancestry-assessed`, `clinically-validated`, `gasl-classified`, `brep-governed`. |
| `last_validated` | MAY | string (date-time) | Date the enrichment scores were last computed. |

No entry-core or model-entry field beyond those listed in 3.1-3.3 is permitted: the composed schema sets `unevaluatedProperties: false`, so a model entry MUST NOT carry any additional top-level property.

## 4. Validation rules

A conforming model entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"model"`.
2. `model_card_uri` MUST be present and MUST resolve to a fetchable document (`scripts/validate.ts` checks link resolution; it is not, in v1, required to parse the target as a conformant Model Card, since no model has yet published one in the GA4GH v0.6.0 format at the time of writing).
3. If `hosting_location` is present, `access_uri` SHOULD also be present and SHOULD be of a form appropriate to that hosting location (a `https://huggingface.co/<org>/<model>`-shaped URL for `huggingface`, a GitHub Releases URL for `github`, and so on).
4. `install_command` MUST be omitted where no meaningful install action exists for the model (for example, `hosting_location: "gated-request"` with no public download path); a copy-to-clipboard install control is rendered only when `install_command` is present.
5. `registry_enrichment.*`, when present, MUST be copied verbatim from the Model Card at `model_card_uri` and MUST NOT be independently computed or asserted by the submitter or the registry tooling.
6. `openness_class` MUST NOT be treated as, or rendered alongside, `safety_classification[]` or `certification_tier` as if it were a safety or trust signal; it answers a documentation-transparency question, not a safety one.
7. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate; only a maintainer-authored edit against an existing entry may raise it.

## 5. Worked example

The following illustrates a model entry whose `model_card_uri` resolves to a Model Card that already conforms to GA4GH Genomic AI Model Card v0.6.0. (No such card exists yet at the time of writing; see `data/models/esm2.json` for a real, currently-seeded entry whose `model_card_uri` instead points at a standard Hugging Face model card, with that distinction noted in its `description`.)

```json
{
  "id": "example-variant-effect-model",
  "type": "model",
  "name": "Example Variant Effect Model",
  "summary": "Illustrative genomic foundation model fine-tuned for non-coding variant effect prediction.",
  "description": "A worked example for spec/model-card.md. Not a real, catalogued entry.",
  "homepage": "https://huggingface.co/example-org/example-variant-effect-model",
  "repository": "https://github.com/example-org/example-variant-effect-model",
  "license": "Apache-2.0",
  "maintainers": [
    { "name": "Jane Researcher", "github": "janeresearcher", "affiliation": "Example Genomics Institute", "orcid": "0000-0002-1825-0097" }
  ],
  "version": "1.2.0",
  "keywords": ["variant-effect", "non-coding", "genomic-foundation-model"],
  "category": "variant-effect-prediction",
  "ga4gh_standards": [],
  "safety_classification": [
    {
      "scheme": "ga4gh-gase",
      "level": "GASL-2",
      "certifying_body": "Example Genomics Institute",
      "evaluation_date": "2026-08-01",
      "evidence_uri": "https://example-org.example/gase-report.pdf",
      "source": "submitter-attested"
    }
  ],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-25T00:00:00.000Z",
    "updated": "2026-09-25T00:00:00.000Z",
    "last_verified": "2026-09-25T00:00:00.000Z",
    "source_issue": 142
  },
  "model_card_uri": "https://huggingface.co/example-org/example-variant-effect-model/blob/main/MODEL_CARD.md",
  "pipeline_tag": "variant-effect-prediction",
  "tags": ["genomics", "non-coding-variants"],
  "library_name": "transformers",
  "base_model": "example-org/example-genomic-foundation-model",
  "openness_class": "II",
  "developed_by": "Example Genomics Institute",
  "release_date": "2026-07-15",
  "hosting_location": "huggingface",
  "access_uri": "https://huggingface.co/example-org/example-variant-effect-model",
  "install_command": "pip install transformers\n# then: AutoModel.from_pretrained('example-org/example-variant-effect-model')",
  "recommended_version": "1.2.0",
  "last_synced": "2026-09-24T09:00:00.000Z",
  "registry_enrichment": {
    "completeness_score": 0.92,
    "genomic_quality_score": 0.85,
    "compliance_indicators": ["duo-aligned", "ancestry-assessed", "gasl-classified"],
    "last_validated": "2026-09-20T00:00:00.000Z"
  }
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/agent-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md`, `spec/bundle.md` for the other five entry types.
- `../model-card/GA4GH-Model-Card.md` (in the `ga4gh-agents` workspace, upstream of this repository) for the full GA4GH Genomic AI Model Card standard this specification profiles.
- `docs/TECH.md` Section 3.5.1 and `docs/PRD.md` Section 6.2 for the design rationale behind this profile.
