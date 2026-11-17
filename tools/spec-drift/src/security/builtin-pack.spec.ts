import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import type { RulePack } from '../analysis/analysis.types.ts';
import { BUILTIN_SECURITY_PACK_ID, builtinSecurityPack, securityPacks } from './builtin-pack.ts';

const repoSet: RulePack = {
	id: 'security',
	kind: 'set',
	path: '/r/.semgrep/security',
	set: 'security',
	files: ['/r/.semgrep/security/a.yml'],
};
const other: RulePack = { id: 'standards', kind: 'set', path: '/r/.semgrep/standards', set: 'standards', files: [] };

test('security-review REQ-006: the built-in pack covers the bundled rule files only (not their test fixtures)', () => {
	const pack = builtinSecurityPack();
	assert.equal(pack.id, BUILTIN_SECURITY_PACK_ID);
	assert.equal(pack.kind, 'set');
	assert.ok(existsSync(pack.path));
	assert.deepEqual(
		pack.files.map((f) => f.split('/').pop()),
		['javascript.yml', 'python.yml'],
	);
});

test('security-review REQ-006: the repo security set wins; Semgrep falls back to the built-in pack; CodeQL gets none', () => {
	assert.deepEqual(securityPacks([repoSet, other], 'semgrep'), [repoSet]);
	assert.equal(securityPacks([other], 'semgrep')?.[0]?.id, BUILTIN_SECURITY_PACK_ID);
	assert.equal(securityPacks([other], 'codeql'), null);
});
