// The fingerprint of cli/src that asdd kit build stamps into dist/build.json. bin/asdd.mjs compares it in the kit
// (the only place with src/), so a dist/ older than its sources never runs. Node built-ins only: bin imports it.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const isTest = (name) => /\.(test|spec)\./.test(name);

/** Every compiled source under `dir`: .mjs files, tests excluded. */
export function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (entry.isFile() && entry.name.endsWith('.mjs') && !isTest(entry.name)) yield path;
  }
}

/** sha256 over every source's relative path and content, in path order. */
export function fingerprint(dir) {
  const hash = createHash('sha256');
  for (const file of [...sources(dir)].sort()) {
    hash.update(relative(dir, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
