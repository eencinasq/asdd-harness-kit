import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { validateEnv } from './env.schema.ts';

describe('validateEnv', () => {
	test('defaults to loopback without an API key', () => {
		const env = validateEnv({});
		assert.equal(env.HOST, '127.0.0.1');
		assert.equal(env.MCP_API_KEY, undefined);
	});

	test('refuses a non-loopback HOST without MCP_API_KEY', () => {
		assert.throws(() => validateEnv({ HOST: '0.0.0.0' }), /MCP_API_KEY/);
		assert.equal(validateEnv({ HOST: '0.0.0.0', MCP_API_KEY: 'a-long-enough-secret' }).HOST, '0.0.0.0');
	});

	test('rejects short API keys and parses origin lists', () => {
		assert.throws(() => validateEnv({ MCP_API_KEY: 'short' }), /at least 16/);
		assert.deepEqual(validateEnv({ MCP_ALLOWED_ORIGINS: 'a.example, b.example' }).MCP_ALLOWED_ORIGINS, [
			'a.example',
			'b.example',
		]);
	});
});

// What Claude Desktop passes when it does not expand its own variable: a literal, not a template.
// biome-ignore lint/suspicious/noTemplateCurlyInString: the unexpanded placeholder is the input under test
const UNEXPANDED = '${workspaceFolder}';

describe('validateEnv — repo roots', () => {
	test('treats an unexpanded client placeholder as unset, so the root is resolved at run time', () => {
		const env = validateEnv({
			ANALYSIS_REPO_ROOT: UNEXPANDED,
			HARNESS_ROOT: UNEXPANDED,
			PR_REVIEW_REPO: UNEXPANDED,
		});
		assert.equal(env.ANALYSIS_REPO_ROOT, undefined);
		assert.equal(env.HARNESS_ROOT, undefined);
		assert.equal(env.PR_REVIEW_REPO, undefined);
	});

	test('leaves the roots unset when nothing is configured', () => {
		const env = validateEnv({});
		assert.equal(env.ANALYSIS_REPO_ROOT, undefined);
		assert.equal(env.HARNESS_ROOT, undefined);
	});

	test('keeps an explicit root, resolved to an absolute path', () => {
		assert.equal(validateEnv({ ANALYSIS_REPO_ROOT: '/repos/app' }).ANALYSIS_REPO_ROOT, '/repos/app');
		assert.equal(validateEnv({ SEMGREP_REPO_ROOT: '/repos/legacy' }).ANALYSIS_REPO_ROOT, '/repos/legacy');
	});
});
