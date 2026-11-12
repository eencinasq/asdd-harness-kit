import * as z from 'zod';

import { FindingOutput, NoDataOutput } from './audit.output.ts';
import { GROUP_BY } from './audit-query.ts';

/** Inputs and outputs of the read-only insight tools: audit_query (REQ-004) and learning_report (REQ-002). */

export const AuditQueryInputSchema = z.object({
	from: z
		.enum(['auto', 'diff', 'report', 'drift'])
		.default('auto')
		.describe(
			'Findings to query: "diff" the latest audit_diff of this server process, "report" the latest .harness/audits report, "drift" a fresh drift check over all slices; "auto" the first that exists in that order',
		),
	slice_id: z.string().optional(),
	severity: z.string().optional().describe('fail | warn | advisory'),
	check: z.string().optional().describe('e.g. DRIFT-01, UNOWNED, SPEC-VERDICT, SEMGREP'),
	source: z.string().optional().describe('computational | inferential'),
	path_prefix: z.string().optional().describe('Keep findings with a path equal to or under this prefix'),
	group_by: z
		.enum(GROUP_BY)
		.default('none')
		.describe('Count matching findings per slice, severity, check, top-level path, or not at all'),
	limit: z
		.number()
		.int()
		.min(0)
		.max(200)
		.default(20)
		.describe('Matching findings to return (counts cover all of them)'),
});

export const AuditQueryOutput = z.looseObject({
	from: z.string().describe('The source actually used'),
	total: z.number(),
	matched: z.number(),
	group_by: z.enum(GROUP_BY),
	groups: z.array(z.looseObject({ key: z.string(), count: z.number(), by_severity: z.record(z.string(), z.number()) })),
	findings: z.array(FindingOutput),
	truncated: z.boolean().describe('True when more findings matched than `limit`'),
	no_data: NoDataOutput.optional(),
});

export const LearningReportInputSchema = z.object({
	limit: z.number().int().min(1).max(200).default(50).describe('Patterns to return (most occurrences first)'),
});

export const LearningReportOutput = z.looseObject({
	summary: z.looseObject({
		patterns: z.number(),
		open: z.number(),
		in_flight: z.number(),
		verified: z.number(),
		proposals: z.number(),
		unsigned_failures: z.number(),
	}),
	patterns: z.array(
		z.looseObject({
			id: z.string(),
			signature: z.string(),
			kind: z.string().describe('escape | noise'),
			occurrences: z.number(),
			threshold: z.number(),
			status: z.string().describe('watching | open | proposed | accepted | applied | verified'),
			reopened: z.boolean(),
			slices: z.array(z.string()),
			last_seen: z.string().nullable(),
			proposals: z.array(z.looseObject({ id: z.string().optional(), status: z.string() })),
			next: z.string().nullable().describe('The command or step a human runs next; null when nothing is due'),
		}),
	),
	proposals: z.array(
		z.looseObject({
			id: z.string().nullable(),
			file: z.string(),
			pattern: z.string().nullable(),
			status: z.string().nullable(),
			missing: z.array(z.string()).describe('What the proposal still lacks (the QG-LEARN-03/05 checks of asdd check)'),
			next: z.string().nullable(),
		}),
	),
	commands_note: z.string(),
	no_data: NoDataOutput.optional(),
});

export type AuditQueryInput = z.infer<typeof AuditQueryInputSchema>;
export type LearningReportInput = z.infer<typeof LearningReportInputSchema>;
