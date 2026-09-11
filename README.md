# GA4GH AI Registry

A catalogue of AI models, agents, skills, MCP servers, coding-harness plugins, and curated marketplace bundles relevant to genomics and health research, built for the GA4GH AI Workstream.

The registry builds on existing standards rather than inventing new ones. Model entries are built around a GA4GH Model Card Standard, itself an extension of the industry-standard Model Card specification with genomics- and health-specific fields; MCP-server and plugin entries embed the official Model Context Protocol server manifest and Claude Code's plugin and marketplace manifests unmodified. Every entry is a small, schema-validated JSON record that points at, and mirrors key metadata from, the real upstream project it describes: the registry is a catalogue, not a replacement for the projects it lists.

## What's in it

Six content types, each schema-validated against `schemas/`:

| Type | Directory | What it catalogues |
|---|---|---|
| Models | `data/models/` | AI models with a demonstrated genomics or health-research use case |
| Agents | `data/agents/` | Autonomous or semi-autonomous agents exposing a live agent-info discovery endpoint |
| Skills | `data/skills/` | Certifiable AI-assisted-capability units for scientific, consent-review, or governance workflows |
| MCP servers | `data/mcp-servers/` | Model Context Protocol servers exposing a GA4GH API specification or a genomics/health data source |
| Plugins | `data/plugins/` | Coding-harness plugins (Claude Code, Codex, Gemini CLI, and others) implementing a GA4GH specification or supporting a genomics/health workflow |
| Bundles | `data/bundles/` | Vendor-curated marketplaces (e.g. a Claude Code plugin marketplace) with genuine genomics or health-research relevance |

## Using the registry

The published site (browse, filter, full-text search, and copy-to-clipboard install snippets for every entry) is built from this repository's `data/` directory and served as a static site, requiring no account or backend. It also publishes machine-readable projections consumable directly by tooling: a compact `index.json`, an AAIF AI Catalog-conformant `.well-known/ai-catalog.json`, a per-server `mcp/<slug>/server.json` for cross-listing to the official MCP server registry, and a Claude Code `.claude-plugin/marketplace.json`.

## Submitting an entry

Open the relevant GitHub Issue Form (`.github/ISSUE_TEMPLATE/submit-<type>.yml`) for the content type you're submitting. Automation validates the submission's shape, licence, and links, and comments a preview back on the issue; a maintainer review is required before anything merges. See the issue templates themselves for exactly what each type requires.

## Development

This is a pnpm workspace (Node 22+). From the repository root:

```
pnpm install
pnpm run validate           # schema, licence, link, and cross-reference checks against every entry
pnpm run test                # unit tests
pnpm run typecheck
pnpm --filter site build     # build the static site into site/dist
pnpm --filter site dev       # run the site locally
```

`pnpm run validate -- --skip-network` skips live URL reachability checks (useful offline, or when a referenced upstream source is temporarily unreachable for reasons unrelated to entry correctness).

## Governance

Every entry is a restatement of a claim made elsewhere (a licence, a certification, a safety classification): the registry validates that a submission is well-formed and well-sourced, not that every claim it carries is true. Review routing, promotion criteria, and the sourcing/vetting checklist maintainers apply when seeding content directly are documented for maintainers separately from this file.

## Licence

This repository's own code, schemas, and documentation are licensed under Apache License 2.0 (see `LICENSE`). Each catalogued entry separately records its own project's licence in its `license`/`license_url` fields: that licence governs the project being catalogued, not this repository's own code or schemas.
