/**
 * Compile the NestJS server into dist/server/main.js (ESM, node_modules kept external).
 * MCP clients run this file with plain `node` (bin/knowledge.mjs) — no tsx, no tsconfig lookup at runtime.
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

const { size } = await fs.stat(path.join(outdir, 'main.js'));
console.log(`dist/server/main.js ${(size / 1024).toFixed(0)} kB`);
