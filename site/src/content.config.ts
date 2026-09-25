import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  ModelEntrySchema,
  AgentEntrySchema,
  SkillEntrySchema,
  McpServerEntrySchema,
  PluginEntrySchema,
  BundleEntrySchema,
} from "./generated/entry-schemas.zod.js";

// Reads data/<type>/ directly (internal project documentation Section 4.1). The glob loader's
// `base` resolves relative to the Astro project root (site/), not to this
// file's own directory (site/src/) despite this file living there, so
// `../data` -- exactly the path TECH.md Section 4.1 names -- is correct.
const models = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/models" }),
  schema: ModelEntrySchema,
});

const agents = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/agents" }),
  schema: AgentEntrySchema,
});

const skills = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/skills" }),
  schema: SkillEntrySchema,
});

const mcpServers = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/mcp-servers" }),
  schema: McpServerEntrySchema,
});

const plugins = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/plugins" }),
  schema: PluginEntrySchema,
});

const bundles = defineCollection({
  loader: glob({ pattern: "*.json", base: "../data/bundles" }),
  schema: BundleEntrySchema,
});

// Prose companion specifications (spec/*.md), rendered at /spec/. Plain
// Markdown with no frontmatter, so no schema is declared here; the loader's
// `base` resolves relative to this same Astro project root, per the comment
// above, so `../spec` is `site/../spec`, i.e. the top-level `spec/` directory.
const specs = defineCollection({
  loader: glob({ pattern: "*.md", base: "../spec" }),
});

export const collections = {
  models,
  agents,
  skills,
  "mcp-servers": mcpServers,
  plugins,
  bundles,
  specs,
};
