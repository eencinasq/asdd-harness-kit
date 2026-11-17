/**
 * Built-in starter security pack (security-review REQ-006, design ADR-003). `analyze_security` runs the repository's
 * `security` rule set; when the repository has none and the engine is Semgrep, it runs the rules bundled here instead.
 * The bundled folder sits next to this module (`semgrep/`), copied to `dist/server/semgrep/` by the build.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RulePack } from '../analysis/analysis.types.ts';

const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'semgrep');

export const BUILTIN_SECURITY_PACK_ID = 'builtin-security';

/** The repository rule set `analyze_security` looks for (`.semgrep/security/`). */
export const SECURITY_SET = 'security';

export const builtinSecurityPack = (): RulePack => ({
	id: BUILTIN_SECURITY_PACK_ID,
	kind: 'set',
	path: BUILTIN_DIR,
	set: BUILTIN_SECURITY_PACK_ID,
	files: readdirSync(BUILTIN_DIR)
		.filter((name) => /\.ya?ml$/i.test(name))
		.sort()
		.map((name) => path.join(BUILTIN_DIR, name)),
});

/** Packs for a security scan: the repo set, else the built-in pack on Semgrep, else none (`no-rules`). */
export const securityPacks = (available: readonly RulePack[], engineId: string): RulePack[] | null => {
	const repoSet = available.find((p) => p.kind === 'set' && p.id === SECURITY_SET);
	if (repoSet) return [repoSet];
	return engineId === 'semgrep' ? [builtinSecurityPack()] : null;
};
