import * as z from 'zod';

/**
 * Output schemas of the analysis tools (spec-drift-apps REQ-001): the ScanSummary the dashboard renders and the rule
 * packs list. Loose objects over the known fields, so an added field never turns a result into an error.
 */

const counts = z.record(z.string(), z.number());

const DriftItemOutput = z.looseObject({
	ruleId: z.string(),
	severity: z.string(),
	category: z.string(),
	adr: z.string().nullable(),
	message: z.string(),
	pack: z.string(),
	violationCount: z.number(),
	status: z.enum(['clean', 'drifting', 'unscanned']),
	samplePaths: z.array(z.string()),
});

export const ScanSummaryOutput = z.looseObject({
	engine: z.looseObject({ id: z.string(), name: z.string(), rulesDir: z.string() }),
	scannedAt: z.string(),
	repoRoot: z.string(),
	mode: z.string().describe('architecture | standards | all | spec-drift'),
	packs: z.array(z.string()),
	status: z
		.enum(['ok', 'failed', 'no-rules'])
		.describe(
			'failed: the engine produced no result (see stderrTail); no-rules: nothing was analyzed, not a pass (see message, generatePrompt)',
		),
	message: z.string().optional(),
	generatePrompt: z
		.string()
		.optional()
		.describe('With no-rules: the prompt that asks the host agent to write rules from this codebase'),
	exitCode: z.number(),
	findingCount: z.number(),
	bySeverity: counts,
	byPack: counts,
	byRule: counts,
	findings: z.array(
		z.looseObject({
			checkId: z.string(),
			path: z.string(),
			startLine: z.number(),
			endLine: z.number(),
			severity: z.string(),
			message: z.string(),
			category: z.string(),
			adr: z.string().nullable(),
			pack: z.string(),
		}),
	),
	rules: z.array(z.looseObject({ id: z.string(), severity: z.string(), message: z.string() })),
	drift: z.looseObject({
		totalRules: z.number(),
		cleanRules: z.number(),
		driftingRules: z.number(),
		items: z.array(DriftItemOutput),
		topDrifts: z.array(DriftItemOutput),
	}),
	packSummaries: z.array(
		z.looseObject({
			id: z.string(),
			title: z.string(),
			status: z.string(),
			findingCount: z.number(),
			resultLabel: z.string(),
		}),
	),
	stderrTail: z.string(),
});

export const RulePacksOutput = z.looseObject({
	packs: z.array(z.looseObject({ id: z.string(), kind: z.enum(['set', 'file']), path: z.string(), set: z.string() })),
});
