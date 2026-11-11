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
