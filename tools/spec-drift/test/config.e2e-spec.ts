/**
 * spec-drift-adoption REQ-004 end to end: the configuration `spec-drift config` prints starts the server as pasted —
 * from another working directory, no path edited.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const ROOT = path.resolve(import.meta.dirname, '..');

test('spec-drift-adoption REQ-004: the printed Claude Desktop config starts the server as is', async () => {
	const project = mkdtempSync(path.join(os.tmpdir(), 'sd-config-project-'));
	try {
		const printed = execFileSync(
			process.execPath,
			[
				'--import',
				'tsx',
				'src/main.ts',
				'config',
				'--client',
				'claude-desktop',
				'--project',
				project,
				'--toolsets',
				'analysis',
			],
			{ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		);
		const server = JSON.parse(printed).mcpServers['spec-drift'] as { command: string; env: Record<string, string> };
		assert.ok(path.isAbsolute(server.command));
		assert.equal(server.env['ANALYSIS_REPO_ROOT'], project);
		const client = new Client({ name: 'e2e', version: '0' });
		// Like a GUI client: its own working directory, only the env the config gives.
		await client.connect(
			new StdioClientTransport({ command: server.command, cwd: os.homedir(), env: server.env, stderr: 'ignore' }),
		);
		try {
			const tools = (await client.listTools()).tools.map((t) => t.name);
			assert.ok(tools.includes('analyze_spec_drift'), tools.join(', '));
			assert.ok(!tools.some((t) => t.startsWith('pr_review_')), 'the toolset from the config applies');
		} finally {
			await client.close();
		}
	} finally {
		rmSync(project, { recursive: true, force: true });
	}
});
