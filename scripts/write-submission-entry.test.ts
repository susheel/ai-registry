import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeSubmissionEntry } from "./write-submission-entry.js";
import type { SubmissionCheckResult } from "./validate-submission.js";
import type { EntryType } from "./lib/types.js";

describe("writeSubmissionEntry", () => {
  test("refuses to write when the result is not ok", async () => {
    const notOk: SubmissionCheckResult = { ok: false, parseErrors: ["boom"], validation: null, record: null };
    await assert.rejects(() => writeSubmissionEntry({ result: notOk, type: "model" }), /not ok/);
  });

  test("writes data/<type-dir>/<slug>.json under the given dataRoot", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "ai-registry-write-submission-"));
    try {
      const ok: SubmissionCheckResult = {
        ok: true,
        parseErrors: [],
        validation: { file: "candidate.json", ok: true, issues: [] },
        record: { id: "example-model", type: "model", name: "Example Model" },
      };
      const { filePath, slug } = await writeSubmissionEntry({ result: ok, type: "model", dataRoot });
      assert.equal(slug, "example-model");
      assert.equal(filePath, path.join(dataRoot, "models", "example-model.json"));
      const written = JSON.parse(await readFile(filePath, "utf-8"));
      assert.deepEqual(written, { id: "example-model", type: "model", name: "Example Model" });
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  test("uses the type-specific plural directory for each of the five types", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "ai-registry-write-submission-"));
    try {
      const cases: Array<[string, string]> = [
        ["model", "models"],
        ["agent", "agents"],
        ["skill", "skills"],
        ["mcp-server", "mcp-servers"],
        ["plugin", "plugins"],
      ];
      for (const [type, dir] of cases) {
        const ok: SubmissionCheckResult = {
          ok: true,
          parseErrors: [],
          validation: { file: "candidate.json", ok: true, issues: [] },
          record: { id: `example-${type}`, type },
        };
        const { filePath } = await writeSubmissionEntry({ result: ok, type: type as EntryType, dataRoot });
        assert.equal(filePath, path.join(dataRoot, dir, `example-${type}.json`));
      }
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
