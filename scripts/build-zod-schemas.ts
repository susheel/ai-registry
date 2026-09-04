#!/usr/bin/env tsx
/**
 * scripts/build-zod-schemas.ts -- regenerates the Zod schemas that back
 * site/src/content.config.ts's Content Collections (internal project documentation Section
 * 3.1, Section 4.1). `site/`'s `predev`/`prebuild` npm scripts (internal project documentation
 * Phase 3) invoke this directly with `--out`, writing into
 * `site/src/generated/entry-schemas.zod.ts` before Astro starts, so
 * `content.config.ts` can use a plain relative import with no in-process
 * codegen step and no live-ZodType-returning API surface on
 * scripts/lib/generate-zod-schemas.ts.
 *
 * Output is never committed (both `scripts/generated/` and
 * `site/src/generated/` are gitignored): TECH.md Section 3.1 requires either
 * a committed-snapshot staleness diff or unconditional regeneration on every
 * build; this project takes the second option, so there is nothing to go
 * stale.
 *
 * Usage: pnpm generate:zod  (writes scripts/generated/entry-schemas.zod.ts)
 *        tsx scripts/build-zod-schemas.ts --out <path>  (writes elsewhere,
 *        e.g. site/src/generated/entry-schemas.zod.ts)
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateZodModuleSource } from "./lib/generate-zod-schemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, "generated/entry-schemas.zod.ts");

function parseOutputPath(argv: string[]): string {
  const flagIndex = argv.indexOf("--out");
  if (flagIndex === -1) return DEFAULT_OUTPUT_PATH;
  const value = argv[flagIndex + 1];
  if (!value) throw new Error("--out requires a path argument");
  return path.resolve(process.cwd(), value);
}

async function main() {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const source = await generateZodModuleSource();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, "utf-8");
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
