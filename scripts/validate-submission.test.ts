import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runSubmissionCheck } from "./validate-submission.js";

function validModelFieldsJson(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    id: "example-model",
    name: "Example Model",
    summary: "A one-line summary.",
    description: "A longer description.",
    homepage: "https://example.org/example-model",
    repository: "https://github.com/example-org/example-model",
    license: "MIT",
    version: "1.0.0",
    category: "variant-effect-prediction",
    keywords: "example",
    maintainers: "Ada Researcher, ada-researcher",
    safety_classification: "_No response_",
    model_card_uri: "https://example.org/example-model/card.json",
    ...overrides,
  });
}

describe("runSubmissionCheck", () => {
  test("an unrecognised ISSUE_TYPE fails before any parsing is attempted", async () => {
    const result = await runSubmissionCheck({ type: "not-a-type", issueNumber: 1, fieldsJson: "{}", skipNetwork: true });
    assert.equal(result.ok, false);
    assert.match(result.parseErrors[0] ?? "", /unrecognised ISSUE_TYPE/);
    assert.equal(result.validation, null);
    assert.equal(result.record, null);
  });

  test("malformed ISSUE_FIELDS_JSON is reported as a specific parse error", async () => {
    const result = await runSubmissionCheck({ type: "model", issueNumber: 1, fieldsJson: "{not json", skipNetwork: true });
    assert.equal(result.ok, false);
    assert.match(result.parseErrors[0] ?? "", /ISSUE_FIELDS_JSON is not valid JSON/);
  });

  test("a structured-textarea parse error (e.g. a malformed maintainers row) is surfaced without ever running schema validation", async () => {
    const result = await runSubmissionCheck({
      type: "model",
      issueNumber: 1,
      fieldsJson: validModelFieldsJson({ maintainers: "Ada Researcher" }),
      skipNetwork: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.parseErrors[0] ?? "", /maintainers row 1/);
    assert.equal(result.validation, null);
  });

  test("a well-formed but schema-invalid candidate reports validation failure with the record still attached", async () => {
    const result = await runSubmissionCheck({
      type: "model",
      issueNumber: 7,
      fieldsJson: validModelFieldsJson({ id: "Not A Valid Slug!" }),
      skipNetwork: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.parseErrors.length, 0);
    assert.notEqual(result.record, null);
    assert.equal(result.validation?.ok, false);
    assert.ok(result.validation?.issues.some((i) => i.code === "schema"));
  });

  test("a fully valid submission passes with offline checks (schema, licence, category) and reports the built record", async () => {
    const result = await runSubmissionCheck({
      type: "model",
      issueNumber: 42,
      fieldsJson: validModelFieldsJson(),
      skipNetwork: true,
    });
    assert.equal(result.parseErrors.length, 0);
    assert.equal(result.record?.id, "example-model");
    assert.equal(result.ok, true);
    assert.deepEqual(result.validation?.issues, []);
  });
});
