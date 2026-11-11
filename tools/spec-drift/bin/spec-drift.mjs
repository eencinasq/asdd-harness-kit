#!/usr/bin/env node
// Package entry point (`npx spec-drift`): stdio by default, `--http` for Streamable HTTP.
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	process.stderr.write(
		[
			'Usage: spec-drift [--stdio | --http]',
			'',
			'  --stdio   serve MCP over stdin/stdout (default; what MCP clients launch)',
			'  --http    serve Streamable HTTP on http://$HOST:$PORT/mcp (default 127.0.0.1:3010)',
			'',
			'Environment: HARNESS_ROOT, PR_REVIEW_REPO, ANALYSIS_REPO_ROOT, PR_REVIEW_ROOT, PORT, HOST, MCP_API_KEY',
			'',
		].join('\n'),
	);
	process.exit(0);
}
if (!args.includes('--http') && !process.argv.includes('--stdio')) process.argv.push('--stdio');
const { existsSync } = await import('node:fs');
const server = new URL('../dist/server/main.js', import.meta.url);
if (!existsSync(server)) {
	// stdout stays reserved for the MCP protocol.
	const dir = new URL('..', import.meta.url).pathname;
	process.stderr.write(`spec-drift: not built. Run once: cd ${dir} && pnpm install && pnpm build (Node >= 24.22.1)\n`);
	process.exit(1);
}
await import(server.href);
