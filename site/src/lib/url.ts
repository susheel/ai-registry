/**
 * Prefixes an absolute, root-relative path with this deployment's base path
 * (GitHub Pages serves this site at `https://registry.biocommons.ai/`, an
 * origin root, not a subpath -- the base is `/`, so this function's
 * fallback-to-plain-root-relative-paths behaviour is what's actually in
 * effect. See astro.config.mjs's own comment for why: a subpath base broke
 * every internal link except the homepage once this custom domain went live).
 *
 * Astro does NOT retroactively rewrite a literal string href for you --
 * confirmed directly against Astro's own documentation, not assumed: "If you
 * configure a `base` value for your Astro project, all internal page links
 * within your website must be prefixed with this `base` value to ensure
 * they resolve correctly." Every internal `href`/`src` in this site MUST go
 * through this helper instead of a bare `/`-prefixed literal.
 *
 * `import.meta.env.BASE_URL` reflects `astro.config.mjs`'s `base` option
 * exactly as configured, with NO trailing slash normalisation in Astro v3+
 * (confirmed via Astro's own upgrade-guide documentation: "In Astro v3.0,
 * `import.meta.env.BASE_URL` no longer automatically appends a trailing
 * slash by default"), so this function handles both a `base` with and
 * without a trailing slash, and works identically whether `base` is set at
 * all (falling back to plain root-relative paths when it is the default
 * `"/"`, exactly Phase 3's original unprefixed behaviour).
 */
const BASE = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const trimmedBase = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${withLeadingSlash}` || "/";
}
