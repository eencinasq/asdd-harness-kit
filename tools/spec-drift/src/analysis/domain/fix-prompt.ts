import type { Finding } from '../analysis.types.ts';

/**
 * Guided fix (spec-drift-demand REQ-002, ADR-002): the prompt that asks the host agent to fix every violation of one rule
 * and rescan. Shared by the `fix-rule-violations` MCP prompt and the dashboard's per-rule action. Pure; the agent edits,
 * the server writes nothing.
 */

export const FIX_MAX = 20;

export type FixRule = {
	readonly id: string;
	readonly severity: string;
	readonly message: string;
	readonly adr: string | null;
};

export const buildFixPrompt = (options: {
	readonly rule: FixRule;
	readonly findings: readonly Pick<Finding, 'path' | 'startLine' | 'message' | 'checkId'>[];
	readonly max?: number;
}): string => {
	const max = options.max ?? FIX_MAX;
	const { rule } = options;
	const own = options.findings.filter((f) => f.checkId === rule.id);
	if (!own.length) return `Rule ${rule.id} has no violations in the latest scan: nothing to fix.`;
	const shown = own.slice(0, max);
	const paths = [...new Set(shown.map((f) => f.path))];
	return [
		`Fix the ${own.length} violation${own.length === 1 ? '' : 's'} of rule \`${rule.id}\` (${rule.severity}${rule.adr ? `, ${rule.adr}` : ''}).`,
		`The rule says: ${rule.message}`,
		'',
		`Violations${own.length > shown.length ? ` (the first ${shown.length} of ${own.length})` : ''}:`,
		...shown.map((f) => `- ${f.path}:${f.startLine} — ${f.message}`),
		'',
		'Steps:',
		'1. Read each location and its neighbouring code. Show the user the change you plan per file and wait for their confirmation before editing anything.',
		`2. Fix the cause in the code. Do not silence the rule (no \`nosemgrep\` comments, no edits to the rule or its paths)${rule.adr ? `; follow ${rule.adr}` : ''}. If a violation is a justified exception, say so and leave it for the user to decide.`,
		'3. Keep behaviour: run the tests that cover the changed files.',
		`4. Rescan only what you changed: call \`analyze_spec_drift\` with \`{ "paths": ${JSON.stringify(paths)} }\` and report the violations of \`${rule.id}\` that remain.`,
		...(own.length > shown.length
			? [`5. Then ask the user whether to continue with the remaining ${own.length - shown.length}.`]
			: []),
		'',
		'You edit the files in this workspace; the spec-drift server only reads.',
	].join('\n');
};
