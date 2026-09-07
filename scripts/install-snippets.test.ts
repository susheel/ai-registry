import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deriveInstallSnippet, deriveAllInstallSnippets, type InstallableServer } from "./install-snippets.js";

const npmServer: InstallableServer = {
  name: "org.ga4gh/trs-mcp",
  packages: [
    {
      registryType: "npm",
      identifier: "@ga4gh/trs-mcp",
      version: "2.0.1",
      environmentVariables: [
        { name: "TRS_API_KEY", isSecret: true, description: "TRS API key" },
        { name: "TRS_BASE_URL", default: "https://trs.example.org" },
      ],
    },
  ],
};

describe("stdio (npm) package derivation", () => {
  test("claude-desktop/claude-code inline secret and default values under mcpServers", () => {
    const snippet = deriveInstallSnippet(npmServer, "claude-code");
    const parsed = JSON.parse(snippet.configJson);
    assert.deepEqual(parsed, {
      mcpServers: {
        "org.ga4gh/trs-mcp": {
          command: "npx",
          args: ["@ga4gh/trs-mcp@2.0.1"],
          env: {
            TRS_API_KEY: "<YOUR_TRS_API_KEY>",
            TRS_BASE_URL: "https://trs.example.org",
          },
        },
      },
    });
  });

  test("vscode uses the servers wrapper and an inputs[] promptString for the secret", () => {
    const snippet = deriveInstallSnippet(npmServer, "vscode");
    const parsed = JSON.parse(snippet.configJson);
    assert.equal(parsed.servers["org.ga4gh/trs-mcp"].command, "npx");
    assert.equal(parsed.servers["org.ga4gh/trs-mcp"].env.TRS_BASE_URL, "https://trs.example.org");
    const secretRef = parsed.servers["org.ga4gh/trs-mcp"].env.TRS_API_KEY as string;
    assert.match(secretRef, /^\$\{input:.+\}$/);
    const inputId = secretRef.slice("${input:".length, -1);
    const input = parsed.inputs.find((i: { id: string }) => i.id === inputId);
    assert.ok(input);
    assert.equal(input.type, "promptString");
    assert.equal(input.password, true);
  });

  test("cursor gets a deeplink whose base64 config decodes to the bare server config", () => {
    const snippet = deriveInstallSnippet(npmServer, "cursor");
    assert.ok(snippet.deeplink?.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?name="));
    const configParam = new URL(snippet.deeplink!).searchParams.get("config");
    assert.ok(configParam);
    const decoded = JSON.parse(Buffer.from(configParam!, "base64").toString("utf-8"));
    assert.equal(decoded.command, "npx");
  });

  test("windsurf and kiro both use the same mcpServers wrapper as claude-desktop", () => {
    for (const client of ["windsurf", "kiro"] as const) {
      const snippet = deriveInstallSnippet(npmServer, client);
      const parsed = JSON.parse(snippet.configJson);
      assert.deepEqual(parsed.mcpServers["org.ga4gh/trs-mcp"].command, "npx");
      assert.deepEqual(parsed.mcpServers["org.ga4gh/trs-mcp"].args, ["@ga4gh/trs-mcp@2.0.1"]);
    }
  });

  test("opencode uses a top-level mcp object with an array-form command and environment key", () => {
    const snippet = deriveInstallSnippet(npmServer, "opencode");
    const parsed = JSON.parse(snippet.configJson);
    const config = parsed.mcp["org.ga4gh/trs-mcp"];
    assert.equal(config.type, "local");
    assert.deepEqual(config.command, ["npx", "@ga4gh/trs-mcp@2.0.1"]);
    assert.equal(config.enabled, true);
    assert.equal(config.environment.TRS_BASE_URL, "https://trs.example.org");
    assert.equal(config.env, undefined);
  });

  test("opencode throws (skips) for a remote server, since its remote shape is unverified", () => {
    const remote: InstallableServer = {
      name: "org.ga4gh/remote-mcp",
      remotes: [{ type: "streamable-http", url: "https://api.example.org/mcp" }],
    };
    assert.throws(() => deriveInstallSnippet(remote, "opencode"));
  });
});

describe("docker (oci) package derivation", () => {
  test("environment variables are passed as -e argv pairs, not a client env object", () => {
    const server: InstallableServer = {
      name: "org.ga4gh/beacon-mcp",
      packages: [
        {
          registryType: "oci",
          identifier: "ghcr.io/ga4gh/beacon-mcp",
          version: "1.0.0",
          environmentVariables: [{ name: "BEACON_TOKEN", isSecret: true }],
        },
      ],
    };
    const snippet = deriveInstallSnippet(server, "claude-desktop");
    const parsed = JSON.parse(snippet.configJson);
    const config = parsed.mcpServers["org.ga4gh/beacon-mcp"];
    assert.equal(config.command, "docker");
    assert.deepEqual(config.args, [
      "run",
      "--rm",
      "-i",
      "-e",
      "BEACON_TOKEN=<YOUR_BEACON_TOKEN>",
      "ghcr.io/ga4gh/beacon-mcp:1.0.0",
    ]);
    assert.equal(config.env, undefined);
  });
});

describe("argument rendering", () => {
  test("a named argument with a value renders as name=value; a positional argument renders its value verbatim", () => {
    const server: InstallableServer = {
      name: "org.ga4gh/example-mcp",
      packages: [
        {
          registryType: "npm",
          identifier: "@ga4gh/example-mcp",
          packageArguments: [
            { type: "positional", value: "serve" },
            { type: "named", name: "--port", value: "8080" },
          ],
        },
      ],
    };
    const snippet = deriveInstallSnippet(server, "claude-desktop");
    const parsed = JSON.parse(snippet.configJson);
    assert.deepEqual(parsed.mcpServers["org.ga4gh/example-mcp"].args, [
      "@ga4gh/example-mcp",
      "serve",
      "--port=8080",
    ]);
  });
});

describe("remote transport derivation", () => {
  const remoteServer: InstallableServer = {
    name: "org.ga4gh/remote-mcp",
    remotes: [
      {
        type: "streamable-http",
        url: "https://api.example.org/mcp",
        headers: [{ name: "Authorization", isSecret: true }],
      },
    ],
  };

  test("remotes are preferred over packages when both are present", () => {
    const both: InstallableServer = {
      ...remoteServer,
      packages: [{ registryType: "npm", identifier: "@ga4gh/remote-mcp" }],
    };
    const snippet = deriveInstallSnippet(both, "claude-desktop");
    const parsed = JSON.parse(snippet.configJson);
    assert.equal(parsed.mcpServers["org.ga4gh/remote-mcp"].url, "https://api.example.org/mcp");
    assert.equal(parsed.mcpServers["org.ga4gh/remote-mcp"].command, undefined);
  });

  test("streamable-http normalises to type \"http\" with a headers object", () => {
    const snippet = deriveInstallSnippet(remoteServer, "claude-code");
    const parsed = JSON.parse(snippet.configJson);
    const config = parsed.mcpServers["org.ga4gh/remote-mcp"];
    assert.equal(config.type, "http");
    assert.equal(config.headers.Authorization, "<YOUR_AUTHORIZATION>");
  });

  test("vscode renders the same remote as a servers entry with an input-prompted header", () => {
    const snippet = deriveInstallSnippet(remoteServer, "vscode");
    const parsed = JSON.parse(snippet.configJson);
    const config = parsed.servers["org.ga4gh/remote-mcp"];
    assert.equal(config.type, "http");
    assert.match(config.headers.Authorization, /^\$\{input:.+\}$/);
  });
});

describe("no derivable source", () => {
  test("an mcpb-only package throws for deriveInstallSnippet", () => {
    const server: InstallableServer = {
      name: "org.ga4gh/bundle-mcp",
      packages: [{ registryType: "mcpb", identifier: "bundle.mcpb" }],
    };
    assert.throws(() => deriveInstallSnippet(server, "claude-desktop"));
  });

  test("deriveAllInstallSnippets skips clients gracefully instead of throwing", () => {
    const server: InstallableServer = {
      name: "org.ga4gh/bundle-mcp",
      packages: [{ registryType: "mcpb", identifier: "bundle.mcpb" }],
    };
    assert.deepEqual(deriveAllInstallSnippets(server), []);
  });

  test("a server with no packages or remotes at all throws", () => {
    assert.throws(() => deriveInstallSnippet({ name: "org.ga4gh/empty" }, "claude-desktop"));
  });
});
