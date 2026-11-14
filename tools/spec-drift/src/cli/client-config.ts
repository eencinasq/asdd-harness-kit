import fs from 'node:fs';
import path from 'node:path';

/**
 * Client configuration for `spec-drift config` (spec-drift-adoption REQ-004): what a teammate pastes into Cursor, Claude
 * Code or Claude Desktop, with every path already resolved — nobody edits paths by hand. Pure except `toolDirs`.
 */

export const CLIENTS = ['cursor', 'claude-code', 'claude-desktop'] as const;
export type Client = (typeof CLIENTS)[number];

/** Cursor's own variable for the open folder: a literal for Cursor to expand, not a JS template. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor expands ${workspaceFolder} in mcp.json.
export const CURSOR_WORKSPACE = '${workspaceFolder}';

/** Where each client reads the configuration. */
export const WHERE: Record<Client, string> = {
	cursor: '<project>/.cursor/mcp.json (this project) or ~/.cursor/mcp.json (every project); then Cursor Settings → MCP',
	'claude-code': 'run the command in a terminal; check with `claude mcp list`',
	'claude-desktop':
		'~/Library/Application Support/Claude/claude_desktop_config.json (Settings → Developer → Edit Config); then quit and reopen Claude',
};

/** Directories of the tools the server runs (node, semgrep, gh, git), found on a PATH, in that order, once each. */
export const toolDirs = (envPath: string | undefined, nodeBin: string): string[] => {
	const dirs = [path.dirname(nodeBin)];
	for (const tool of ['semgrep', 'gh', 'git']) {
		for (const dir of (envPath ?? '').split(path.delimiter).filter(Boolean)) {
			try {
				fs.accessSync(path.join(dir, tool), fs.constants.X_OK);
				dirs.push(dir);
				break;
			} catch {
				// not here
			}
		}
	}
	return [...new Set([...dirs, '/usr/bin', '/bin'])];
};

const shellQuote = (s: string): string => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

export const clientConfig = (options: {
	readonly client: Client;
	/** Absolute path of `bin/mcp-stdio`. */
	readonly launcher: string;
	/** Absolute project root, or none (Cursor then follows the open folder). */
	readonly project?: string;
	readonly pathDirs: readonly string[];
	readonly toolsets?: string;
}): string => {
	const { client, launcher, project } = options;
	const root = project ?? (client === 'cursor' ? CURSOR_WORKSPACE : client === 'claude-code' ? '$PWD' : undefined);
	const env: Record<string, string> = {
		...(root ? { PR_REVIEW_REPO: root, ANALYSIS_REPO_ROOT: root, HARNESS_ROOT: root } : {}),
		...(options.toolsets ? { SPEC_DRIFT_TOOLSETS: options.toolsets } : {}),
		PATH: options.pathDirs.join(':'),
	};
	if (client === 'claude-code') {
		const flags = Object.entries(env).map(([k, v]) => `-e ${k}=${v === '$PWD' ? '"$PWD"' : shellQuote(v)}`);
		return ['claude mcp add spec-drift', ...flags, `-- ${shellQuote(launcher)}`].join(' \\\n  ');
	}
	return JSON.stringify({ mcpServers: { 'spec-drift': { command: launcher, env } } }, null, 2);
};
