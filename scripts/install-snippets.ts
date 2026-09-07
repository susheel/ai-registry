/**
 * scripts/install-snippets.ts -- the shared derivation logic internal project documentation
 * Section 3.5.4 requires: per-client MCP install configuration derived from
 * an mcp-server entry's embedded `server.packages[]`/`server.remotes[]`,
 * never hand-authored or stored in the entry file. Every consumer (the
 * site's copy-to-clipboard component, Phase 3; `build-index.ts`, which
 * embeds the derived output into the published index so the
 * `ga4gh_ai_registry_install` MCP tool never has to re-derive it, Phase 7)
 * calls this one module, so they can never disagree (internal project documentation Section
 * 4.3).
 *
 * **Packaging decision** (the open question internal project documentation Phase 2 and
 * `the local continuation-prompt file` flagged): pre-derive and embed snippets in the published
 * index at build time, rather than publishing this module as a standalone
 * npm package both repositories depend on. `ai-registry` and `ga4gh-plugins`
 * are separate repositories with no shared publishing pipeline today (this
 * repository is not even pushed to a remote yet -- internal project documentation Phase 9),
 * so a cross-repo npm package would need real, currently-nonexistent
 * publishing infrastructure to satisfy "can never disagree" safely. Since
 * `ga4gh_ai_registry_install` (internal project documentation Section 8.2) already fetches
 * `index.json` over HTTPS (Section 8.3), having `build-index.ts` compute
 * snippets once, here, and embed them in that same published index makes
 * the client a pure consumer of an already-derived value -- there is only
 * ever one place derivation happens, which is the actual property "must
 * share scripts/install-snippets.ts's derivation logic" is protecting.
 * `site/`'s copy-to-clipboard component (same repository as this module)
 * imports it directly at Astro build time; no packaging concern there at
 * all.
 *
 * **Per-client shapes were verified against current documentation via
 * `context7`, not assumed from training data** (queried 2026-09-02):
 * - `claude-desktop`/`claude-code`/`cursor` share the `mcpServers` wrapper.
 *   A stdio entry omits `type` (or sets it to `"stdio"`); a remote entry
 *   MUST set `type: "http"` (an alias `"streamable-http"` is also accepted)
 *   or `type: "sse"` plus `url`, and MAY carry `headers`. Secret or missing
 *   values are inlined as edit-me placeholders (`<YOUR_...>`); these
 *   clients have no interactive-prompt mechanism at the config-file level.
 *   Source: https://code.claude.com/docs/en/mcp-quickstart,
 *   https://code.claude.com/docs/en/agent-sdk/mcp.
 * - `vscode` uses a `servers` wrapper (same stdio/remote shape) plus a
 *   sibling top-level `inputs[]` array of `{type:"promptString", id,
 *   description, password}` objects; a secret or otherwise-unresolvable
 *   value becomes `"${input:<id>}"` referencing one of those entries.
 *   Source: https://github.com/microsoft/vscode-docs (mcp-configuration.md,
 *   agent-customization/mcp-servers.md).
 * - `cursor` additionally gets a one-click deeplink,
 *   `cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64>`,
 *   where `config` is the same single-server object used inside
 *   `mcpServers.<name>`, base64-encoded. Source: https://cursor.com/docs/mcp/install-links.
 *
 * **Not independently verified against an external spec** (this project's
 * own considered convention, documented rather than silently assumed): how
 * a `NamedArgument`/`PositionalArgument` resolves to a concrete CLI token,
 * how a package identifier combines with its version (`identifier@version`,
 * `identifier:version` for `oci`), and that `oci`/docker packages pass
 * environment variables as `-e NAME=value` argv pairs rather than a
 * client-level `env` object (docker does not forward the host CLI
 * process's environment into the container without `-e`/`--env-file`).
 *
 * **Three more clients added 2026-09-07** (`internal project documentation`,
 * D25), each verified against current documentation via `mcp__plugin_context-mode_context-mode__ctx_fetch_and_index`,
 * not assumed:
 * - `windsurf` and `kiro` both use the identical `mcpServers` wrapper as
 *   `claude-desktop`/`claude-code` (a plain `{command, args, env}` stdio
 *   object per server, keyed by server name) -- no new derivation branch
 *   needed, they fall through the existing default path.
 *   Sources: https://docs.windsurf.com/windsurf/cascade/mcp (`mcp_config.json`,
 *   cross-confirmed as the standard shape by Gemini CLI's own docs
 *   referencing it as "standard MCP clients" configuration), https://kiro.dev/docs/mcp/configuration/.
 * - `opencode` uses a genuinely different shape: a top-level `mcp` object
 *   (not `mcpServers`), each entry carrying `type: "local"`, `command` as
 *   an **array** (`[executable, ...args]`, not separate `command`/`args`
 *   fields), `enabled: true`, and `environment` (not `env`) for variables.
 *   Source: https://opencode.ai/docs/mcp-servers/.
 *
 * **Deliberately not added in this pass**: `codex` (OpenAI's Codex CLI)
 * configures MCP servers via `config.toml` (TOML, not JSON) with a
 * meaningfully different shape (`[mcp_servers.<name>]` tables, `env_vars`
 * as an array of names-to-forward rather than a key-value object, and a
 * separate `url`/`bearer_token_env_var` shape for remote servers) --
 * confirmed via https://developers.openai.com/codex/mcp. This is a real
 * architectural difference (this module's `InstallSnippet.configJson`
 * field is JSON-shaped throughout every other client), not just a new
 * config shape, and needs its own design decision on whether/how to
 * represent a non-JSON snippet before implementing, matching D24's
 * already-deferred "needs a design decision first" reasoning. Also
 * deliberately not added: `gemini-cli`, despite having a verified,
 * trivially-addable `mcpServers`-shaped config -- its own documentation
 * (fetched 2026-09-07) now states "Gemini CLI was replaced by Antigravity
 * CLI on June 18th, 2026" for unpaid-tier and Google One users. Adding new
 * install-client support for a product with a credible replacement signal,
 * found while doing this verification, was judged not worth doing without
 * asking first; flagged for the person running the session's attention
 * rather than silently added or silently dropped.
 */

