import { Inject, Injectable } from '@nestjs/common';
import { Resource, ResourceTemplate, Tool } from '@nestjs/mcp';

import { appToolMeta, RESOURCE_MIME_TYPE, readAppHtml } from '../common/mcp/mcp-app.util.ts';
import { presentReview } from './pr-review.presenter.ts';
import {
	type ImportArchitectureInput,
	ImportArchitectureSchema,
	type MetricsInput,
	MetricsSchema,
	type NextGroupInput,
	NextGroupSchema,
	type PrInput,
	PrSchema,
	type PublishInput,
	PublishSchema,
	type ReadFileInput,
	ReadFileSchema,
	type SaveDraftInput,
	SaveDraftSchema,
	type SearchInput,
	SearchSchema,
	type SetTicketInput,
	SetTicketSchema,
	type StartInput,
	StartSchema,
	type SubmitFindingsInput,
	SubmitFindingsSchema,
	type SubmitRequirementsInput,
	SubmitRequirementsSchema,
	type UiPublishInput,
	UiPublishSchema,
	type UiRequirementsInput,
	UiRequirementsSchema,
	type UiSaveInput,
	UiSaveSchema,
	type VerifyFindingsInput,
	VerifyFindingsSchema,
} from './pr-review.schemas.ts';
import { PrReviewService } from './pr-review.service.ts';

export const PR_REVIEW_UI_URI = 'ui://spec-drift/pr-review.html';
const PR_REVIEW_UI_FILE = 'pr-review.html';

/** Opens the PR Review dashboard (only after group coverage is complete). */
const dashboardMeta = appToolMeta(PR_REVIEW_UI_URI);
/** Callable only from the dashboard, hidden from the model. */
const dashboardOnlyMeta = appToolMeta(PR_REVIEW_UI_URI, ['app']);

/**
 * GitHub PR review flow:
 * start → (next_group → submit_findings)* → status (opens dashboard) → human edit → publish.
 * Handlers stay thin: validate (schema) → PrReviewService → present.
 */
@Injectable()
export class PrReviewTools {
	constructor(@Inject(PrReviewService) private readonly review: PrReviewService) {}

	// ── Agent loop: text + structuredContent only, no UI ───────────────────────

	@Tool({
		name: 'pr_review_start',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		title: 'Start PR review',
		description:
			'Start a review of a GitHub PR: fetch its diff, split it into review groups and return the review prompt. Optionally pass the ticket it implements (Jira / Linear: its text; GitHub issue: its ref; or pasted text) to verify its acceptance criteria after the groups. No UI: then loop pr_review_next_group → pr_review_submit_findings.',
		inputSchema: StartSchema,
	})
	async start(args: StartInput) {
		return presentReview(await this.review.start(args));
	}

	@Tool({
		name: 'pr_review_next_group',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Next PR review group',
		description:
			'Take the next review group (or the one in groupIndex, e.g. one per parallel subagent) and return its diff, rules and commentable lines. The only call that hands them out.',
		inputSchema: NextGroupSchema,
	})
	async nextGroup(args: NextGroupInput) {
		return presentReview(await this.review.nextGroup(args), { withRules: true, loop: true });
	}

	@Tool({
		name: 'pr_review_submit_findings',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Submit PR findings for a group',
		description:
			'Submit the findings of one review group (groupIndex; [] when clean). Marks it done and names the next step.',
		inputSchema: SubmitFindingsSchema,
	})
	async submitFindings(args: SubmitFindingsInput) {
		return presentReview(await this.review.submitFindings(args), { loop: true });
	}

	@Tool({
		name: 'pr_review_read_file',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
		title: 'Read a file at the PR head',
		description:
			'Read a repo file as it is in the PR (head commit), with line numbers, 200 lines at a time (pass startLine/endLine for a range). Use this instead of the local checkout, which may be on another branch.',
		inputSchema: ReadFileSchema,
	})
	async readFile(args: ReadFileInput) {
		return { content: [{ type: 'text' as const, text: await this.review.readFile(args) }] };
	}

