/**
 * Compile the NestJS server into dist/server/main.js (ESM, node_modules kept external).
 * Production / npx runs this file with plain `node` — no tsx, no tsconfig lookup at runtime.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'dist/server');

await fs.rm(outdir, { recursive: true, force: true });
await build({
	entryPoints: [path.join(root, 'src/main.ts')],
	outfile: path.join(outdir, 'main.js'),
	bundle: true,
	packages: 'external',
	platform: 'node',
	format: 'esm',
	target: 'node22',
	sourcemap: true,
	// experimentalDecorators from tsconfig.json (Nest); DI uses explicit @Inject tokens, so no metadata needed.
	tsconfig: path.join(root, 'tsconfig.json'),
	logLevel: 'warning',
});

// The review engine reads its rule docs next to its module (import.meta.url → dist/server).
await fs.cp(path.join(root, 'src/pr-review/engine/rules'), path.join(outdir, 'rules'), { recursive: true });

const { size } = await fs.stat(path.join(outdir, 'main.js'));
console.log(`dist/server/main.js ${(size / 1024).toFixed(0)} kB`);