export type InstallClient = "claude-desktop" | "claude-code" | "cursor" | "vscode" | "windsurf" | "kiro" | "opencode";

export const INSTALL_CLIENTS: readonly InstallClient[] = [
  "claude-desktop",
  "claude-code",
  "cursor",
  "vscode",
  "windsurf",
  "kiro",
  "opencode",
];

// -- Minimal shapes of the parts of server.json this module reads ----------
// (the full, authoritative shape is schemas/vendor/server.schema.json;
// these are narrowed to exactly what derivation needs).

interface InputLike {
  description?: string;
  isRequired?: boolean;
  value?: string;
  isSecret?: boolean;
  default?: string;
  choices?: string[];
  variables?: Record<string, InputLike>;
}

interface KeyValueInputLike extends InputLike {
  name: string;
}

interface ArgumentLike extends InputLike {
  type: "positional" | "named";
  name?: string; // named only
  valueHint?: string; // positional only
}

interface PackageLike {
  registryType?: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  runtimeArguments?: ArgumentLike[];
  packageArguments?: ArgumentLike[];
  environmentVariables?: KeyValueInputLike[];
}

interface RemoteLike {
  type: "streamable-http" | "sse";
  url: string;
  headers?: KeyValueInputLike[];
}

export interface InstallableServer {
  name: string;
  packages?: PackageLike[];
  remotes?: RemoteLike[];
}

// -- Value resolution --------------------------------------------------------

interface ResolveContext {
  /** How to render a secret/unresolvable value for this client. */
  placeholder: (input: InputLike, label: string) => string;
}

function substituteVariables(value: string, variables: Record<string, InputLike> | undefined, ctx: ResolveContext): string {
  if (!variables) return value;
  return value.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const variable = variables[name];
    return variable ? resolveInputValue(variable, name, ctx) : match;
  });
}

function resolveInputValue(input: InputLike, label: string, ctx: ResolveContext): string {
  if (input.value !== undefined) return substituteVariables(input.value, input.variables, ctx);
  if (input.default !== undefined) return input.default;
  if (input.isSecret) return ctx.placeholder(input, label);
  if (input.choices && input.choices.length > 0) return input.choices[0] as string;
  if (input.isRequired) return ctx.placeholder(input, label);
  return ctx.placeholder(input, label);
}