	@Tool({
		name: 'pr_review_search',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
		title: 'Search code at the PR head',
		description:
			'git grep across the repo as it is in the PR (head commit): callers, definitions, usages. Fixed string by default; regex: true for extended regex. Returns path:line:text, up to 50 matches (narrow with paths).',
		inputSchema: SearchSchema,
	})
	async search(args: SearchInput) {
		return { content: [{ type: 'text' as const, text: await this.review.search(args) }] };
	}

	@Tool({
		name: 'pr_review_verify_findings',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Verify PR review findings',
		description:
			'After all groups: one verdict per finding id (F1…) — confirmed (stays), plausible (moved to the summary as "worth a look") or rejected (not posted). Re-check each finding on its own, ideally with a fresh subagent. Text-only.',
		inputSchema: VerifyFindingsSchema,
	})
	async verifyFindings(args: VerifyFindingsInput) {
		return presentReview(await this.review.verifyFindings(args), { loop: true });
	}

	@Tool({
		name: 'pr_review_metrics',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
		title: 'PR review quality metrics',
		description:
			'How much of what the reviewer drafted humans kept, edited or removed, across published reviews — overall, by severity and by checklist item (with the noisiest ones). Use it to judge prompt or rule changes.',
		inputSchema: MetricsSchema,
	})
	async metrics(args: MetricsInput) {
		return { content: [{ type: 'text' as const, text: await this.review.metrics(args) }] };
	}

	@Tool({
		name: 'pr_review_set_ticket',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		title: 'Set the ticket of a PR review',
		description:
			'Attach (or replace) the ticket a PR implements, after pr_review_start: Jira / Linear (read it with your own tools and pass its text or criteria), a GitHub issue (ref, fetched with gh) or pasted text. Its acceptance criteria and definition of done become the last coverage step. Text-only.',
		inputSchema: SetTicketSchema,
	})
	async setTicket(args: SetTicketInput) {
		return presentReview(await this.review.setTicket(args));
	}

	@Tool({
		name: 'pr_review_submit_requirements',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Submit ticket criteria verification',
		description:
			'Final step when the review has a ticket, after every review group: one verdict per criterion (met / partial / unmet / unverifiable) with path:line evidence, plus changes no criterion explains. Adds the checklist to the review summary; unmet criteria suggest REQUEST_CHANGES. Text-only.',
		inputSchema: SubmitRequirementsSchema,
	})
	async submitRequirements(args: SubmitRequirementsInput) {
		return presentReview(await this.review.submitRequirements(args), { loop: true });
	}

	@Tool({
		name: 'pr_review_cleanup',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		title: 'Cleanup PR review',
		description:
			'Remove generated PR review artifacts (diff, report, comments, state) for a PR. Text-only — does not open the dashboard.',
		inputSchema: PrSchema,
	})
	async cleanup(args: PrInput) {
		return presentReview(await this.review.cleanup(args));
	}

	// ── Dashboard-opening tools ────────────────────────────────────────────────

	@Tool({
		name: 'pr_review_save_draft',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		title: 'Save PR review draft',
		description:
			'Persist hand-written report.md and comments.md (with .original snapshot) and open the PR Review dashboard. Prefer pr_review_submit_findings during the group loop; use this after coverage is complete for manual edits.',
		inputSchema: SaveDraftSchema,
		_meta: dashboardMeta,
	})
	async saveDraft(args: SaveDraftInput) {
		return presentReview(await this.review.saveDraft(args));
	}

	@Tool({
		name: 'pr_review_status',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'PR review status / open dashboard',
		description:
			'Show PR review state and open the PR Review dashboard (once, after all groups are done) so a human can edit comments before publish. Shows the architecture scan status, and offers to generate rules when the repo has none.',
		inputSchema: PrSchema,
		_meta: dashboardMeta,
	})
	async status(args: PrInput) {
		return presentReview(await this.review.status(args));
	}

