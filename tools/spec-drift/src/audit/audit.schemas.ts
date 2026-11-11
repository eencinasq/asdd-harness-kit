import * as z from 'zod';

import { CI_PROVIDERS } from './ci-templates.ts';

/**
 * The view pages through the tool that produced the result: hosts such as Cursor only let an MCP App call tools
 * from their cached tool list, which can predate newly added tools.
 */
const pageArgs = {
	page_token: z
		.string()
		.optional()
		.describe(
			'page.token from a result cut to fit the MCP App size budget; returns the next findings instead of running the check',
		),
	offset: z
		.number()
		.int()
		.min(0)
		.optional()
		.describe('With page_token: index of the first finding to return (page.count of the previous page)'),
};

export const AuditDiffInputSchema = z.object({
	base_branch: z.string().optional().describe('Base ref (default: Drift base branch binding, origin/HEAD, main)'),
	target_branch: z.string().optional().describe('Target ref (default: HEAD plus working tree)'),
	mode: z.enum(['author', 'review']).default('author'),
	pr_body: z.string().optional().describe('PR description, for the "Slice: <id>" link (review mode)'),
	...pageArgs,
});

export const VerifyArchitectureInputSchema = z.object({
	paths: z.array(z.string()).optional().describe('Restrict findings to these paths'),
	include_text: z
		.boolean()
		.optional()
		.describe('Include source texts and generated Semgrep YAML (default: false; the dashboard loads them with source)'),
	source: z
		.string()
		.optional()
		.describe(
			'Skip the checks and return one source text by id (for example domain-layer, tech), "semgrep" for the selected or generated rules, or "list"',
		),
	...pageArgs,
});

export const VerifySpecComplianceInputSchema = z.object({
	slice_id: z.string().trim().min(1, 'slice_id must be a non-empty string'),
	adapter: z.string().optional().describe('Run only this adapter (default: all)'),
});

export const GenerateCiGateInputSchema = z.object({
	provider: z.string().describe(`CI provider: ${CI_PROVIDERS.join(' or ')}`),
});

export const AuditReportInputSchema = z.object({
	since: z.string().optional().describe('ISO date; keep findings seen since then'),
	severity: z.enum(['fail', 'warn', 'advisory']).optional(),
	...pageArgs,
});

export const AuditFindingInputSchema = z.object({
	id: z.string().trim().min(1, 'id must be a non-empty string'),
});

export type AuditDiffInput = z.infer<typeof AuditDiffInputSchema>;
export type VerifyArchitectureInput = z.infer<typeof VerifyArchitectureInputSchema>;
export type VerifySpecComplianceInput = z.infer<typeof VerifySpecComplianceInputSchema>;
export type GenerateCiGateInput = z.infer<typeof GenerateCiGateInputSchema>;
export type AuditReportInput = z.infer<typeof AuditReportInputSchema>;
export type AuditFindingInput = z.infer<typeof AuditFindingInputSchema>;
