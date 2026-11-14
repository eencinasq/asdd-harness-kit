import * as z from 'zod';

/**
 * Output schemas of the analysis tools (spec-drift-apps REQ-001): the ScanSummary the dashboard renders and the rule
 * packs list. Loose objects over the known fields, so an added field never turns a result into an error.
 */

const counts = z.record(z.string(), z.number());

const TrendPointOutput = z.looseObject({
	at: z.string(),
	label: z.string(),
	total: z.number(),
	new: z.number().nullable(),
});

/** drift_trend (spec-drift-adoption REQ-002). */
export const TrendOutput = z.looseObject({
	source: z.enum(['analysis', 'audit']),
	by: z.string(),
	where: z.string().describe('The folder the points were read from'),
	points: z.array(TrendPointOutput).describe('Oldest first'),
	measure: z.enum(['new', 'total']).describe('new when every point had a baseline'),
	direction: z.enum(['better', 'worse', 'flat', 'unknown']).describe('first vs last point; within 5% is flat'),
	change: z.number().nullable().describe('(last - first) / first'),
	changes: z.array(z.looseObject({ key: z.string(), first: z.number(), last: z.number(), delta: z.number() })),
});

/** The engine's rule tests (rule-coverage REQ-004): passed / failed per tested rule; absent = no test. */
export const RuleTestsOutput = z.looseObject({
	status: z
		.enum(['ok', 'unavailable', 'failed'])
		.describe('unavailable: the engine could not run tests (never a pass)'),
	byRule: z.record(z.string(), z.enum(['passed', 'failed'])),
	invalidFiles: z.array(z.string()),
	message: z.string().optional(),
});

/** validate_rules (rule-coverage REQ-004): per-rule readiness. */
export const ValidateRulesOutput = z.looseObject({
	rules: z.array(
		z.looseObject({
			id: z.string(),
			pack: z.string(),
			severity: z.string(),
			adr: z.string().nullable(),
			test: z.enum(['passed', 'failed', 'missing', 'unavailable']),
			hits: z.number(),
			files: z.number(),
			flags: z.array(z.string()).describe('no-test | test-failed | tests-unavailable | noisy | scan-failed'),
			ready: z.boolean(),
		}),
	),
	ready: z.number(),
	notReady: z.number(),
	tests: z.looseObject({ status: z.string(), message: z.string().optional() }),
	invalidFiles: z.array(z.string()),
	thresholds: z.looseObject({ hits: z.number(), files: z.number() }).describe('noisy at >= hits or >= files'),
	scan: z.looseObject({ status: z.string(), stderrTail: z.string() }),
});

/** ADR coverage (rule-coverage REQ-001, REQ-002): the `adr_coverage` result and the scan summary's `adrCoverage`. */
export const AdrCoverageOutput = z.looseObject({
	dir: z.string().nullable().describe('The ADR folder, repository-relative; null when none was found'),
	source: z.enum(['binding', 'adr-dir', 'default', 'none']),
	adrs: z.array(
		z.looseObject({
			id: z.string().nullable(),
			title: z.string(),
			status: z.string().nullable(),
			path: z.string(),
			exempt: z.boolean().describe('Enforcement: manual — not checkable by code rules'),
			active: z.boolean(),
			rules: z.array(z.string()),
		}),
	),
	total: z.number(),
	enforceable: z.number().describe('Active and not exempt'),
	covered: z.number(),
	coverage: z.number().nullable().describe('covered / enforceable'),
	uncovered: z.array(
		z.looseObject({
			id: z.string(),
			title: z.string(),
			path: z.string(),
			prompt: z.string().describe('Asks the host agent to encode this ADR as a rule with a test'),
		}),
	),
	dangling: z.array(z.looseObject({ ruleId: z.string(), adr: z.string(), reason: z.string() })),
	rulesWithoutAdr: z.number(),
	unidentified: z.array(z.string()),
});

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
			baseline: z.enum(['new', 'existing']).optional().describe('Against .semgrep/baseline.json, when present'),
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
	adrCoverage: AdrCoverageOutput.nullable().optional(),
	ruleTests: RuleTestsOutput.optional(),
	baseline: z
		.looseObject({
			file: z.string(),
			created_at: z.string(),
			entries: z.number(),
			new: z.number(),
			existing: z.number(),
			resolved: z.number().nullable().describe('null when the scan was limited by paths, mode, packs or severity'),
		})
		.nullable()
		.optional()
		.describe('New / existing / resolved against the committed baseline; null when the repo has none'),
	trend: z
		.looseObject({
			points: z.array(TrendPointOutput),
			measure: z.enum(['new', 'total']),
			direction: z.enum(['better', 'worse', 'flat', 'unknown']),
			change: z.number().nullable(),
		})
		.nullable()
		.optional(),
});

export const RulePacksOutput = z.looseObject({
	packs: z.array(z.looseObject({ id: z.string(), kind: z.enum(['set', 'file']), path: z.string(), set: z.string() })),
});

/** A background analysis job (spec-drift-depth REQ-004). */
export const AnalysisJobView = z.looseObject({
	id: z.string(),
	tool: z.string().describe('The analyze tool whose result the job returns'),
	status: z.enum(['running', 'done', 'failed']),
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	progress: z.string().nullable().describe('Last progress message of the scan'),
	error: z.string().optional(),
});

export const AnalysisStartOutput = z.looseObject({ job: AnalysisJobView });

export const AnalysisJobOutput = z.looseObject({
	job: AnalysisJobView.optional(),
	result: z.looseObject({}).optional().describe('When done: the scan summary the analyze tool returns'),
	jobs: z.array(AnalysisJobView).optional().describe('Without an id: the jobs of this server process'),
});

const OriginCommitOutput = z.looseObject({
	sha: z.string(),
	author: z.string(),
	date: z.string(),
	subject: z.string(),
	pr: z.number().nullable().describe('From a squash (#N) or Merge pull request #N subject'),
});

/** drift_origin (spec-drift-demand REQ-001). */
export const DriftOriginOutput = z.looseObject({
	path: z.string(),
	line: z.number(),
	text: z.string().describe('The line, trimmed'),
	committed: z.boolean().describe('False when the line is a local, uncommitted edit'),
	lastChange: OriginCommitOutput.nullable().describe('git blame: the commit that last changed the line'),
	introduced: OriginCommitOutput.nullable().describe("git log -S: the oldest commit that added the line's text"),
	summary: z.string(),
});

/** repos_overview (spec-drift-demand REQ-006). */
export const ReposOverviewOutput = z.looseObject({
	configured: z.boolean().describe('False when SPEC_DRIFT_REPOS is unset (only the analyzed repo is shown)'),
	repos: z.array(
		z.looseObject({
			name: z.string(),
			root: z.string(),
			analysis: z
				.looseObject({
					recordedAt: z.string(),
					total: z.number(),
					new: z.number().nullable(),
					snapshots: z.number(),
					direction: z.string(),
					change: z.number().nullable(),
				})
				.nullable(),
			audit: z
				.looseObject({ driftLevel: z.string().nullable(), specCompliance: z.number().nullable(), findings: z.number() })
				.nullable(),
			noData: z.boolean(),
			error: z.string().optional(),
		}),
	),
});