	@Tool({
		name: 'pr_review_architecture_rescan',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Rescan PR architecture',
		description:
			'Re-run the static analyzer with the project rules (e.g. `.semgrep/`) scoped to the PR files. Call after generating or updating the rules. Opens the PR Review dashboard.',
		inputSchema: PrSchema,
		_meta: dashboardMeta,
	})
	async architectureRescan(args: PrInput) {
		return presentReview(await this.review.architectureRescan(args));
	}

	@Tool({
		name: 'pr_review_import_architecture',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Import architecture findings into PR comments',
		description:
			'Convert selected (or all) architecture findings into inline PR review comments in comments.md. Opens the dashboard on the Comments tab. Pass indices from the Architecture panel; omit to import all.',
		inputSchema: ImportArchitectureSchema,
		_meta: dashboardMeta,
	})
	async importArchitecture(args: ImportArchitectureInput) {
		return presentReview(await this.review.importArchitecture(args));
	}

	@Tool({
		name: 'pr_review_publish',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		title: 'Publish PR review',
		description:
			'Validate comments.md and create a PENDING GitHub review (a draft visible only to you) via gh api. It never submits APPROVE / REQUEST_CHANGES / COMMENT: a human submits it on GitHub or with Publish in the PR Review dashboard. Blocks on incomplete coverage or risky human edits unless force=true.',
		inputSchema: PublishSchema,
		_meta: dashboardMeta,
	})
	async publish(args: PublishInput) {
		return presentReview(await this.review.publish(args));
	}

	// ── Dashboard-only tools (hidden from the model) ───────────────────────────

	@Tool({
		name: 'pr_review_ui_save',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
		title: 'Save PR review from UI',
		description: 'Persist comment edits from the PR Review dashboard.',
		inputSchema: UiSaveSchema,
		_meta: dashboardOnlyMeta,
	})
	async uiSave(args: UiSaveInput) {
		return presentReview(await this.review.uiSave(args));
	}

	@Tool({
		name: 'pr_review_ui_reload',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Reload PR review for UI',
		description: 'Re-read report/comments from disk for the dashboard.',
		inputSchema: PrSchema,
		_meta: dashboardOnlyMeta,
	})
	async uiReload(args: PrInput) {
		return presentReview(await this.review.uiReload(args));
	}

	@Tool({
		name: 'pr_review_ui_publish',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		title: 'Publish PR review from UI',
		description: 'Submit the review to GitHub (human action from the PR Review dashboard).',
		inputSchema: UiPublishSchema,
		_meta: dashboardOnlyMeta,
	})
	async uiPublish(args: UiPublishInput) {
		return presentReview(await this.review.uiPublish(args));
	}

	@Tool({
		name: 'pr_review_ui_requirements',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Update ticket criteria from UI',
		description: 'A human changes criterion verdicts in the PR Review dashboard.',
		inputSchema: UiRequirementsSchema,
		_meta: dashboardOnlyMeta,
	})
	async uiRequirements(args: UiRequirementsInput) {
		return presentReview(await this.review.uiRequirements(args));
	}

	@ResourceTemplate({
		uriTemplate: 'pr-review://{project}/{pr}/{file}',
		name: 'pr-review-artifact',
		title: 'PR review artifact',
		description:
			'A file from a PR review workspace: diff.patch, report.md, comments.md, units.json, architecture.json or requirements.json. ' +
			'Tool results list the URIs for the current review.',
	})
	artifact({ project, pr, file }: { project: string; pr: string; file: string }) {
		return this.review.readArtifact(decodeURIComponent(project), Number(pr), file);
	}

	@Resource({ uri: PR_REVIEW_UI_URI, name: PR_REVIEW_UI_URI, mimeType: RESOURCE_MIME_TYPE })
	dashboard() {
		return readAppHtml(PR_REVIEW_UI_URI, PR_REVIEW_UI_FILE);
	}
}
