# GA4GH AI Registry: Agent Entry Specification

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25
**Schema**: `schemas/entry-core.v1.schema.json` (composed with) `schemas/agent-entry.v1.schema.json`
**Applies to**: entries at `data/agents/<id>.json` with `"type": "agent"`

## 1. Purpose

This document specifies the normative structure of an agent entry in the GA4GH AI Registry: which fields it MUST, SHOULD, or MAY carry, how those fields relate to the agent's own live agent-info endpoint, and what a validator or maintainer reviewer checks beyond the JSON Schema itself.

This specification defines no fields that are not already present in `schemas/agent-entry.v1.schema.json` and `schemas/entry-core.v1.schema.json`. Where this document and the schema files disagree, the schema files are authoritative.

## 2. Relationship to the agent's live endpoint

An agent entry does not embed the agent's runtime state. It carries a pointer to the agent's own live agent-info endpoint (`agent_info_uri`, conventionally `{agent_base_url}/service-info`) plus `agent_info_snapshot`, a cache of that endpoint's registry-relevant fields, mirrored under the endpoint's own field names.

`agent_info_snapshot` MUST be rendered, and MUST be understood by every consumer of this specification, as a cache, never as a live status read. It is stamped by the common core's `record.last_verified` (when a maintainer last confirmed the entry) and by its own `agent_info_snapshot.last_synced` (when the snapshot itself was last refreshed from the live endpoint); a detail page MUST show the latter prominently so a reader is never left thinking a stale mirror is a live read.

An agent's source code location is external and already covered by the common core's `repository` field (any git host). Its live runtime location is external and covered by `agent_info_uri`, which may point at any publicly reachable service-info endpoint regardless of where the agent is actually deployed. Nothing about this entry requires the registry to host the agent's code or runtime.

The registry mirrors only the fields a public, unauthenticated caller would see from the endpoint's own anonymous-tier disclosure. It does not attempt to reproduce an authenticated or authorised disclosure tier, because a static public catalogue structurally cannot act as an authenticated caller.

