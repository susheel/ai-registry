import { defineConfig } from "astro/config";

// Static output mode per internal project documentation Section 4.1. `site`/`base` are now set
// per internal project documentation Section 5, which settles the GitHub Pages destination as
// `https://ga4gh.github.io/ai-registry/`, a subpath rather than an origin
// root. Every internal link in this site MUST go through
// `src/lib/url.ts`'s `withBase()` helper rather than a bare `/`-prefixed
// literal string -- Astro does not retroactively rewrite those for you
// (internal project documentation Phase 5's implementation notes).
export default defineConfig({
  output: "static",
  site: "https://ga4gh.github.io",
  base: "/ai-registry",
});
