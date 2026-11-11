import path from 'node:path';
import * as z from 'zod';

import { FINDING_CATEGORIES, FINDING_SEVERITIES } from './engine/types.ts';
import { CRITERION_KINDS, CRITERION_STATUSES, TICKET_SOURCES } from './requirements/requirements.types.ts';
import { VERDICTS } from './verification/verification.ts';

export const PrSchema = z.object({
	pr: z.number().int().positive().describe('Pull request number'),
	repoPath: z
		.string()
		.optional()
		.describe('Optional absolute path to the git repo (defaults to PR_REVIEW_REPO or cwd)'),
});

/** The ticket the PR implements. Jira / Linear: read it with your own tools and pass `text` (or `criteria`). */
export const TicketInputSchema = z
	.object({
		source: z.enum(TICKET_SOURCES).describe('Where the ticket lives; `text` for pasted content'),
		ref: z
			.string()
			.max(200)
			.optional()
			.describe(
				'Key or number: MLC-123, ENG-7, #45, owner/repo#45 or an issue URL. GitHub issues are fetched with gh.',
			),
		title: z.string().max(300).optional(),
		url: z.string().max(500).optional(),
		text: z
			.string()
			.max(100_000)
			.optional()
			.describe('Ticket description / body, including its acceptance criteria and definition of done'),
		criteria: z
			.array(
				z.object({
					text: z.string().min(3).max(1000),
					kind: z.enum(CRITERION_KINDS).default('acceptance'),
				}),
			)
			.max(50)
			.optional()
			.describe('Explicit criteria; otherwise they are extracted from `text` (AC / DoD sections, checklists, Gherkin)'),
	})
	.refine((t) => t.text || t.criteria?.length || (t.source === 'github' && t.ref), {
		message: 'pass `text` or `criteria` (GitHub issues can be given by `ref` alone)',
	});

export const StartSchema = PrSchema.extend({
	context: z.string().optional().describe('Optional module/API context hint (e.g. notifications)'),
	ticket: TicketInputSchema.optional().describe(
		'Optional ticket (Jira, Linear, GitHub issue or text): its acceptance criteria and definition of done are verified after the review groups',
	),
});

export const SetTicketSchema = PrSchema.extend({
	ticket: TicketInputSchema,
});

const VerdictSchema = z.object({
	id: z.string().min(1).describe('Criterion id, e.g. AC-1 or DOD-2'),
	status: z.enum(CRITERION_STATUSES.filter((s) => s !== 'pending') as ['met', 'partial', 'unmet', 'unverifiable']),
	evidence: z.array(z.string().max(300)).max(10).optional().describe('path:line locations in the PR'),
	note: z.string().max(500).optional().describe('Why — especially for partial / unmet / unverifiable'),
});

export const SubmitRequirementsSchema = PrSchema.extend({
	results: z.array(VerdictSchema).min(1).max(50).describe('One verdict per criterion'),
	unrelatedChanges: z
		.array(z.string().max(300))
		.max(20)
		.optional()
		.describe('Changes no criterion explains (possible scope creep or a stale ticket)'),
	summary: z.string().max(1000).optional().describe('One or two sentences on how well the PR delivers the ticket'),
});

/** Dashboard: a human changes some verdicts. */
export const UiRequirementsSchema = PrSchema.extend({
	results: z.array(VerdictSchema).min(1).max(50),
});

export const FindingSchema = z.object({
	path: z.string(),
	content: z.string(),
	suggestionCode: z.string().optional(),
	existingCode: z
		.string()
		.optional()
		.describe('The exact line(s) of the diff the finding is about. Decides where the comment goes; give it always.'),
	startLine: z.number().int().nonnegative().default(0),
	endLine: z.number().int().nonnegative().default(0),
	category: z.enum(FINDING_CATEGORIES).optional(),
	severity: z.enum(FINDING_SEVERITIES).optional(),
	thinking: z.string().optional(),
	ruleId: z
		.string()
		.regex(/^[\w-]+\.[\w-]+$/, 'the [id] shown in the rules checklist, e.g. python.mutable-default-arguments')
		.max(120)
		.optional()
		.describe('The [id] of the checklist item the finding breaks (shown in the <rules> block)'),
	confidence: z
		.number()
		.int()
		.min(0)
		.max(100)
		.optional()
		.describe('How sure you are this is a real defect, 0–100. Below ~50, say so rather than inflating severity.'),
	evidence: z
		.string()
		.max(600)
		.optional()
		.describe('What makes it real: the caller, input or code path (read with pr_review_read_file) that triggers it'),
});

