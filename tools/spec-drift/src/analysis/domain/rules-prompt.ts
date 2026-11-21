import type { EngineInfo } from '../analysis.types.ts';

/**
 * The "generate rules" agent prompt (spec-drift-empty REQ-002): what the host agent is asked to do when a repo has no
 * rules for the analyzer. The server only returns this text (tool result, MCP prompt, dashboard message); the agent in
 * the host writes the rule files, at the user's request. Engine-neutral: the steps come from the analyzer.
 */
export const buildRulesPrompt = (options: {
	readonly repoRoot: string;
	readonly project: string;
	readonly engine: EngineInfo;
	/** Engine-specific authoring steps (CodeAnalyzer.authoringGuide). */
	readonly guide: readonly string[];
	/** True when the repo has the asdd harness (`.harness/`): its steering and ADRs are the source of the rules. */
	readonly harness?: boolean;
	/** What to do once the rules exist (e.g. which tool re-runs the scan). */
	readonly done: string;
	/** Rule set folder under the rules dir (architecture, standards, security); the whole dir when absent. */
	readonly set?: string;
	/** Ids of the rules the repo already has: they keep running, the agent only adds what they miss. */
	readonly existing?: readonly string[];
}): string => {
	const { engine, guide } = options;
	const dir = options.set ? `${engine.rulesDir}/${options.set}` : engine.rulesDir;
	const existing = options.existing ?? [];
	const security = options.set === 'security';
	const steps = [
		'Explore the codebase: README, AGENTS.md / CLAUDE.md, ADRs, package layout, dependency boundaries, lint rules, and existing conventions.',
		...(options.harness
			? [
					'This repo uses the asdd harness (`.harness/`): take the layers and boundaries from `.harness/steering/domain-layer.project.md`, `structure.md`, and `tech.md`, and the decisions from the ADRs in `.harness/specs/*/design.md`; put those ADR ids in the rules’ metadata.',
				]
			: []),
		...guide,
		...(security
			? [
					'Map the security surface: auth/session entrypoints, trust boundaries, parsers of untrusted input, shell/SQL/template sinks, secret handling; cite the boundary each rule protects.',
				]
			: []),
		...(existing.length
			? [
					`Keep the existing rules: they still run. Add only rules for gaps they do not cover; never duplicate an existing id or overwrite an existing file.`,
				]
			: []),
		`Write the rules under \`${dir}/\`, each rule file with its test file beside it.`,
		'Before writing the files, list the rules you plan (id, what it forbids, why, which ADR or convention) so the user can confirm.',
		'Keep rules precise; avoid noisy style nits unless the project already enforces them.',
		'Do **not** invent secrets or commit credentials.',
	];
	return [
		`# Generate ${dir} ${security ? 'security' : (options.set ?? 'architecture')} rules for ${options.project}`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		existing.length
			? `\`${dir}/\` already has ${existing.length} rule(s): ${existing.map((id) => `\`${id}\``).join(', ')}.`
			: `There is no usable \`${dir}/\` config in this project yet.`,
		'',
		'## Goal',
		security
			? `${existing.length ? 'Extend' : 'Create'} a project-specific ${engine.name} **security** rule set under \`${dir}/\` from security best practices for this codebase’s area (injection, authz, unsafe sinks, secret exposure), not a generic dump.`
			: `${existing.length ? 'Extend' : 'Create'} a project-specific ${engine.name} rule set under \`${dir}/\` that encodes **this** codebase’s ${options.set === 'standards' ? 'coding standards' : options.set === 'architecture' ? 'architecture' : 'architecture and coding standards'} (not a generic template copy-paste).`,
		'',
		'## How',
		...steps.map((step, i) => `${i + 1}. ${step}`),
		'',
		'## Done',
		options.done,
	].join('\n');
};
