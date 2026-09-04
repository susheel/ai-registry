export type EntryType = "model" | "agent" | "skill" | "mcp-server" | "plugin";

export const ENTRY_TYPES: readonly EntryType[] = [
  "model",
  "agent",
  "skill",
  "mcp-server",
  "plugin",
];

/** Directory name under data/ for a given entry type (TECH.md Section 2). */
export const DATA_DIR_FOR_TYPE: Record<EntryType, string> = {
  model: "models",
  agent: "agents",
  skill: "skills",
  "mcp-server": "mcp-servers",
  plugin: "plugins",
};

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Short machine-readable code, e.g. "schema", "license", "slug-duplicate". */
  code: string;
  message: string;
  /** JSON pointer-ish path into the entry, when applicable. */
  path?: string;
}

export interface EntryValidationResult {
  file: string;
  id?: string;
  type?: EntryType;
  ok: boolean;
  issues: ValidationIssue[];
}

/** Minimal shape assumed by cross-cutting checks; the real shape is schema-defined. */
export interface AnyEntry {
  id?: unknown;
  type?: unknown;
  license?: unknown;
  license_url?: unknown;
  category?: unknown;
  homepage?: unknown;
  repository?: unknown;
  ga4gh_standards?: unknown;
  model_card_uri?: unknown;
  agent_info_uri?: unknown;
  agent_info_snapshot?: unknown;
  server?: unknown;
  plugin?: unknown;
  [key: string]: unknown;
}