export const SubmitFindingsSchema = PrSchema.extend({
	groupIndex: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe('Group index from nextGroup / units (required unless a group is already active)'),
	findings: z.array(FindingSchema).default([]).describe('Findings for this group only (empty = clean group)'),
	summaryExtra: z.string().optional().describe('Short verdict for the summary body'),
	reportMarkdown: z.string().optional().describe('Optional full report.md override'),
});

export const SaveDraftSchema = PrSchema.extend({
	reportMarkdown: z.string().describe('Full report.md contents'),
	commentsMarkdown: z.string().describe('Full comments.md contents (front-matter + Inline + Summary)'),
});

export const ImportArchitectureSchema = PrSchema.extend({
	indices: z
		.array(z.number().int().nonnegative())
		.optional()
		.describe('0-based indices into architecture.findings (omit = all)'),
});

/** Model-facing publish: always creates a pending (draft) review that only the author sees. */
export const PublishSchema = PrSchema.extend({
	force: z
		.boolean()
		.optional()
		.describe('Create the pending review even if coverage is incomplete or human edits look risky'),
});

/** Dashboard-only publish: a human submits the review (or a pending one). */
export const UiPublishSchema = PrSchema.extend({
	pending: z.boolean().optional().describe('If true, create a pending review without event'),
	force: z.boolean().optional().describe('Publish even when risky human edits were detected'),
});

export const UiSaveSchema = PrSchema.extend({
	commentsMarkdown: z.string(),
	reportMarkdown: z.string().optional(),
});

/** A path inside the reviewed repo: relative, no `..`, not option-like. */
const RepoFile = z
	.string()
	.min(1)
	.max(500)
	.refine((p) => !p.startsWith('-'), 'must not start with "-"')
	.refine((p) => !path.isAbsolute(p), 'must be relative to the repo root')
	.refine((p) => !path.normalize(p).split(path.sep).includes('..'), 'must not leave the repo');

export const NextGroupSchema = PrSchema.extend({
	groupIndex: z
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe('Take this group (e.g. one per parallel subagent); default: the next pending group'),
});

export const ReadFileSchema = PrSchema.extend({
	path: RepoFile.describe('Repo-relative file path, read at the PR head commit'),
	startLine: z.number().int().positive().optional(),
	endLine: z.number().int().positive().optional(),
});

export const SearchSchema = PrSchema.extend({
	pattern: z.string().min(1).max(300).describe('Text to find (fixed string unless regex is true)'),
	regex: z.boolean().optional().describe('Treat pattern as an extended regular expression'),
	paths: z.array(RepoFile).max(20).optional().describe('Limit to these files or folders'),
});

export const VerifyFindingsSchema = PrSchema.extend({
	results: z
		.array(
			z.object({
				id: z.string().min(1).describe('Finding id from the verification list, e.g. F1'),
				verdict: z.enum(VERDICTS),
				note: z.string().max(300).optional().describe('One line: why'),
			}),
		)
		.min(1)
		.max(200),
});

export const MetricsSchema = z.object({
	project: z.string().optional().describe('Limit to one repo (its folder name); default: all'),
	last: z.number().int().positive().max(1000).optional().describe('Only the last N published reviews'),
});

export type PrInput = z.infer<typeof PrSchema>;
export type NextGroupInput = z.infer<typeof NextGroupSchema>;
export type ReadFileInput = z.infer<typeof ReadFileSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type VerifyFindingsInput = z.infer<typeof VerifyFindingsSchema>;
export type MetricsInput = z.infer<typeof MetricsSchema>;
export type TicketInput = z.infer<typeof TicketInputSchema>;
export type SetTicketInput = z.infer<typeof SetTicketSchema>;
export type SubmitRequirementsInput = z.infer<typeof SubmitRequirementsSchema>;
export type UiRequirementsInput = z.infer<typeof UiRequirementsSchema>;
export type StartInput = z.infer<typeof StartSchema>;
export type SubmitFindingsInput = z.infer<typeof SubmitFindingsSchema>;
export type SaveDraftInput = z.infer<typeof SaveDraftSchema>;
export type ImportArchitectureInput = z.infer<typeof ImportArchitectureSchema>;
export type PublishInput = z.infer<typeof PublishSchema>;
export type UiPublishInput = z.infer<typeof UiPublishSchema>;
export type UiSaveInput = z.infer<typeof UiSaveSchema>;
