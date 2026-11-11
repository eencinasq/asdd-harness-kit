import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds one MCP App view (ui/<INPUT>) into a single self-contained dist/<INPUT>,
 * which the NestJS server serves as a `ui://` resource. Run once per view.
 */
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.join(PROJECT_ROOT, 'ui');
const INPUT = process.env['INPUT'] ?? 'analysis-dashboard.html';

const isDevelopment = process.env['NODE_ENV'] === 'development';
const prefixedLogger = createLogger();
for (const level of ['info', 'warn', 'error'] as const) {
	const fn = prefixedLogger[level];
	prefixedLogger[level] = (msg, opts) => fn(msg.replace(/^/gm, '[vite] '), opts);
}

export default defineConfig({
	root: UI_ROOT,
	customLogger: prefixedLogger,
	plugins: [viteSingleFile()],
	build: {
		sourcemap: isDevelopment ? 'inline' : undefined,
		cssMinify: !isDevelopment,
		minify: !isDevelopment,
		rollupOptions: {
			input: path.join(UI_ROOT, INPUT),
		},
		outDir: path.join(PROJECT_ROOT, 'dist'),
		emptyOutDir: false,
	},
});