function labelFor(arg: ArgumentLike | KeyValueInputLike): string {
  if ("name" in arg && arg.name) return arg.name.replace(/^-+/, "");
  if ("valueHint" in arg && arg.valueHint) return arg.valueHint;
  return "value";
}

function renderArgument(arg: ArgumentLike, ctx: ResolveContext): string {
  const label = labelFor(arg);
  const value = resolveInputValue(arg, label, ctx);
  if (arg.type === "named" && arg.name) {
    return value.length > 0 ? `${arg.name}=${value}` : arg.name;
  }
  return value;
}

function packageSpec(pkg: PackageLike): string {
  const separator = pkg.registryType === "oci" ? ":" : "@";
  return pkg.version ? `${pkg.identifier}${separator}${pkg.version}` : pkg.identifier;
}

function runtimeCommandFor(pkg: PackageLike): string | undefined {
  if (pkg.runtimeHint) return pkg.runtimeHint;
  switch (pkg.registryType) {
    case "npm":
      return "npx";
    case "pypi":
      return "uvx";
    case "oci":
      return "docker";
    case "nuget":
      return "dnx";
    default:
      return undefined;
  }
}

// -- Config shapes -----------------------------------------------------------

interface StdioConfig {
  type?: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface RemoteConfig {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

type ServerConfig = StdioConfig | RemoteConfig;

interface DerivedConfig {
  config: ServerConfig;
  /** VS Code only: sibling `inputs[]` entries this config's `${input:id}` references need. */
  inputs: Array<{ type: "promptString"; id: string; description?: string; password?: boolean }>;
}

function derivePackageConfig(server: InstallableServer, pkg: PackageLike, ctx: ResolveContext): DerivedConfig {
  const command = runtimeCommandFor(pkg);
  if (!command) {
    // mcpb and other non-shell-runnable registry types have no derivable
    // shell command; callers should fall back to the package's own
    // registryBaseUrl/identifier for a manual-install pointer instead.
    throw new Error(`Cannot derive a runnable command for package registryType "${pkg.registryType}"`);
  }

  const args: string[] = [];
  const isDocker = pkg.registryType === "oci";
  const env: Record<string, string> = {};

  for (const arg of pkg.runtimeArguments ?? []) args.push(renderArgument(arg, ctx));
  if (isDocker) {
    args.push("run", "--rm", "-i");
    for (const envVar of pkg.environmentVariables ?? []) {
      args.push("-e", `${envVar.name}=${resolveInputValue(envVar, envVar.name, ctx)}`);
    }
  }
  args.push(packageSpec(pkg));
  for (const arg of pkg.packageArguments ?? []) args.push(renderArgument(arg, ctx));

  if (!isDocker) {
    for (const envVar of pkg.environmentVariables ?? []) {
      env[envVar.name] = resolveInputValue(envVar, envVar.name, ctx);
    }
  }

  const config: StdioConfig = { command, args, ...(Object.keys(env).length > 0 ? { env } : {}) };
  return { config, inputs: [] };
}

function deriveRemoteConfig(remote: RemoteLike, ctx: ResolveContext): DerivedConfig {
  const headers: Record<string, string> = {};
  for (const header of remote.headers ?? []) {
    headers[header.name] = resolveInputValue(header, header.name, ctx);
  }
  const config: RemoteConfig = {
    type: remote.type === "sse" ? "sse" : "http",
    url: remote.url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
  return { config, inputs: [] };
}

/** Prefers a remote (no local runtime required) over a package, matching
 * internal project documentation Section 3.5.4's ordering (`server.remotes[].type/headers[]`
 * named after `server.packages[].transport` only because it's the second
 * axis derivation reads from, not a priority statement) with the practical
 * reasoning that a remote needs no local install step at all. */
function pickSource(server: InstallableServer): { kind: "remote"; remote: RemoteLike } | { kind: "package"; pkg: PackageLike } | undefined {
  const remote = server.remotes?.[0];
  if (remote) return { kind: "remote", remote };
  const pkg = server.packages?.[0];
  if (pkg) return { kind: "package", pkg };
  return undefined;
}

function inlinePlaceholderContext(): ResolveContext {
  return {
    placeholder: (_input, label) => `<YOUR_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}>`,
  };
}

function vscodeInputContext(server: InstallableServer, collected: DerivedConfig["inputs"]): ResolveContext {
  return {
    placeholder: (input, label) => {
      const id = `${server.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${label}`;
      if (!collected.some((i) => i.id === id)) {
        collected.push({
          type: "promptString",
          id,
          description: input.description,
          password: input.isSecret ? true : undefined,
        });
      }
      return `\${input:${id}}`;
    },
  };
}

function deriveFor(server: InstallableServer, ctx: ResolveContext, collectedInputs: DerivedConfig["inputs"]): ServerConfig {
  const source = pickSource(server);
  if (!source) throw new Error(`Server "${server.name}" has no packages[] or remotes[] to derive an install snippet from`);
  const derived =
    source.kind === "remote" ? deriveRemoteConfig(source.remote, ctx) : derivePackageConfig(server, source.pkg, ctx);
  collectedInputs.push(...derived.inputs);
  return derived.config;
}

export interface InstallSnippet {
  client: InstallClient;
  /** The full JSON block a user would paste into that client's config file. */
  configJson: string;
  /** cursor only: a one-click install deeplink. */
  deeplink?: string;
}

/** Derives an install snippet for one client. Throws if the server has
 * nothing installable to derive from (mcpb-only packages, or no
 * packages/remotes at all) -- callers render that as "no install available
 * for this client" rather than a silently empty snippet. */
export function deriveInstallSnippet(server: InstallableServer, client: InstallClient): InstallSnippet {
  if (client === "vscode") {
    const inputs: DerivedConfig["inputs"] = [];
    const config = deriveFor(server, vscodeInputContext(server, inputs), inputs);
    const body: { inputs?: typeof inputs; servers: Record<string, ServerConfig> } = {
      servers: { [server.name]: config },
    };
    if (inputs.length > 0) body.inputs = inputs;
    return { client, configJson: JSON.stringify(body, null, 2) };
  }

  if (client === "opencode") {
    const inputs: DerivedConfig["inputs"] = [];
    const config = deriveFor(server, inlinePlaceholderContext(), inputs);
    if ("url" in config) {
      // opencode's remote-server shape was not verified in this pass (only
      // the local/stdio shape was fetched and confirmed) -- fall through
      // to throwing rather than emit an unverified remote shape.
      throw new Error(`opencode remote-server install snippets are not yet verified for server "${server.name}"`);
    }
    const body = {
      mcp: {
        [server.name]: {
          type: "local" as const,
          command: [config.command, ...config.args],
          enabled: true,
          ...(config.env && Object.keys(config.env).length > 0 ? { environment: config.env } : {}),
        },
      },
    };
    return { client, configJson: JSON.stringify(body, null, 2) };
  }

  const inputs: DerivedConfig["inputs"] = [];
  const config = deriveFor(server, inlinePlaceholderContext(), inputs);
  const configJson = JSON.stringify({ mcpServers: { [server.name]: config } }, null, 2);

  if (client === "cursor") {
    const base64Config = Buffer.from(JSON.stringify(config)).toString("base64");
    const deeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(server.name)}&config=${base64Config}`;
    return { client, configJson, deeplink };
  }

  return { client, configJson };
}

/** Every client's snippet for one server, skipping clients with nothing
 * derivable (logged by the caller if it wants to surface that). */
export function deriveAllInstallSnippets(server: InstallableServer): InstallSnippet[] {
  const snippets: InstallSnippet[] = [];
  for (const client of INSTALL_CLIENTS) {
    try {
      snippets.push(deriveInstallSnippet(server, client));
    } catch {
      // no derivable source (e.g. mcpb-only packages, or no packages/remotes) -- skip this client
    }
  }
  return snippets;
}

// -- Manual inspection CLI: pnpm exec tsx scripts/install-snippets.ts <server.json path> --
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/install-snippets.ts <path-to-server.json-or-entry.json>");
    process.exitCode = 1;
    return;
  }
  const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), filePath), "utf-8")) as {
    server?: InstallableServer;
  } & InstallableServer;
  const server: InstallableServer = raw.server ?? raw;
  for (const snippet of deriveAllInstallSnippets(server)) {
    console.log(`\n=== ${snippet.client} ===`);
    console.log(snippet.configJson);
    if (snippet.deeplink) console.log(`\ndeeplink: ${snippet.deeplink}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
