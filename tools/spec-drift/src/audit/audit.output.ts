import * as z from 'zod';

/**
 * Output schemas of the audit tools (spec-drift-apps REQ-001). The SDK validates every non-error `structuredContent`
 * against them, so they are loose objects over the known fields: payloads come in variants (a full result, a page of a
 * result cut to the MCP App budget, compacted fields), and an unknown extra field must never turn a result into an
 * error. `{ error }` payloads are tool errors (`isError: true`) and are not validated.
 */

const counts = z.record(z.string(), z.number());

/** Nothing to show (kit not installed, no report, no slice…): not an error (spec-drift-empty REQ-004). */
export const NoDataOutput = z
	.looseObject({ reason: z.string(), next: z.string() })
	.describe('Set when there is no data to show: why, and the next step');

export const FindingOutput = z.looseObject({
	id: z
		.string()
		.optional()
		.describe('AUD-<8 hex>; absent on lines of the bound Gate command output, which have no stable identity'),
	check: z.string(),
	severity: z.string().describe('fail | warn | advisory (audit), or the adapter / engine severity'),
	message: z.string(),
	paths: z.array(z.string()).optional(),
	paths_total: z.number().optional().describe('Set when paths were trimmed to fit the MCP App budget'),
	line: z.number().optional(),
	slice_id: z.string().nullable().optional(),
	node: z.string().nullable().optional().describe('Knowledge-graph node, e.g. req:<slice>:REQ-004'),
	source: z.string().optional().describe('computational | inferential'),
	rule: z.string().optional(),
	fix: z.string().optional(),
	remediation: z.string().optional(),
	verdict: z.string().optional(),
	recurring: z.boolean().optional(),
	occurrences: z.number().optional(),
	first_seen: z.string().optional(),
	last_seen: z.string().optional(),
});

/** Present on a result cut to the MCP App size budget: call the same tool with page_token and offset for the rest. */
const PageOutput = z.looseObject({
	tool: z.string(),
	token: z.string(),
	offset: z.number(),
	count: z.number(),
	total: z.number(),
	by_severity: counts,
	by_source: counts,
	hint: z.string(),
});

/** Fields every finding-returning audit tool may carry: the findings, the page of a cut result, or a later page. */
const findingsResult = {
	findings: z.array(FindingOutput).optional(),
	page: PageOutput.optional().describe('Counts and token when the result was cut to the size budget'),
	token: z.string().optional().describe('On a page_token call: the token paged'),
	offset: z.number().optional(),
	total: z.number().optional(),
	next: z.number().nullable().optional().describe('On a page_token call: offset of the next page, null at the end'),
	no_data: NoDataOutput.optional(),
};

const LearningOutput = z.looseObject({
	open: z.number(),
	relevant: z.number(),
	in_flight: z.number(),
	patterns: z.array(
		z.looseObject({
			id: z.string(),
			signature: z.string(),
			kind: z.string(),
			occurrences: z.number(),
			reopened: z.boolean().optional(),
			relevant: z.boolean(),
		}),
	),
});

const SummaryOutput = z.looseObject({
	files_analyzed: z.number().optional(),
	spec_compliance: z.number().nullable().optional().describe('Share of MUST requirements a test names (0..1)'),
	drift_level: z.string().optional(),
	linked_slices: z.array(z.string()).optional(),
	must_requirements: z.number().optional(),
});

export const AuditDiffOutput = z.looseObject({
	...findingsResult,
	mode: z.enum(['author', 'review']).optional(),
	suppressed: z.array(z.looseObject({ id: z.string(), check: z.string() })).optional(),
	architecture: z.looseObject({ status: z.string().optional(), generate_prompt: z.string().optional() }).optional(),
	summary: SummaryOutput.optional(),
	notes: z.array(z.string()).optional(),
	learning: LearningOutput.optional().describe('Open learning patterns this change touches (advisory)'),
	generated_at: z.string().optional(),
});

const SourceOutput = z.looseObject({ id: z.string(), path: z.string().optional(), filled: z.boolean().optional() });

export const VerifyArchitectureOutput = z.looseObject({
	...findingsResult,
	status: z.string().optional().describe('pass | fail | unconfigured | error (never a pass when unconfigured)'),
	command: z.string().optional(),
	binding: z.string().optional(),
	exit_code: z.number().optional(),
	sources: z.array(SourceOutput).optional(),
	semgrep: z.looseObject({ status: z.string().optional() }).optional(),
	message: z.string().optional(),
	output: z.string().optional(),
	output_truncated: z.boolean().optional(),
	id: z.string().optional().describe('With source: the source returned'),
	path: z.string().optional(),
	filled: z.boolean().optional(),
	text: z.string().nullable().optional(),
	generate_prompt: z
		.string()
		.optional()
		.describe('With no Semgrep rules: the prompt that asks the host agent to write them from the codebase'),
});

export const VerifySpecComplianceOutput = z.looseObject({
	slice_id: z.string(),
	adapters: z.record(
		z.string(),
		z.looseObject({ status: z.string(), findings: z.array(FindingOutput).optional(), message: z.string().optional() }),
	),
	summary: SummaryOutput,
	no_data: NoDataOutput.optional(),
});

export const GenerateCiGateOutput = z.looseObject({
	provider: z.string(),
	suggested_path: z.string(),
	content: z.string(),
	note: z.string(),
});

export const AuditReportOutput = z.looseObject({
	...findingsResult,
	path: z.string().optional().describe('The report file under .harness/audits/'),
	generated_at: z.string().optional(),
	hotspots: z.array(z.looseObject({})).optional(),
	recurring: z.union([z.array(z.string()), z.number()]).optional(),
	reports: z.array(z.unknown()).optional(),
});

export const AuditFindingOutput = z.looseObject({
	finding: FindingOutput,
	trace: z
		.looseObject({
			start: z.string(),
			nodes: z.array(z.looseObject({ id: z.string() })),
			edges: z.array(z.looseObject({ from: z.string(), rel: z.string(), to: z.string() })),
		})
		.nullable(),
});
