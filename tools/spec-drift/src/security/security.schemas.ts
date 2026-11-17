import path from 'node:path';

import * as z from 'zod';

const RunId = z.string().regex(/^run-\d+$/, 'a run id from security_audit_start, e.g. run-1');

const RepoRelativePath = z
	.string()
	.min(1)
	.refine((p) => !p.startsWith('-'), 'must not start with "-"')
	.refine((p) => !path.isAbsolute(p), 'must be relative to the repo root')
	.refine((p) => !path.normalize(p).split(path.sep).includes('..'), 'must not leave the repo root');

export const SecurityStartSchema = z.object({
	paths: z
		.array(RepoRelativePath)
		.max(50)
		.optional()
		.describe('Optional repo-relative folders or files to focus the reconnaissance on (default: the whole repository)'),
});
export type SecurityStartInput = z.infer<typeof SecurityStartSchema>;

export const SecurityChecklistSchema = z.object({
	id: z.string().min(1).max(64).describe('Checklist id from the coverage ledger, e.g. core or web-protocol-and-auth'),
	page: z.number().int().min(1).default(1).describe('1-based page (each page is at most 6000 characters)'),
});
export type SecurityChecklistInput = z.infer<typeof SecurityChecklistSchema>;

export const SecuritySubmitSchema = z.object({
	runId: RunId,
	findings: z
		.array(z.unknown())
		.max(200)
		.describe(
			"Findings in the methodology's report-schema.json format (verdict confirmed | needs_validation | rejected, fingerprint, title, description, trace, evidence, …). Validated as a whole: one invalid finding rejects the submission.",
		),
	checklists_reviewed: z
		.array(z.string().min(1).max(64))
		.max(30)
		.optional()
		.describe('Ledger checklist ids this submission completes'),
});
export type SecuritySubmitInput = z.infer<typeof SecuritySubmitSchema>;

export const SecurityStatusSchema = z.object({
	runId: RunId.optional().describe('Run to show (default: the latest run of this repository)'),
	page: z.number().int().min(1).default(1).describe('1-based page of findings (10 per page)'),
});
export type SecurityStatusInput = z.infer<typeof SecurityStatusSchema>;
