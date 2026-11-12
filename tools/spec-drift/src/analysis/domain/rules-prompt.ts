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
}): string => {
	const { engine, guide } = options;
	const steps = [
		'Explore the codebase: README, AGENTS.md / CLAUDE.md, ADRs, package layout, dependency boundaries, lint rules, and existing conventions.',
		...(options.harness
			? [
					'This repo uses the asdd harness (`.harness/`): take the layers and boundaries from `.harness/steering/domain-layer.project.md`, `structure.md`, and `tech.md`, and the decisions from the ADRs in `.harness/specs/*/design.md`; put those ADR ids in the rules’ metadata.',
				]
			: []),
		...guide,
		'Before writing the files, list the rules you plan (id, what it forbids, why, which ADR or convention) so the user can confirm.',
		'Keep rules precise; avoid noisy style nits unless the project already enforces them.',
		'Do **not** invent secrets or commit credentials.',
	];
	return [
		`# Generate ${engine.rulesDir} architecture rules for ${options.project}`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		`There is no usable \`${engine.rulesDir}/\` config in this project yet.`,
		'',
		'## Goal',
		`Create a project-specific ${engine.name} rule set under \`${engine.rulesDir}/\` that encodes **this** codebase’s architecture and coding standards (not a generic template copy-paste).`,
		'',
		'## How',
		...steps.map((step, i) => `${i + 1}. ${step}`),
		'',
		'## Done',
		options.done,
	].join('\n');
};
