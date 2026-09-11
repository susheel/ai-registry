import { defineConfig } from "astro/config";

// Static output mode per internal project documentation. `site`/`base` are
// set per internal project documentation. Canonical destination as of
// 2026-09-11 is the custom domain `https://registry.biocommons.ai/`,
// served at an origin root -- GitHub Pages serves a custom domain at the
// domain root regardless of the underlying repository name, so `base` is
// empty here, not `/ai-registry`. This was a real, live bug caught after
// the domain went live: with an earlier `/ai-registry` base still set,
// every internal link 404'd except the homepage (confirmed directly:
// `/ai-registry/models/` returned 404 at the custom domain root, while
// `.well-known/ai-catalog.json` at the true root worked correctly, since
// the build scripts write that file directly rather than through Astro's
// page-routing/base logic). This trade-off is deliberate: a fallback
// `github.io/ai-registry`-style URL's internal navigation would now need
// a `/ai-registry` base to work, and no longer does -- the custom domain
// is the real canonical URL. Every internal link in this site MUST go
// through `src/lib/url.ts`'s `withBase()` helper rather than a bare
// `/`-prefixed literal string, even with an empty base -- Astro does not
// retroactively rewrite those for you, and a future base change should
// not require re-auditing every link.
export default defineConfig({
  output: "static",
  site: "https://registry.biocommons.ai",
  base: "/",
});
