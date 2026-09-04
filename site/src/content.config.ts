import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  ModelEntrySchema,
  AgentEntrySchema,
  SkillEntrySchema,
  McpServerEntrySchema,
  PluginEntrySchema,
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

export const collections = {
  models,
  agents,
  skills,
  "mcp-servers": mcpServers,
  plugins,
};
