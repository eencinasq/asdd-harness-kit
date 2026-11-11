/**
 * asdd kit build — compile cli/src → cli/dist (minify; optional obfuscate).
 * Source keeps calling harness scripts the same way; projects and the npm package ship dist/ only (no src/).
 *
 * Usage:
 *   asdd kit build [--obfuscate] [--check]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { fingerprint, sources } from './fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'cli/src');
const DIST = join(ROOT, 'cli/dist');

const walk = sources;

async function minifyAll(entryPoints) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints,
    outdir: DIST,
    outbase: SRC,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: true,
    sourcemap: false,
    write: true,
    logLevel: 'silent',
    // Keep .mjs so dynamic import(pathToFileURL(.../check-invariants.mjs)) matches src/.
    outExtension: { '.js': '.mjs' },
    // Keep import.meta.url / dynamic import(path) working like src/.
    banner: {
      js: '// Generated from cli/src by asdd kit build. Edit the source, then rebuild.\n',
    },
  });
  if (result.errors?.length) throw new Error(result.errors.map((e) => e.text).join('\n'));
}

async function obfuscateTree() {
  const { default: JavaScriptObfuscator } = await import('javascript-obfuscator');
  for (const file of walk(DIST)) {
    const source = readFileSync(file, 'utf8');
    const out = JavaScriptObfuscator.obfuscate(source, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      stringArray: true,
      stringArrayThreshold: 0.5,
      stringArrayEncoding: ['base64'],
      renameGlobals: false,
      // Preserve ESM import/export and dynamic import paths used by the dispatcher.
      ignoreImports: true,
      target: 'node',
      seed: 1,
    }).getObfuscatedCode();
    writeFileSync(file, `${out}\n`);
  }
}

function stampMeta({ obfuscate }) {
  const meta = {
    builtAt: new Date().toISOString(),
    sourceFingerprint: fingerprint(SRC),
    obfuscate: Boolean(obfuscate),
  };
  writeFileSync(join(DIST, 'build.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/** @returns {Promise<number>} */
export async function run(argv = []) {
  const obfuscate = argv.includes('--obfuscate');
  const check = argv.includes('--check');
  if (!existsSync(SRC)) {
    console.error('FAIL  cli/src missing');
    return 1;
  }

  const entries = [...walk(SRC)];
  if (!entries.length) {
    console.error('FAIL  no .mjs files under cli/src');
    return 1;
  }

  if (check) {
    if (!existsSync(join(DIST, 'main.mjs')) || !existsSync(join(DIST, 'build.json'))) {
      console.error('FAIL  cli/dist is missing; run: asdd kit build');
      return 1;
    }
    const meta = JSON.parse(readFileSync(join(DIST, 'build.json'), 'utf8'));
    const now = fingerprint(SRC);
    if (meta.sourceFingerprint !== now) {
      console.error('FAIL  cli/dist is stale vs cli/src; run: asdd kit build');
      return 1;
    }
    console.log(`OK cli/dist matches cli/src (${entries.length} modules)`);
    return 0;
  }

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  await minifyAll(entries);
  if (obfuscate) await obfuscateTree();
  const meta = stampMeta({ obfuscate });
  console.log(`OK cli/dist (${entries.length} modules, obfuscate=${meta.obfuscate})`);
  return 0;
}

// Direct: node cli/src/kit/build.mjs
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await run(process.argv.slice(2));
}
