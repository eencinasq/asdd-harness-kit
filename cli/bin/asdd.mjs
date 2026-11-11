#!/usr/bin/env node
// The asdd command. Runs the compiled dist/; in the kit, src/ when dist/ is missing or older than src/.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliRoot = dirname(fileURLToPath(import.meta.url)); // …/bin
const root = join(cliRoot, '..'); // …/cli (kit checkout, or the asdd-harness-kit package)
const distMain = join(root, 'dist/main.mjs');
const srcMain = join(root, 'src/main.mjs');

// In the kit (the only place with src/), a dist/ older than its sources must not run: hooks and `asdd check` would
// run old code after every edit until someone rebuilt. The npm package ships dist/ only.
async function distIsCurrent() {
  if (!existsSync(distMain)) return false;
  if (!existsSync(srcMain)) return true;
  try {
    const built = JSON.parse(readFileSync(join(root, 'dist/build.json'), 'utf8')).sourceFingerprint;
    const { fingerprint } = await import(pathToFileURL(join(root, 'src/kit/fingerprint.mjs')).href);
    return built === fingerprint(join(root, 'src'));
  } catch {
    return false;
  }
}
const mainPath = (await distIsCurrent()) ? distMain : srcMain;
if (!existsSync(mainPath)) {
  console.error('asdd: missing dist/main.mjs (and no src/main.mjs). Run: npm run build');
  process.exit(1);
}

const { main } = await import(pathToFileURL(mainPath).href);
const code = await main(process.argv.slice(2));
// A harness command sets its own exit status (or exits); only overwrite it with ours.
if (code !== undefined) process.exitCode = code;
