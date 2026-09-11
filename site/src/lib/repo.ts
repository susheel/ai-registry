/**
 * Canonical source-repository URL for submission links (issue forms live
 * under `.github/ISSUE_TEMPLATE/submit-<type>.yml` in this same repository,
 * internal project documentation Phase 4). This currently points at the private, explicitly
 * *temporary* testing repository (`internal project documentation` Phase 9,
 * `.github/ISSUE_TEMPLATE/config.yml`'s own header comment) rather than the
 * eventual GA4GH-org production repository -- update this one constant,
 * alongside `.github/ISSUE_TEMPLATE/config.yml`'s two URLs and
 * `site/astro.config.mjs`'s `site`/`base`, once that decision is made.
 */
export const SUBMIT_REPO_URL = "https://github.com/susheel/ai-registry";

/**
 * Deep-links straight into the matching issue form (GitHub's `?template=`
 * query param preselects a form by filename, both for the classic chooser
 * and for YAML issue forms). `type` is the common-core singular type value
 * (internal project documentation Section 3.2), which is also each form's filename stem.
 */
export function submitIssueUrl(type: string): string {
  return `${SUBMIT_REPO_URL}/issues/new?template=submit-${type}.yml`;
}

/**
 * Deep-links to a specific file's `blob` view on the default branch (`main`,
 * matching this repository's actual default branch). Used by the
 * specification pages (`/specifications/`) to link from a rendered schema
 * back to its raw JSON source, and from a per-type schema page's embedded
 * vendor reference (e.g. `schemas/vendor/server.schema.json`) to that
 * vendored file.
 */
export function repoBlobUrl(relativePath: string): string {
  return `${SUBMIT_REPO_URL}/blob/main/${relativePath}`;
}
