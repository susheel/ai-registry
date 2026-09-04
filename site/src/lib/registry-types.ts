/**
 * Collection-key <-> common-core `type` mapping and display labels, shared by
 * every page that needs to go from a URL segment (the plural collection key,
 * e.g. "mcp-servers") to the singular `type` enum value entries carry
 * (internal project documentation Section 3.2), or vice versa.
 */
export type CollectionKey = "models" | "agents" | "skills" | "mcp-servers" | "plugins";

export const COLLECTION_KEYS: readonly CollectionKey[] = ["models", "agents", "skills", "mcp-servers", "plugins"];

export interface TypeMeta {
  key: CollectionKey;
  type: "model" | "agent" | "skill" | "mcp-server" | "plugin";
  label: string;
  singularLabel: string;
  description: string;
}

export const TYPE_META: Record<CollectionKey, TypeMeta> = {
  models: {
    key: "models",
    type: "model",
    label: "Models",
    singularLabel: "Model",
    description: "Genomic and health AI models, each pointing at a full GA4GH Genomic AI Model Card.",
  },
  agents: {
    key: "agents",
    type: "agent",
    label: "Agents",
    singularLabel: "Agent",
    description: "Autonomous agents exposing a live agent-info discovery endpoint.",
  },
  skills: {
    key: "skills",
    type: "skill",
    label: "Skills",
    singularLabel: "Skill",
    description: "Certifiable skills with defined inputs, outputs, and human-oversight requirements.",
  },
  "mcp-servers": {
    key: "mcp-servers",
    type: "mcp-server",
    label: "MCP Servers",
    singularLabel: "MCP Server",
    description: "Model Context Protocol servers, each publishable to the official MCP registry unmodified.",
  },
  plugins: {
    key: "plugins",
    type: "plugin",
    label: "Plugins",
    singularLabel: "Plugin",
    description: "Coding-harness plugins bundling skills and MCP tools for one or more harnesses.",
  },
};

export function typeMetaForKey(key: string): TypeMeta | undefined {
  return TYPE_META[key as CollectionKey];
}
