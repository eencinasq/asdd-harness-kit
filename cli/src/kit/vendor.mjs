/**
 * asdd kit vendor — copy the harness libraries each MCP server under tools/ needs into
 * tools/<name>/src/harness/, so the servers run on their own (bundled into dist by esbuild) and never
 * load the harness from the project at runtime. The copies stay byte-for-byte the kit's logic, so chat (MCP),
 * Verify-on-Stop and CI still give the same verdicts.
 *
 *   asdd kit vendor           write the copies
 *   asdd kit vendor --check   exit 1 when a copy is stale (npm test runs this)
 *
 * Each copy is the source plus a header, minus its CLI block (`if (import.meta.url === …argv[1]) {…}` at
 * the end of the file), which must never run inside a server bundle.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const SCRIPTS = join(ROOT, 'cli/src/harness');

/** Entry modules per server; their relative imports (static and dynamic) are followed. */
export const VENDORED = {
  'spec-drift': ['drift-lib.mjs', 'semgrep-lib.mjs', 'audit-lib.mjs', 'learning-lib.mjs', 'knowledge-store.mjs'],
  'jev-gate': ['env-loader.mjs', 'command-gate.mjs'],
  knowledge: ['knowledge-query.mjs'],
};

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const CLI_BLOCK = /^if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{$/m;

/** Every module reachable from the entries, as paths relative to cli/src/harness. */
export function closure(entries) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    const abs = join(SCRIPTS, rel);
    if (!existsSync(abs)) throw new Error(`cli/src/harness/${rel} not found`);
    seen.add(rel);
    for (const [, spec] of readFileSync(abs, 'utf8').matchAll(IMPORT)) {
      visit(posix.normalize(posix.join(posix.dirname(rel), spec)));
    }
  };
  for (const entry of entries) visit(entry);
  return [...seen].sort();
}

export function vendoredText(rel) {
  let text = readFileSync(join(SCRIPTS, rel), 'utf8');
  const cli = text.search(CLI_BLOCK);
  if (cli >= 0) text = `${text.slice(0, cli).trimEnd()}\n`;
  if (/^#!/.test(text)) text = text.slice(text.indexOf('\n') + 1);
  return `// GENERATED from cli/src/harness/${rel} by asdd kit vendor: edit the source, then rerun it.\n${text}`;
}

const listFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const abs = join(dir, name);
        return statSync(abs).isDirectory() ? listFiles(abs) : [abs];
      })
    : [];

export function run(argv = []) {
  const check = argv.includes('--check');
  const problems = [];
  for (const [tool, entries] of Object.entries(VENDORED)) {
    const outDir = join(ROOT, 'tools', tool, 'src/harness');
    const files = closure(entries);
    for (const rel of files) {
      const out = join(outDir, rel);
      const want = vendoredText(rel);
      const have = existsSync(out) ? readFileSync(out, 'utf8') : null;
      if (have === want) continue;
      if (check) problems.push(`tools/${tool}/src/harness/${rel} is ${have === null ? 'missing' : 'stale'}`);
      else {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, want);
        console.log(`WRITE tools/${tool}/src/harness/${rel}`);
      }
    }
    const keep = new Set(files.map((rel) => join(outDir, rel)));
    for (const abs of listFiles(outDir)) {
      if (keep.has(abs)) continue;
      const rel = relative(ROOT, abs);
      if (check) problems.push(`${rel} is not vendored from cli/src/harness`);
      else {
        rmSync(abs);
        console.log(`REMOVE ${rel}`);
      }
    }
  }
  if (problems.length) {
    console.error(`${problems.join('\n')}\nRun: asdd kit vendor (node cli/bin/asdd.mjs kit vendor)`);
    return 1;
  }
  if (check) console.log('OK vendored harness libs match cli/src/harness');
  return 0;
}

