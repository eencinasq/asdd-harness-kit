import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of this package (the folder holding package.json), independent of where the caller lives. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Vite output: single-file HTML bundles served as MCP App UI resources. */
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
