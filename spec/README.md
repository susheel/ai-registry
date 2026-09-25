# GA4GH AI Registry: Specifications

**Status**: Draft
**Version**: 0.1.0
**Date**: 2026-09-25

This directory holds the normative specification of each registry entry type: the fields it MUST, SHOULD, or MAY carry, its relationship to any upstream standard it profiles, its validation rules, and a worked example. Every specification here is a prose statement of what a `schemas/*.v1.schema.json` file already enforces mechanically; none of them defines a field the corresponding schema does not already have.

## Contents

| File | Covers |
|---|---|
| `entry-core.md` | The common entry core (`id`, `type`, `name`, `license`, `maintainers`, `safety_classification[]`, `certification_tier`, `record`, and the rest) shared by every entry regardless of type. Every other specification in this directory builds on it. |
| `model-card.md` | Model entries (`data/models/`). How a model entry profiles the upstream GA4GH Genomic AI Model Card v0.6.0. |
| `agent-card.md` | Agent entries (`data/agents/`). How an agent entry mirrors a cached snapshot of the agent's own live agent-info endpoint. |
| `skill-card.md` | Skill entries (`data/skills/`). How a skill entry embeds a `SKILL.md`-style description plus Project #24's certifiable-skill requirements. |
| `mcp-server-card.md` | MCP server entries (`data/mcp-servers/`). How an MCP server entry embeds a verbatim, lift-out-able official MCP registry `server.json`. |
| `plugin-card.md` | Coding-harness plugin entries (`data/plugins/`). How a plugin entry embeds a verbatim Claude Code `plugin.json` plus a multi-harness install object. |
| `bundle.md` | Bundle entries (`data/bundles/`). How a bundle entry embeds a verbatim Claude Code `marketplace.json` plus provenance and cross-references. |

## Relationship to `docs/PRD.md` and `docs/TECH.md`

The specifications in this directory are the normative **what**: the exact shape a conforming entry of a given type must have, stated independently of why the registry is built that way. `docs/PRD.md` and `docs/TECH.md` are the **why**: the product requirements, design rationale, open questions, and implementation decisions that led to each schema taking the shape it has. This directory does not restate that rationale, and each specification here cross-references the relevant `docs/PRD.md`/`docs/TECH.md` section rather than duplicating it. When reading a specification here raises a "why is it built this way" question, the answer lives in `docs/TECH.md` (architecture and schema design) or `docs/PRD.md` (product requirements and scope); when it raises a "what exactly must this field contain" question, the schema file and this directory are authoritative, and `docs/PRD.md`/`docs/TECH.md` should be corrected to match if they ever disagree.