`agent_info_snapshot.enrichment` (trust-and-behaviour oriented, sourced from the agent's own live endpoint) is a distinct concept from a model entry's `registry_enrichment` (documentation-completeness oriented, from the GA4GH Model Card; see `spec/model-card.md`). The two MUST NOT be merged into a single score, and an agent entry never carries the model variant.

## 3. Field reference

### 3.1 Common core

See `spec/entry-core.md` for the fields common to every entry type. `type` is fixed to the literal `"agent"`.

`category` MUST be one value from `schemas/vocab/categories/agent.json`: `variant-interpretation`, `literature-curation`, `clinical-decision-support`, `data-access-governance`, `research-assistant`, `workflow-orchestration`, `regulatory-compliance`, or `other`. This categorises the agent's task domain and is distinct from `agent_info_snapshot.agent_type`, which is the live endpoint's own classification, mirrored verbatim.

### 3.2 Agent-specific top-level fields

| Field | Requirement | Type | Description |
|---|---|---|---|
| `agent_info_uri` | MUST | string (URI) | The agent's live `{agent_base_url}/service-info` endpoint. The registry mirrors only the fields that endpoint's own anonymous-tier disclosure would show a public, unauthenticated caller. |
| `alignment_card_uri` | MAY | string (URI) | Link to the agent's alignment card or equivalent behavioural documentation, if published. |
| `agent_info_snapshot` | MUST | object | A cache of the agent's live endpoint. See 3.3. |

### 3.3 `agent_info_snapshot` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `protocol_version` | MUST | string | The agent runtime protocol version the endpoint implements, e.g. `"0.5.0"`. |
| `agent_type` | MUST | string | The live endpoint's own agent-type classification for this agent. |
| `trust_level` | MUST | string | The live endpoint's own trust-level field, verbatim, distinct from `enrichment.trust_tier`. |
| `auo_capabilities` | MAY | string[] | Autonomous-use-operation capabilities the agent declares. |
| `guardrails_enabled` | MAY | string[] | Runtime guardrails the agent reports as enabled. |
| `delegation_support` | MAY | object | `{ max_depth?: integer >= 0, attenuated_minting?: boolean, supported_credential_types?: string[] }`. No further properties are permitted. |
| `dependencies` | MAY | object | `{ agents?: string[], tools?: string[] }`. No further properties are permitted. |
| `trace_endpoint` | MAY | string (URI) | Where audit traces for this agent can be retrieved, if publicly disclosed. |
| `audit_retention_days` | MAY | integer, >= 0 | |
| `last_synced` | MAY | string (date-time) | When this `agent_info_snapshot` block was last refreshed from `agent_info_uri`. SHOULD be present and rendered prominently on every detail page that shows a snapshot. |
| `enrichment` | MUST | object | The live endpoint's own agent-registry enrichment block, verbatim. See 3.4. |

### 3.4 `agent_info_snapshot.enrichment` object

| Field | Requirement | Type | Description |
|---|---|---|---|
| `trust_score` | MAY | integer, 0-1000 | |
| `trust_tier` | MAY | string, one of `untrusted`, `probationary`, `registered`, `controlled`, `clinical` | |
| `gasl_level` | MUST | integer, 0-4 | The live endpoint's own range, verbatim. Also projected into the common core's `safety_classification[]` as `{scheme: "ga4gh-agent-runtime-risk", level: "<n>", source: "synced-from-endpoint"}` (see `spec/entry-core.md` Section 3, and `docs/TECH.md` Section 3.3). |
| `last_audit_date` | MAY | string (date) | |
| `dependency_count` | MAY | integer, >= 0 | |
| `guardrail_coverage` | MAY | number, 0.0-1.0 | |

No property beyond those listed above is permitted anywhere in `agent_info_snapshot` or its nested objects: every nested object in this schema closes with `unevaluatedProperties: false`, and the composed agent-entry schema closes the same way at its root.

## 4. Validation rules

A conforming agent entry MUST satisfy all of the following, in addition to the common-core rules in `spec/entry-core.md`:

1. `type` MUST be the literal string `"agent"`.
2. `agent_info_uri` and `agent_info_snapshot` MUST both be present; `agent_info_snapshot` MUST in turn carry `protocol_version`, `agent_type`, `trust_level`, and `enrichment`, and `enrichment` MUST carry `gasl_level`.
3. `agent_info_snapshot.enrichment.gasl_level` MUST be projected into the common core's `safety_classification[]` as a `{scheme: "ga4gh-agent-runtime-risk", ...}` entry (see `spec/entry-core.md` Section 3.3). Nothing is renamed and nothing is lost between the two representations: `gasl_level` remains an integer inside `agent_info_snapshot.enrichment`, and its scheme-qualified string form (`"0"` through `"4"`) also appears in `safety_classification[]`.
4. Because JSON Schema validates only the shape of the submitted file and cannot itself fetch `agent_info_uri`, live-endpoint conformance and cache-consistency checks (whether the snapshot still matches what the live endpoint reports) are the responsibility of `scripts/validate.ts`, not of the schema. A conformant validator SHOULD compare, at minimum, the four named paths `protocol_version`, `agent_type`, `trust_level`, and `enrichment.gasl_level` against a fresh read of `agent_info_uri`, and MUST NOT deep-compare the whole snapshot object, since fields such as `last_synced` are expected to differ between a stored snapshot and a fresh read.
5. `agent_info_snapshot` MUST be populated by reading the agent's own live agent-info endpoint directly. It MUST NOT be populated from a third-party agent-registry aggregator, since none is assumed to exist for this purpose.
6. `delegation_support` and `dependencies`, when present, MUST NOT carry any property beyond those listed in 3.3.
7. As for every entry (`spec/entry-core.md` Section 4), `certification_tier` submitted as anything other than `unsigned` MUST be rejected at the submission gate.

## 5. Worked example

No agent entry has been catalogued in `data/agents/` at the time of writing. The following is an illustrative, non-catalogued example constructed to exercise every field this specification defines.

```json
{
  "id": "example-variant-triage-agent",
  "type": "agent",
  "name": "Example Variant Triage Agent",
  "summary": "Illustrative autonomous agent that triages incoming variant calls against ClinVar and flags candidates for expert review.",
  "description": "A worked example for spec/agent-card.md. Not a real, catalogued entry.",
  "homepage": "https://example.org/variant-triage-agent",
  "repository": "https://github.com/example-org/variant-triage-agent",
  "license": "Apache-2.0",
  "maintainers": [
    { "name": "Jane Researcher", "github": "janeresearcher", "affiliation": "Example Genomics Institute" }
  ],
  "version": "0.4.0",
  "keywords": ["variant-triage", "clinvar", "autonomous-agent"],
  "category": "variant-interpretation",
  "ga4gh_standards": [],
  "safety_classification": [
    {
      "scheme": "ga4gh-agent-runtime-risk",
      "level": "2",
      "source": "synced-from-endpoint"
    }
  ],
  "certification_tier": "unsigned",
  "record": {
    "created": "2026-09-25T00:00:00.000Z",
    "updated": "2026-09-25T00:00:00.000Z",
    "last_verified": "2026-09-25T00:00:00.000Z"
  },
  "agent_info_uri": "https://variant-triage-agent.example.org/service-info",
  "alignment_card_uri": "https://example.org/variant-triage-agent/alignment-card.md",
  "agent_info_snapshot": {
    "protocol_version": "0.5.0",
    "agent_type": "variant-interpretation-assistant",
    "trust_level": "registered",
    "auo_capabilities": ["read-clinvar", "draft-classification"],
    "guardrails_enabled": ["human-in-the-loop-required", "output-provenance-logging"],
    "delegation_support": {
      "max_depth": 1,
      "attenuated_minting": true,
      "supported_credential_types": ["sd-jwt-vc"]
    },
    "dependencies": {
      "agents": [],
      "tools": ["clinvar-lookup", "acmg-classifier"]
    },
    "trace_endpoint": "https://variant-triage-agent.example.org/traces",
    "audit_retention_days": 365,
    "last_synced": "2026-09-24T09:00:00.000Z",
    "enrichment": {
      "trust_score": 640,
      "trust_tier": "registered",
      "gasl_level": 2,
      "last_audit_date": "2026-09-01",
      "dependency_count": 2,
      "guardrail_coverage": 0.8
    }
  }
}
```

## 6. See also

- `spec/entry-core.md` for the common entry core shared by every registry type.
- `spec/model-card.md`, `spec/skill-card.md`, `spec/mcp-server-card.md`, `spec/plugin-card.md`, `spec/bundle.md` for the other five entry types.
- `../GA4GH-AGENT-TRUST-PROTOCOL.md` (in the `ga4gh-agents` workspace) for the Agent Trust Protocol's Agent Info and Agent Registry enrichment provisions this profile mirrors.
- `docs/TECH.md` Section 3.5.2 and Section 3.3, and `docs/PRD.md` Section 6.3, for the design rationale behind this profile.
