import { defineConfig } from "astro/config";

// Static output mode per internal project documentation Section 4.1. `site`/`base` are set
// per internal project documentation Section 5, which currently settles the GitHub Pages
// destination as `https://susheel.github.io/ai-registry/`, a subpath
// rather than an origin root -- a near-term, personal-account choice
// (2026-09-11, internal project documentation Phase 12 addendum): this repository will be
// made public so GitHub Pages can serve it directly, with GitLab kept as
// a private full-content mirror of this repository's local `main` branch
// rather than a second deploy target. Revisit both values again if the
// org-coordinated GA4GH-owned home (internal project documentation Phase 9) or a
// custom-domain decision lands. Every internal link in this site MUST go
// through `src/lib/url.ts`'s `withBase()` helper rather than a bare
// `/`-prefixed literal string -- Astro does not retroactively rewrite
// those for you (internal project documentation Phase 5's implementation notes).
export default defineConfig({
  output: "static",
  site: "https://susheel.github.io",
  base: "/ai-registry",
});
