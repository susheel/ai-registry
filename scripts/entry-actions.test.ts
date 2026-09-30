import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deriveEntryActions } from "./lib/entry-actions.js";

const core = {
  homepage: "https://example.org/project",
  repository: "https://github.com/example/project",
};

describe("deriveEntryActions", () => {
  test("MCP servers and plugins with install panels lead with Install", () => {
    const mcp = deriveEntryActions("mcp-servers", { ...core, server: { websiteUrl: "https://docs.example.org" } }, { hasInstallPanels: true });
    assert.equal(mcp.primary, "install");
    assert.deepEqual(mcp.install, { targetId: "install" });
    assert.equal(mcp.upstream?.href, "https://example.org/project");
    assert.deepEqual(
      mcp.links.map((l) => l.id),
      ["repository", "documentation"],
    );

    const plugin = deriveEntryActions("plugins", core, { hasInstallPanels: true });
    assert.equal(plugin.primary, "install");
  });

  test("without install panels, MCP servers fall back to View upstream", () => {
    const mcp = deriveEntryActions("mcp-servers", core, { hasInstallPanels: false });
    assert.equal(mcp.primary, "upstream");
    assert.equal(mcp.install, undefined);
  });

  test("models use the model card as upstream and Install only with install_command", () => {
    const base = { ...core, model_card_uri: "https://huggingface.co/org/model", access_uri: "https://huggingface.co/org/model" };
    const noInstall = deriveEntryActions("models", base);
    assert.equal(noInstall.primary, "upstream");
    assert.equal(noInstall.upstream?.href, "https://huggingface.co/org/model");
    assert.ok(!noInstall.links.some((l) => l.id === "access"), "access_uri identical to the model card is de-duplicated");

    const withInstall = deriveEntryActions("models", { ...base, install_command: "pip install model" });
    assert.equal(withInstall.primary, "install");
    assert.deepEqual(withInstall.install, { targetId: "model-install" });
  });

  test("skills, agents and bundles lead with View upstream and list their own links", () => {
    const skill = deriveEntryActions("skills", {
      ...core,
      source: { repository: { url: "https://github.com/example/project.git" } },
      evaluation_criteria_uri: "https://example.org/eval",
    });
    assert.equal(skill.primary, "upstream");
    assert.deepEqual(
      skill.links.map((l) => l.id),
      ["repository", "evaluation"],
      "skill source equal to the repository (modulo .git) is de-duplicated",
    );

    const bundle = deriveEntryActions("bundles", { ...core, homepage: core.repository, source_uri: "https://raw.example.org/marketplace.json" });
    assert.equal(bundle.primary, "upstream");
    assert.deepEqual(
      bundle.links.map((l) => l.id),
      ["manifest"],
    );

    const agent = deriveEntryActions("agents", { ...core, agent_info_uri: "https://agent.example.org/service-info" });
    assert.equal(agent.primary, "upstream");
    assert.ok(agent.links.some((l) => l.id === "agent-info"));
  });

  test("never invents an upstream link and never links unsafe URLs", () => {
    const actions = deriveEntryActions("skills", { homepage: "javascript:alert(1)", repository: "not a url" });
    assert.equal(actions.upstream, undefined);
    assert.equal(actions.primary, "none");
    assert.deepEqual(actions.links, []);
  });
});
