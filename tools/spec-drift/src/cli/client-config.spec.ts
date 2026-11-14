import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { CURSOR_WORKSPACE, clientConfig, toolDirs } from './client-config.ts';

const launcher = '/home/ana/kit/tools/spec-drift/bin/mcp-stdio';
const pathDirs = ['/opt/node/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];

test('spec-drift-adoption REQ-004: Cursor and Claude Desktop get JSON with resolved paths and the project roots', () => {
	const cursor = JSON.parse(clientConfig({ client: 'cursor', launcher, pathDirs }));
	assert.equal(cursor.mcpServers['spec-drift'].command, launcher);
	assert.equal(cursor.mcpServers['spec-drift'].env.ANALYSIS_REPO_ROOT, CURSOR_WORKSPACE, 'follows the open folder');
	assert.equal(CURSOR_WORKSPACE, '$' + '{workspaceFolder}');
	assert.equal(cursor.mcpServers['spec-drift'].env.PATH, '/opt/node/bin:/opt/homebrew/bin:/usr/bin:/bin');
	const desktop = JSON.parse(
		clientConfig({ client: 'claude-desktop', launcher, project: '/work/shop', pathDirs, toolsets: 'review' }),
	);
	assert.deepEqual(desktop.mcpServers['spec-drift'].env, {
		PR_REVIEW_REPO: '/work/shop',
		ANALYSIS_REPO_ROOT: '/work/shop',
		HARNESS_ROOT: '/work/shop',
		SPEC_DRIFT_TOOLSETS: 'review',
		PATH: '/opt/node/bin:/opt/homebrew/bin:/usr/bin:/bin',
	});
	assert.equal(
		JSON.parse(clientConfig({ client: 'claude-desktop', launcher, pathDirs })).mcpServers['spec-drift'].env
			.HARNESS_ROOT,
		undefined,
		'no project: the agent passes repoPath',
	);
});

test('spec-drift-adoption REQ-004: Claude Code gets a ready claude mcp add command', () => {
	const cmd = clientConfig({ client: 'claude-code', launcher: '/home/ana/my kit/bin/mcp-stdio', pathDirs });
	assert.match(cmd, /^claude mcp add spec-drift/);
	assert.match(cmd, /-e ANALYSIS_REPO_ROOT="\$PWD"/);
	assert.match(cmd, /-- '\/home\/ana\/my kit\/bin\/mcp-stdio'$/);
});

test('spec-drift-adoption REQ-004: tool directories come from the PATH, node first, once each', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'));
	for (const t of ['semgrep', 'gh']) {
		fs.writeFileSync(path.join(dir, t), '#!/bin/sh\n');
		fs.chmodSync(path.join(dir, t), 0o755);
	}
	assert.deepEqual(toolDirs(`${dir}:/nonexistent`, '/opt/node/bin/node'), ['/opt/node/bin', dir, '/usr/bin', '/bin']);
});
