import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ReadResourceResult } from '@modelcontextprotocol/server';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { APP_VERSION } from '../app.constants.ts';
import { FileLock } from '../common/concurrency/file-lock.ts';
import { KeyedMutex } from '../common/concurrency/keyed-mutex.ts';
import { mcpRequestContext } from '../common/mcp/mcp-request-context.ts';
import type { ArchitectureReviewView } from './architecture/architecture.types.ts';
import { mergeArchitectureComments } from './architecture/architecture-import.ts';
import {
	architectureFindingToReview,
	architectureReportSection,
	withArchitectureSection,
} from './architecture/architecture-report.ts';
import { ArchitectureScanService } from './architecture/architecture-scan.service.ts';
import { CommentsService } from './comments/comments.service.ts';
import {
	findRiskyEdits,
	parseCommentsMarkdown,
	serializeCommentsMarkdown,
	validateParsedComments,
} from './comments/comments-format.ts';
import { fileExcerpt, MAX_SEARCH_LINES, searchResult } from './context/code-reading.ts';
import {
	type ExistingComment,
	reReviewSection,
	sinceLastReviewSection,
	withoutDuplicates,
} from './context/review-context.ts';
import {
	activateGroup,
	activateNextGroup,
	awaitingRequirements,
	awaitingVerification,
	completeGroup,
	coverageSummary,
	initProgress,
	type ReviewProgress,
	reviewStage,
	withRequirementsStep,
	withVerificationStep,
} from './coverage/coverage.ts';
import {
	coverageGaps,
	DEFAULT_PROFILE,
	findingsToCommentsMarkdown,
	findingsToReportSection,
	PROFILE_PATH,
	parseDiffText,
	parseProfile,
	prepareReview,
	profiledSeverity,
	type ReviewFinding,
	resolveFindings,
	reviewUnitsSummary,
	suggestEvent,
} from './engine/index.ts';
import { findingsToSarif, SARIF_FILE } from './engine/sarif.ts';
import { GithubService, repoSlugFromPrUrl } from './github/github.service.ts';
import { buildPublishMetrics, parseMetricsLog, summarizeMetrics } from './metrics/review-metrics.ts';
import type {
	ImportArchitectureInput,
	MetricsInput,
	NextGroupInput,
	PrInput,
	PublishInput,
	ReadFileInput,
	SaveDraftInput,
	SearchInput,
	SetTicketInput,
	StartInput,
	SubmitFindingsInput,
	SubmitRequirementsInput,
	UiPublishInput,
	UiRequirementsInput,
	UiSaveInput,
	VerifyFindingsInput,
} from './pr-review.schemas.ts';
import type { InlineComment, PrReviewView, ResolvedPaths, ReviewUnitsView } from './pr-review.types.ts';
import { toLiveProgress, toReviewUnitsView, withNextGroup } from './pr-review.views.ts';
import { buildReviewPrompt } from './prompt/review-prompt.ts';
import type { RequirementsState } from './requirements/requirements.types.ts';
import {
	applyVerdicts,
	countByStatus,
	initRequirements,
	requirementsEvent,
	requirementsInstruction,
	requirementsReportSection,
	withRequirementsBlock,
	withRequirementsSection,
} from './requirements/requirements-report.ts';
import { TicketService } from './requirements/ticket.service.ts';
import { detectTicketRefs } from './requirements/ticket-refs.ts';
import {
	applyVerification,
	draftFindings,
	findingExcerpt,
	verificationInstruction,
	verificationReportSection,
} from './verification/verification.ts';
import { ReviewArtifactsRepository } from './workspace/review-artifacts.repository.ts';
import { ReviewWorkspaceService } from './workspace/review-workspace.service.ts';

const today = (): string => new Date().toISOString().slice(0, 10);

/** Budgets for the code-reading tools (keep tool results small; the agent can page). */

const ARTIFACT_MIME_TYPES: Readonly<Record<string, string>> = {
	'diff.patch': 'text/x-diff',
	'report.md': 'text/markdown',
	'comments.md': 'text/markdown',
	'units.json': 'application/json',
	'architecture.json': 'application/json',
	'requirements.json': 'application/json',
	[SARIF_FILE]: 'application/sarif+json',
};

/** What the agent should do next, given the coverage state. */
const nextStep = (
	progress: ReviewProgress,
	requirements: RequirementsState | undefined,
	excerpts: readonly (string | undefined)[] = [],
): string => {
	if (progress.complete) {
		return 'Coverage complete — call pr_review_status once to open the dashboard for human edit, then pr_review_publish.';
	}
	if (awaitingVerification(progress)) return verificationInstruction(progress.findings, excerpts);
	if (awaitingRequirements(progress) && requirements) return requirementsInstruction(requirements);
	return 'Next: call pr_review_next_group (still no UI).';
};

/**
 * Interactive, group-by-group GitHub PR review:
 *
 *   start ─► (next_group ─► submit_findings)* ─► status (dashboard) ─► human edit ─► publish
 *
 * Each step reads and writes the PR workspace on disk, so the flow survives restarts and works over
 * stateless HTTP. Every method returns a `PrReviewView` for the model and the dashboard.
 */
@Injectable()
export class PrReviewService {
	/** In-process queue (cheap, ordered) + lock file (other server processes, e.g. another client). */
	private readonly locks = new KeyedMutex();
	private readonly fileLock = new FileLock();

	constructor(
		@Inject(ReviewWorkspaceService) private readonly workspace: ReviewWorkspaceService,
		@Inject(ReviewArtifactsRepository) private readonly artifacts: ReviewArtifactsRepository,
		@Inject(GithubService) private readonly github: GithubService,
		@Inject(CommentsService) private readonly comments: CommentsService,
		@Inject(ArchitectureScanService) private readonly architectureScan: ArchitectureScanService,
		@Inject(TicketService) private readonly tickets: TicketService,
	) {}

	// ── public API: one call per PR at a time (state on disk is read-modify-write) ──

	start(input: StartInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.startUnlocked(input));
	}

	nextGroup(input: NextGroupInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.nextGroupUnlocked(input));
	}

	verifyFindings(input: VerifyFindingsInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.verifyFindingsUnlocked(input));
	}

	submitFindings(input: SubmitFindingsInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.submitFindingsUnlocked(input));
	}

	saveDraft(input: SaveDraftInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.saveDraftUnlocked(input));
	}

	status(input: PrInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.statusUnlocked(input));
	}

	uiReload(input: PrInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.uiReloadUnlocked(input));
	}

	architectureRescan(input: PrInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.architectureRescanUnlocked(input));
	}

	importArchitecture(input: ImportArchitectureInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.importArchitectureUnlocked(input));
	}

	/** Model path: never submits a visible review, only a pending draft the author must submit. */
	publish(input: PublishInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.publishUnlocked({ ...input, pending: true }));
	}

	/** Dashboard path: a human chose to submit (or create a pending) review. */
	uiPublish(input: UiPublishInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.publishUnlocked(input));
	}

	cleanup(input: PrInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.cleanupUnlocked(input));
	}

	uiSave(input: UiSaveInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.uiSaveUnlocked(input));
	}

	setTicket(input: SetTicketInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.setTicketUnlocked(input));
	}

	submitRequirements(input: SubmitRequirementsInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.submitRequirementsUnlocked(input));
	}

	uiRequirements(input: UiRequirementsInput): Promise<PrReviewView> {
		return this.exclusive(input, () => this.uiRequirementsUnlocked(input));
	}

	// ── read-only: code at the PR head, metrics (no lock: nothing is written) ──

	/** A file of the PR head with line numbers (never the local checkout, which may be on another branch). */
	async readFile({ pr, repoPath, path: file, startLine, endLine }: ReadFileInput): Promise<string> {
		const { repoRoot, headSha } = await this.reviewedHead(pr, repoPath);
		const text = await this.github.showFile(repoRoot, headSha, file);
		if (text === undefined) {
			throw new NotFoundException(
				`${file} does not exist at the PR head ${headSha.slice(0, 8)} (deleted, renamed or wrong path).`,
			);
		}
		return fileExcerpt({ file, sha: headSha, text, startLine, endLine });
	}

	/** git grep at the PR head. */
	async search({ pr, repoPath, pattern, regex, paths }: SearchInput): Promise<string> {
		const { repoRoot, headSha } = await this.reviewedHead(pr, repoPath);
		const { lines, truncated } = await this.github.grepAt(repoRoot, headSha, pattern, {
			...(regex !== undefined ? { regex } : {}),
			...(paths ? { paths } : {}),
			maxLines: MAX_SEARCH_LINES,
		});
		return searchResult({ pattern, sha: headSha, lines, truncated });
	}

	/** Acceptance of drafted comments across published reviews (see metrics/review-metrics.ts). */
	async metrics({ project, last }: MetricsInput): Promise<string> {
		const text = (await this.artifacts.readText(this.workspace.metricsFile)) ?? '';
		let records = parseMetricsLog(text).filter((r) => !project || r.project === project);
		if (last) records = records.slice(-last);
		return summarizeMetrics(records);
	}

	// ── implementations ──────────────────────────────────────────────────────

	/** Fetch the PR, split the diff into rule groups, scan architecture, activate group 0. */
	private async startUnlocked({ pr, context, repoPath, ticket }: StartInput): Promise<PrReviewView> {
		const call = mcpRequestContext.current();
		await call.reportProgress(0, 4, `Fetching PR #${pr}`);
		const probe = await this.workspace.resolve({ pr, repoPath });
		const paths = await this.workspace.resolve({
			pr,
			repoPath,
			rotate: await this.artifacts.exists(probe.report),
		});

		const metadata = await this.github.fetchPrMetadata(pr, paths.repoRoot);
		// Resolve the ticket first: a bad ticket argument fails before the slow steps.
		const resolvedTicket = ticket ? await this.tickets.resolve(ticket, paths.repoRoot) : undefined;
		const [diff, baseSha] = await Promise.all([
			this.github.fetchPrDiff(pr, paths.repoRoot),
			this.github.resolveBaseSha(metadata.baseRefName, paths.repoRoot),
		]);
		await this.artifacts.writeText(paths.diff, diff);

		await call.reportProgress(1, 4, 'Splitting the diff into review groups');
		const warnings: string[] = [];
		// The review profile comes from the base branch: a PR cannot switch off its own checks.
		const { profile, warning: profileWarning } = parseProfile(
			await this.github.showFile(paths.repoRoot, baseSha, PROFILE_PATH),
		);
		if (profileWarning) warnings.push(profileWarning);
		const prepared = prepareReview(diff, profile);
		const units = toReviewUnitsView(prepared, profile);
		await this.artifacts.saveReviewUnits(paths, units);

		// Ticket criteria: the given ticket, or the one from a previous review of this PR (re-review).
		const changedFiles = metadata.files.length > 0 ? metadata.files : units.groups.flatMap((g) => [...g.files]);
		const previous = resolvedTicket ? undefined : await this.artifacts.loadRequirements(paths);
		const source = resolvedTicket ?? (previous ? { ticket: previous.ticket, criteria: previous.criteria } : undefined);
		let requirements: RequirementsState | undefined;
		if (source && source.criteria.length > 0) {
			requirements = initRequirements(source.ticket, source.criteria, changedFiles);
			await this.artifacts.saveRequirements(paths, requirements);
		} else if (resolvedTicket) {
			warnings.push(
				'No acceptance criteria found in the ticket text. Call pr_review_set_ticket with `criteria` to check them.',
			);
		}
		const ticketRefs = requirements ? [] : detectTicketRefs(metadata);

		const progress = activateNextGroup(initProgress(units, requirements ? 'pending' : undefined));
		await this.artifacts.saveProgress(paths, progress);

		const state = await this.workspace.updateCurrentState(paths.state, {
			repo: repoSlugFromPrUrl(metadata.url),
			base: metadata.baseRefName,
			head_sha: metadata.headRefOid,
			base_sha: baseSha,
			date: today(),
			published: false,
		});

		await call.reportProgress(2, 4, 'Running the project architecture rules');
		const architecture = await this.scanArchitecture(
			pr,
			paths,
			metadata.files.length > 0 ? metadata.files : units.groups.flatMap((g) => [...g.files]),
			metadata.headRefOid,
		);

		await call.reportProgress(3, 4, 'Reading existing PR comments and what changed since the last review');
		const existingComments = await this.fetchExistingComments(pr, metadata.url, paths, warnings);
		const reReview =
			paths.rotated && paths.previousHeadSha
				? reReviewSection({
						previousHeadSha: paths.previousHeadSha,
						changedSinceLastReview:
							paths.previousHeadSha === metadata.headRefOid
								? []
								: await this.github
										.changedFilesBetween(paths.repoRoot, paths.previousHeadSha, metadata.headRefOid)
										.catch(() => undefined),
						previousComments: await this.previousInlineComments(paths),
					})
				: undefined;

		await call.reportProgress(4, 4, 'Ready');
		const prompt = buildReviewPrompt({
			pr,
			context,
			paths,
			metadata,
			baseSha,
			unitsSummary: reviewUnitsSummary(prepared),
			units,
			architecture,
			requirements,
			existingComments,
			reReview,
		});

		const ticketLine = requirements
			? `Ticket ${requirements.ticket.ref ?? requirements.ticket.source}: ${requirements.criteria.length} criteria — verified after the groups with pr_review_submit_requirements.`
			: ticketRefs.length
				? `Possible ticket: ${ticketRefs.map((r) => r.ref).join(', ')}. Ask the user (or read it with your Jira / Linear / GitHub tools) and call pr_review_set_ticket to check its acceptance criteria.`
				: '';
		return withNextGroup(
			{
				kind: 'pr-review',
				pr,
				phase: progress.complete ? 'draft' : 'reviewing',
				paths,
				state,
				metadata,
				context,
				prompt,
				diff,
				units,
				architecture,
				requirements,
				...(ticketRefs.length ? { ticketRefs } : {}),
				progress: toLiveProgress(progress),
				...(warnings.length ? { warnings } : {}),
				message: [
					`Prepared PR #${pr}: ${units.selectedCount}/${units.fileCount} files in ${units.groups.length} group(s).`,
					coverageSummary(progress),
					architecture.message,
					ticketLine,
					progress.complete
						? 'No groups to review — call pr_review_status to open the dashboard once for human edit, then pr_review_publish.'
						: awaitingRequirements(progress) && requirements
							? requirementsInstruction(requirements)
							: 'Do not open the UI yet. For each group: pr_review_next_group (its diff and rules), then pr_review_submit_findings(groupIndex). Repeat until progress.complete, then pr_review_status (opens dashboard once).',
				]
					.filter(Boolean)
					.join('\n'),
			},
			progress,
			units,
		);
	}

	/** Activate (idempotently) the next pending group. */
	private async nextGroupUnlocked({ pr, repoPath, groupIndex }: NextGroupInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const units = await this.artifacts.loadReviewUnits(paths);
		let progress = await this.ensureProgress(paths, units);
		if (groupIndex !== undefined) {
			if (!progress.groups.some((g) => g.index === groupIndex)) {
				throw new BadRequestException(`Unknown group index ${groupIndex} (0–${progress.groups.length - 1}).`);
			}
			progress = activateGroup(progress, groupIndex);
			await this.artifacts.saveProgress(paths, progress);
		} else if (reviewStage(progress) === 'groups') {
			progress = activateNextGroup(progress);
			await this.artifacts.saveProgress(paths, progress);
		}
		const requirements = await this.artifacts.loadRequirements(paths);
		return withNextGroup(
			{
				kind: 'pr-review',
				pr,
				phase: progress.complete ? 'draft' : 'reviewing',
				paths,
				state: await this.workspace.loadState(paths.state),
				diff: await this.artifacts.readText(paths.diff),
				units,
				requirements,
				architecture: await this.artifacts.loadArchitecture(paths),
				progress: toLiveProgress(progress),
				reportMarkdown: await this.artifacts.readText(paths.report),
				commentsMarkdown: await this.artifacts.readText(paths.comments),
				message: [
					coverageSummary(progress),
					reviewStage(progress) !== 'groups'
						? nextStep(progress, requirements, await this.verificationExcerpts(paths, progress))
						: '',
				]
					.filter(Boolean)
					.join('\n'),
			},
			progress,
			units,
		);
	}

	/** Record one group's findings, rewrite the drafts and advance to the next group. */
	private async submitFindingsUnlocked(input: SubmitFindingsInput): Promise<PrReviewView> {
		const { pr, repoPath } = input;
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const units = await this.artifacts.loadReviewUnits(paths);
		const diff = await this.requireDiff(paths);

		const anchored = resolveFindings(input.findings, parseDiffText(diff), {
			addedLinesOnly: units?.profile?.addedLinesOnly ?? false,
		});
		const { unresolved } = anchored;
		const profile = units?.profile ?? DEFAULT_PROFILE;
		const resolved = anchored.resolved.map((f) => {
			const severity = profiledSeverity(f, profile);
			return severity && severity !== f.severity ? { ...f, severity } : f;
		});
		const warnings = [
			...unresolved.map(
				(f, i) =>
					`Unanchored finding skipped (${anchored.reasons[i]}): ${f.path}:${f.startLine || '?'} — ${f.content.slice(0, 80)}. Resubmit it with existingCode quoting the line(s) from the diff.`,
			),
			...anchored.notes.map((n) => `Anchor adjusted: ${n}`),
		];

		let progress = await this.ensureProgress(paths, units);
		const groupIndex =
			input.groupIndex ?? progress.activeGroupIndex ?? progress.groups.find((g) => g.status === 'reviewing')?.index;
		if (groupIndex === undefined || groupIndex === null) {
			throw new BadRequestException('groupIndex required when no group is active. Call pr_review_next_group first.');
		}
		if (!progress.groups.some((g) => g.index === groupIndex)) {
			throw new BadRequestException(`Unknown group index ${groupIndex}.`);
		}

		const completed = completeGroup(progress, {
			groupIndex,
			newFindings: resolved,
			replaceGroupFindings: true,
		});
		for (const f of completed.rejectedOutsideGroup) {
			warnings.push(`Finding path not in group [${groupIndex}]: ${f.path} — kept out of this group's coverage`);
		}
		const verdict = input.summaryExtra?.trim() || progress.verdict;
		// Groups done → findings need verifying (re-submitted groups bring unverified findings back).
		progress = withVerificationStep(completed.progress);
		progress =
			reviewStage(progress) === 'groups' ? activateNextGroup(progress) : { ...progress, activeGroupIndex: null };
		progress = { ...progress, ...(verdict ? { verdict } : {}) };
		await this.artifacts.saveProgress(paths, progress);

		const requirements = await this.artifacts.loadRequirements(paths);
		const draft = await this.writeDraftFromFindings(paths, {
			pr,
			repo: state.repo || 'unknown/unknown',
			headSha: state.current.head_sha,
			revision: state.current.revision,
			findings: progress.findings,
			summaryExtra: verdict,
			reportMarkdown: input.reportMarkdown,
			snapshotOriginal: progress.complete,
			requirements,
		});

		return withNextGroup(
			{
				kind: 'pr-review',
				pr,
				phase: progress.complete ? 'draft' : 'reviewing',
				paths,
				state,
				reportMarkdown: draft.reportMarkdown,
				commentsMarkdown: draft.commentsMarkdown,
				parsed: draft.parsed,
				check: progress.complete ? await this.comments.checkAgainstOriginal(paths) : undefined,
				diff,
				units,
				requirements,
				progress: toLiveProgress(progress),
				warnings: [...warnings, ...draft.warnings],
				message: [
					`Group [${groupIndex}] done (+${resolved.length} finding(s), ${unresolved.length} unanchored).`,
					coverageSummary(progress),
					nextStep(progress, requirements, await this.verificationExcerpts(paths, progress)),
				].join('\n'),
			},
			progress,
			units,
		);
	}

	/** Code around each finding at the PR head, for the verification step (only while it is due). */
	private async verificationExcerpts(paths: ResolvedPaths, progress: ReviewProgress): Promise<(string | undefined)[]> {
		if (!awaitingVerification(progress)) return [];
		const headSha = (await this.workspace.loadState(paths.state)).current.head_sha;
		if (!headSha) return [];
		const files = new Map<string, Promise<string | undefined>>();
		const fileAt = (file: string) => {
			if (!files.has(file)) files.set(file, this.github.showFile(paths.repoRoot, headSha, file));
			return files.get(file) as Promise<string | undefined>;
		};
		return Promise.all(
			progress.findings.map(async (f) => {
				const text = await fileAt(f.path);
				return text === undefined ? undefined : findingExcerpt(text, f);
			}),
		);
	}

	/** Save hand-written drafts (bypassing the group loop) and snapshot them as the original. */
	private async saveDraftUnlocked({
		pr,
		repoPath,
		reportMarkdown,
		commentsMarkdown,
	}: SaveDraftInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const { parsed, warnings } = await this.comments.saveDraft(paths, { reportMarkdown, commentsMarkdown });
		const progress = await this.artifacts.loadProgress(paths);
		return {
			kind: 'pr-review',
			pr,
			phase: 'draft',
			paths,
			state: await this.workspace.loadState(paths.state),
			reportMarkdown,
			commentsMarkdown,
			parsed,
			check: await this.comments.checkAgainstOriginal(paths),
			diff: await this.artifacts.readText(paths.diff),
			units: await this.artifacts.loadReviewUnits(paths),
			progress: progress ? toLiveProgress(progress) : undefined,
			warnings,
			message: [
				`Draft saved under ${paths.base}.`,
				warnings.length ? `Warnings: ${warnings.join('; ')}` : 'No validation warnings.',
				'Open the PR Review dashboard to edit comments before publishing.',
			].join(' '),
		};
	}

	/** Current state of the review (opens the dashboard). */
	private async statusUnlocked({ pr, repoPath }: PrInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const reportMarkdown = await this.artifacts.readText(paths.report);
		const commentsMarkdown = await this.artifacts.readText(paths.comments);
		const units = await this.artifacts.loadReviewUnits(paths);
		const progress = await this.artifacts.loadProgress(paths);
		const architecture = await this.artifacts.loadArchitecture(paths);
		const requirements = await this.artifacts.loadRequirements(paths);
		const base = {
			kind: 'pr-review' as const,
			pr,
			paths,
			state,
			reportMarkdown,
			diff: await this.artifacts.readText(paths.diff),
			units,
			architecture,
			requirements,
			progress: progress ? toLiveProgress(progress) : undefined,
		};
		const reviewing = progress !== undefined && !progress.complete;

		if (!commentsMarkdown) {
			const summary = progress
				? coverageSummary(progress)
				: reportMarkdown
					? 'Report exists but comments.md is missing.'
					: 'No draft yet — call pr_review_start.';
			return withNextGroup(
				{
					...base,
					phase: reviewing ? 'reviewing' : reportMarkdown ? 'draft' : 'prepared',
					message: [summary, architecture?.message].filter(Boolean).join('\n'),
				},
				units ? progress : undefined,
				units,
			);
		}

		const parsed = parseCommentsMarkdown(commentsMarkdown);
		return withNextGroup(
			{
				...base,
				phase: state.current.published ? 'published' : reviewing ? 'reviewing' : 'draft',
				commentsMarkdown,
				parsed,
				check: await this.comments.checkAgainstOriginal(paths),
				warnings: validateParsedComments(parsed),
				reviewUrl: state.current.review_url,
				message: [
					`Status for PR #${pr}: revision ${state.current.revision}, published=${state.current.published}.`,
					progress ? coverageSummary(progress) : '',
					architecture?.message ?? '',
				]
					.filter(Boolean)
					.join('\n'),
			},
			units ? progress : undefined,
			units,
		);
	}

	/** The dashboard's "reload" is the same read as status. */
	private uiReloadUnlocked(input: PrInput): Promise<PrReviewView> {
		return this.statusUnlocked(input);
	}

	/** Re-run the project rules on the PR files and refresh the report section. */
	private async architectureRescanUnlocked({ pr, repoPath }: PrInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const units = await this.artifacts.loadReviewUnits(paths);
		const progress = await this.artifacts.loadProgress(paths);
		// Every changed file (reviewed groups + skipped files), at the revision under review.
		const files = [...(units?.groups.flatMap((g) => [...g.files]) ?? []), ...(units?.skipped.map((s) => s.path) ?? [])];
		const architecture = await this.scanArchitecture(pr, paths, [...new Set(files)], state.current.head_sha);

		const report = await this.artifacts.readText(paths.report);
		const updatedReport = report !== undefined ? withArchitectureSection(report, architecture) : undefined;
		if (updatedReport) await this.artifacts.writeText(paths.report, updatedReport);

		return withNextGroup(
			{
				kind: 'pr-review',
				pr,
				phase: progress && !progress.complete ? 'reviewing' : 'draft',
				paths,
				state,
				units,
				architecture,
				progress: progress ? toLiveProgress(progress) : undefined,
				reportMarkdown: updatedReport ?? report,
				commentsMarkdown: await this.artifacts.readText(paths.comments),
				diff: await this.artifacts.readText(paths.diff),
				message: [`Architecture rescan for PR #${pr}.`, architecture.message, progress ? coverageSummary(progress) : '']
					.filter(Boolean)
					.join('\n'),
			},
			units ? progress : undefined,
			units,
		);
	}

	/** Merge selected (or all) architecture findings into comments.md as inline comments. */
	private async importArchitectureUnlocked({ pr, repoPath, indices }: ImportArchitectureInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const architecture = await this.artifacts.loadArchitecture(paths);
		if (architecture?.status !== 'scanned') {
			throw new BadRequestException(
				'No scanned architecture findings. Run pr_review_start or pr_review_architecture_rescan first.',
			);
		}
		if (architecture.findings.length === 0) {
			throw new BadRequestException('Architecture scan has zero findings to import.');
		}
		const selected = indices?.length
			? indices.map((i) => architecture.findings[i]).filter((f) => f !== undefined)
			: [...architecture.findings];
		if (selected.length === 0) {
			throw new BadRequestException('No architecture findings matched the selected indices.');
		}

		const diff = await this.requireDiff(paths);
		const { resolved, unresolved } = resolveFindings(selected.map(architectureFindingToReview), parseDiffText(diff));
		const existingMd = await this.artifacts.readText(paths.comments);
		const merged = mergeArchitectureComments({
			pr,
			state,
			existing: existingMd ? parseCommentsMarkdown(existingMd) : undefined,
			findings: resolved,
		});
		const commentsMarkdown = serializeCommentsMarkdown(merged.comments);

		const report =
			(await this.artifacts.readText(paths.report)) ??
			[
				`# PR review #${pr}`,
				'',
				'## Verdict',
				'Imported architecture findings.',
				'',
				findingsToReportSection(resolved),
			].join('\n');
		const reportMarkdown = withArchitectureSection(report, architecture);

		const draft = await this.comments.saveDraft(paths, {
			reportMarkdown,
			commentsMarkdown,
			snapshotOriginal: false,
		});
		const progress = await this.artifacts.loadProgress(paths);
		const units = await this.artifacts.loadReviewUnits(paths);

		return withNextGroup(
			{
				kind: 'pr-review',
				pr,
				phase: progress && !progress.complete ? 'reviewing' : 'draft',
				paths,
				state,
				architecture,
				units,
				progress: progress ? toLiveProgress(progress) : undefined,
				reportMarkdown,
				commentsMarkdown,
				parsed: draft.parsed,
				check: await this.comments.checkAgainstOriginal(paths),
				diff,
				warnings: [
					...unresolved.map(
						(f) =>
							`Architecture finding not on RIGHT-side diff (skipped): ${f.path}:${f.startLine} — ${f.content.slice(0, 80)}`,
					),
					...draft.warnings,
				],
				message: [
					`Imported ${merged.addedInline} architecture finding(s) as inline comments` +
						(merged.addedToSummary ? ` (+${merged.addedToSummary} minor in summary)` : '') +
						(unresolved.length ? `; ${unresolved.length} unanchored skipped` : '') +
						'.',
					'Open the Comments tab, edit if needed, then Publish.',
				].join(' '),
			},
			units ? progress : undefined,
			units,
		);
	}

	/**
	 * Publish comments.md as a GitHub review. Stops (without throwing) when coverage is incomplete or
	 * human edits look risky, unless `force` is set.
	 */
	private async publishUnlocked({ pr, repoPath, pending, force }: UiPublishInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const progress = await this.artifacts.loadProgress(paths);
		const units = await this.artifacts.loadReviewUnits(paths);
		const base = {
			kind: 'pr-review' as const,
			pr,
			paths,
			units,
			reportMarkdown: await this.artifacts.readText(paths.report),
			diff: await this.artifacts.readText(paths.diff),
		};

		if (progress && !progress.complete && !force) {
			return withNextGroup(
				{
					...base,
					phase: 'reviewing',
					state: await this.workspace.loadState(paths.state),
					progress: toLiveProgress(progress),
					commentsMarkdown: await this.artifacts.readText(paths.comments),
					message: [
						'Coverage incomplete — finish the remaining groups (and the ticket criteria, if any) or publish with force=true.',
						coverageSummary(progress),
					].join('\n'),
				},
				progress,
				units,
			);
		}

		const commentsMarkdown = await this.artifacts.readText(paths.comments);
		if (!commentsMarkdown) {
			throw new NotFoundException(`No comments.md at ${paths.comments}. Save a draft first.`);
		}
		const parsed = parseCommentsMarkdown(commentsMarkdown);
		const check = await this.comments.checkAgainstOriginal(paths);
		const live = progress ? toLiveProgress(progress) : undefined;

		const risky = findRiskyEdits(check);
		if (risky.length > 0 && !force) {
			return {
				...base,
				phase: 'needsConfirmation',
				state: await this.workspace.loadState(paths.state),
				commentsMarkdown,
				parsed,
				check,
				progress: live,
				warnings: check.warnings,
				message: [
					'Human edits look risky (removed or heavily rewritten findings).',
					'Review the Comments tab, then call pr_review_publish again with force=true if intentional.',
					risky.map((r) => `${r.kind} ${r.key}`).join('; '),
				].join(' '),
			};
		}

		const { repo, pr: prNumber, head_sha: headSha, event } = parsed.meta;
		if (!repo || !prNumber) {
			throw new BadRequestException('comments.md front-matter incomplete: repo and pr are required.');
		}
		const review = await this.github.createReview({
			repo,
			pr: prNumber,
			cwd: paths.base,
			payload: {
				body: parsed.summary,
				comments: parsed.comments,
				...(headSha ? { commit_id: headSha } : {}),
				...(pending ? {} : { event }),
			},
		});
		const state = await this.workspace.updateCurrentState(paths.state, {
			published: !pending,
			review_url: review.url,
		});
		await this.recordMetrics(paths, {
			pending: Boolean(pending),
			event,
			check,
			progress,
			revision: state.current.revision,
		});

		return {
			...base,
			phase: 'published',
			state,
			commentsMarkdown,
			parsed,
			check,
			progress: live,
			warnings: validateParsedComments(parsed),
			reviewUrl: review.url,
			message: pending
				? `Created a pending review (visible only to you): ${review.url} — submit it on GitHub or with Publish in the PR Review dashboard.`
				: `Published review (${review.state || 'ok'}): ${review.url}`,
		};
	}

	/** Delete the PR workspace. */
	private async cleanupUnlocked({ pr, repoPath }: PrInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state).catch(() => this.workspace.emptyState(pr));
		await this.artifacts.removeAll(paths);
		return {
			kind: 'pr-review',
			pr,
			phase: 'prepared',
			paths,
			state,
			message: `Removed review artifacts under ${paths.base}.`,
		};
	}

	/** Persist comment edits made in the dashboard. */
	private async uiSaveUnlocked({ pr, repoPath, commentsMarkdown, reportMarkdown }: UiSaveInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const { parsed, warnings } = await this.comments.saveFromUi(paths, { commentsMarkdown, reportMarkdown });
		const progress = await this.artifacts.loadProgress(paths);
		return {
			kind: 'pr-review',
			pr,
			phase: 'draft',
			paths,
			state: await this.workspace.loadState(paths.state),
			reportMarkdown: reportMarkdown ?? (await this.artifacts.readText(paths.report)),
			commentsMarkdown,
			parsed,
			check: await this.comments.checkAgainstOriginal(paths),
			diff: await this.artifacts.readText(paths.diff),
			units: await this.artifacts.loadReviewUnits(paths),
			architecture: await this.artifacts.loadArchitecture(paths),
			progress: progress ? toLiveProgress(progress) : undefined,
			warnings,
			message: 'UI draft saved.',
		};
	}

	/** Read one workspace artifact as an MCP resource. */
	async readArtifact(project: string, pr: number, file: string): Promise<ReadResourceResult> {
		const mimeType = ARTIFACT_MIME_TYPES[file];
		if (!mimeType || !Number.isInteger(pr)) throw new NotFoundException(`Unknown PR review artifact '${file}'.`);
		const base = await this.workspace.findWorkspace(project, pr);
		if (!base) throw new NotFoundException(`No review workspace for ${project} PR #${pr}. Call pr_review_start first.`);
		const text = await this.artifacts.readText(path.join(base, file));
		if (text === undefined) throw new NotFoundException(`${file} does not exist yet for ${project} PR #${pr}.`);
		return { contents: [{ uri: `pr-review://${encodeURIComponent(project)}/${pr}/${file}`, mimeType, text }] };
	}

	// ── helpers ──────────────────────────────────────────────────────────────

	/** Run `task` while holding the lock for this PR (keyed by repo root + PR number). */
	private async exclusive<T>(
		input: { readonly pr: number; readonly repoPath?: string },
		task: () => Promise<T>,
	): Promise<T> {
		const repoRoot = await this.workspace.resolveRepoRoot(input.repoPath);
		const key = `${repoRoot}#${input.pr}`;
		return this.locks.run(key, () => this.fileLock.run(key, task));
	}

	/**
	 * Run the repo's rules on the PR's files **as they are at the PR head**, not on the local
	 * checkout (which may be on another branch and miss files the PR adds). The files are written to
	 * a temporary folder; the rules come from the local repo, so a PR cannot weaken its own checks.
	 */
	private async scanArchitecture(
		pr: number,
		paths: ResolvedPaths,
		files: readonly string[],
		headSha: string,
	): Promise<ArchitectureReviewView> {
		const snapshot = await fs.mkdtemp(path.join(os.tmpdir(), `pr-review-${pr}-`));
		try {
			const scope = { repoRoot: paths.repoRoot, project: paths.project, pr };
			let architecture: ArchitectureReviewView;
			try {
				const prFiles = await this.github.materializePrFiles({ ...scope, headSha, paths: files, destDir: snapshot });
				architecture = await this.architectureScan.scan({ ...scope, paths: prFiles, targetRoot: snapshot });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				architecture = await this.architectureScan.failed(
					scope,
					`Could not read the PR's files at ${headSha.slice(0, 8)}`,
					message,
				);
			}
			await this.artifacts.saveArchitecture(paths, architecture);
			return architecture;
		} finally {
			await fs.rm(snapshot, { recursive: true, force: true });
		}
	}

	/** Attach (or replace) the ticket of a review; its criteria become the last coverage step. */
	private async setTicketUnlocked({ pr, repoPath, ticket }: SetTicketInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const units = await this.artifacts.loadReviewUnits(paths);
		let progress = await this.ensureProgress(paths, units);
		const resolved = await this.tickets.resolve(ticket, paths.repoRoot);
		if (resolved.criteria.length === 0) {
			throw new BadRequestException(
				'No acceptance criteria or definition-of-done items found in the ticket text. Pass them as `criteria`.',
			);
		}
		const changedFiles = [
			...(units?.groups.flatMap((g) => [...g.files]) ?? []),
			...(units?.skipped.map((f) => f.path) ?? []),
		];
		const requirements = initRequirements(resolved.ticket, resolved.criteria, changedFiles);
		await this.artifacts.saveRequirements(paths, requirements);
		progress = withRequirementsStep(progress, 'pending');
		await this.artifacts.saveProgress(paths, progress);

		const view = await this.statusUnlocked({ pr, repoPath });
		return {
			...view,
			message: [
				`Ticket ${requirements.ticket.ref ?? requirements.ticket.source} set: ${requirements.criteria.length} criteria (${requirements.criteria.map((c) => c.id).join(', ')}).`,
				nextStep(progress, requirements),
			].join('\n'),
		};
	}

	/** The agent's verdict for every ticket criterion: the final coverage step. */
	private async submitRequirementsUnlocked(input: SubmitRequirementsInput): Promise<PrReviewView> {
		const { pr, repoPath } = input;
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const units = await this.artifacts.loadReviewUnits(paths);
		let progress = await this.ensureProgress(paths, units);
		const current = await this.artifacts.loadRequirements(paths);
		if (!current) {
			throw new NotFoundException('This review has no ticket. Call pr_review_set_ticket first (or skip this step).');
		}
		const pending = progress.groups.filter((g) => g.status !== 'done');
		if (pending.length > 0) {
			throw new BadRequestException(
				`Review every group first (${pending.length} pending: ${pending.map((g) => g.index).join(', ')}). The ticket criteria are verified last, against the whole PR.`,
			);
		}
		const applied = applyVerdicts(current, input.results, { by: 'agent', complete: true });
		if (applied.missing.length > 0) {
			throw new BadRequestException(
				`Missing verdicts for ${applied.missing.join(', ')}. Give one for every criterion (use "unverifiable" when the diff cannot prove it).`,
			);
		}
		const requirements: RequirementsState = {
			...applied.state,
			unrelatedChanges: input.unrelatedChanges ?? [],
			...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
			verifiedAt: new Date().toISOString(),
		};
		await this.artifacts.saveRequirements(paths, requirements);
		progress = withRequirementsStep(progress, 'done');
		await this.artifacts.saveProgress(paths, progress);

		const draft = await this.writeDraftFromFindings(paths, {
			pr,
			repo: state.repo || 'unknown/unknown',
			headSha: state.current.head_sha,
			revision: state.current.revision,
			findings: progress.findings,
			summaryExtra: progress.verdict,
			snapshotOriginal: progress.complete,
			requirements,
		});
		const counts = countByStatus(requirements);
		const view = await this.statusUnlocked({ pr, repoPath });
		return {
			...view,
			warnings: [...applied.unknown.map((id) => `Unknown criterion id ignored: ${id}`), ...draft.warnings],
			message: [
				`Ticket criteria verified: ${counts.met} met, ${counts.partial} partial, ${counts.unmet} not met, ${counts.unverifiable} need a manual check.`,
				counts.unmet > 0 ? 'Suggested event: REQUEST_CHANGES (the human decides in the dashboard).' : '',
				coverageSummary(progress),
				nextStep(progress, requirements),
			]
				.filter(Boolean)
				.join('\n'),
		};
	}

	/** A human changes criterion verdicts in the dashboard; the summary block and report follow. */
	private async uiRequirementsUnlocked({ pr, repoPath, results }: UiRequirementsInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const current = await this.artifacts.loadRequirements(paths);
		if (!current) throw new NotFoundException('This review has no ticket.');
		const applied = applyVerdicts(current, results, { by: 'human', complete: false });
		if (applied.unknown.length > 0) {
			throw new BadRequestException(`Unknown criterion id(s): ${applied.unknown.join(', ')}.`);
		}
		const requirements = applied.state;
		await this.artifacts.saveRequirements(paths, requirements);
		const units = await this.artifacts.loadReviewUnits(paths);
		const progress = withRequirementsStep(await this.ensureProgress(paths, units), requirements.status);
		await this.artifacts.saveProgress(paths, progress);

		// Update only the marked block: everything else the human wrote in the summary stays.
		const comments = await this.artifacts.readText(paths.comments);
		if (comments) {
			const parsed = parseCommentsMarkdown(comments);
			const shown = requirements.status === 'done' ? requirements : undefined;
			await this.artifacts.writeText(
				paths.comments,
				serializeCommentsMarkdown({ ...parsed, summary: withRequirementsBlock(parsed.summary, shown) }),
			);
		}
		const report = await this.artifacts.readText(paths.report);
		if (report) await this.artifacts.writeText(paths.report, withRequirementsSection(report, requirements));

		const view = await this.statusUnlocked({ pr, repoPath });
		return { ...view, message: `Updated ${results.length} criterion verdict(s).` };
	}

	/** Verdict per finding from the verification pass; rewrites the draft without rejected ones. */
	private async verifyFindingsUnlocked({ pr, repoPath, results }: VerifyFindingsInput): Promise<PrReviewView> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const units = await this.artifacts.loadReviewUnits(paths);
		let progress = await this.ensureProgress(paths, units);
		if (reviewStage(progress) === 'groups') {
			throw new BadRequestException('Review every group first: findings are verified once all groups are submitted.');
		}
		if (progress.findings.length === 0) throw new BadRequestException('There are no findings to verify.');
		const applied = applyVerification(progress.findings, results);
		if (applied.missing.length > 0) {
			throw new BadRequestException(`Missing verdicts for ${applied.missing.join(', ')}. Give one for every finding.`);
		}
		progress = withVerificationStep({ ...progress, findings: applied.findings });
		await this.artifacts.saveProgress(paths, progress);

		const requirements = await this.artifacts.loadRequirements(paths);
		const draft = await this.writeDraftFromFindings(paths, {
			pr,
			repo: state.repo || 'unknown/unknown',
			headSha: state.current.head_sha,
			revision: state.current.revision,
			findings: progress.findings,
			summaryExtra: progress.verdict,
			snapshotOriginal: progress.complete,
			requirements,
		});
		const count = (v: string) => applied.findings.filter((f) => f.verdict === v).length;
		const view = await this.statusUnlocked({ pr, repoPath });
		return {
			...view,
			warnings: [...applied.unknown.map((id) => `Unknown finding id ignored: ${id}`), ...draft.warnings],
			message: [
				`Verified ${applied.findings.length} finding(s): ${count('confirmed')} confirmed, ${count('plausible')} plausible (moved to the summary), ${count('rejected')} rejected (not posted).`,
				coverageSummary(progress),
				nextStep(progress, requirements),
			].join('\n'),
		};
	}

	/** Repo and head commit of a started review, with that commit available locally. */
	private async reviewedHead(pr: number, repoPath?: string): Promise<{ repoRoot: string; headSha: string }> {
		const paths = await this.workspace.resolve({ pr, repoPath });
		const state = await this.workspace.loadState(paths.state);
		const headSha = state.current.head_sha;
		if (!headSha) throw new NotFoundException(`No review started for PR #${pr}. Call pr_review_start first.`);
		await this.github.ensurePrCommit(paths.repoRoot, pr, headSha);
		return { repoRoot: paths.repoRoot, headSha };
	}

	/** Append this review's acceptance numbers to the metrics log. Never fails a publish. */
	private async recordMetrics(
		paths: ResolvedPaths,
		options: {
			readonly pending: boolean;
			readonly event: string;
			readonly check: Awaited<ReturnType<CommentsService['checkAgainstOriginal']>>;
			readonly progress: ReviewProgress | undefined;
			readonly revision: number;
		},
	): Promise<void> {
		try {
			const units = await this.artifacts.loadReviewUnits(paths);
			const requirements = await this.artifacts.loadRequirements(paths);
			const findings = [...(options.progress?.findings ?? []), ...(units?.checks ?? [])];
			const ruleOfFile = (file: string) => units?.groups.find((g) => g.files.includes(file))?.ruleDocId;
			const metrics = buildPublishMetrics({
				project: paths.project,
				pr: Number(path.basename(paths.base).replace(/^pr-/, '')),
				revision: options.revision,
				pending: options.pending,
				event: options.event,
				suggestedEvent:
					requirementsEvent(requirements?.status === 'done' ? requirements : undefined) ??
					suggestEvent(draftFindings(findings), coverageGaps(units?.skipped)),
				check: options.check,
				findings,
				ruleOfFile,
				...(requirements?.status === 'done' ? { requirements: countByStatus(requirements) } : {}),
			});
			await this.artifacts.appendLine(this.workspace.metricsFile, JSON.stringify(metrics));
		} catch {
			// Metrics are diagnostics; publishing already succeeded.
		}
	}

	/** Inline comments already on the PR, saved for the prompt and for de-duplication (best effort). */
	private async fetchExistingComments(
		pr: number,
		prUrl: string,
		paths: ResolvedPaths,
		warnings: string[],
	): Promise<ExistingComment[]> {
		const repo = repoSlugFromPrUrl(prUrl);
		if (!repo) return [];
		try {
			const comments = await this.github.fetchReviewComments(repo, pr, paths.repoRoot);
			await this.artifacts.saveExistingComments(paths, comments);
			return comments;
		} catch (error) {
			warnings.push(
				`Could not read the PR's existing review comments: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
			);
			return [];
		}
	}

	/** Findings of the previous revision of this review (progress.v<k>.json), if any. */
	private async previousFindings(paths: ResolvedPaths, revision: number): Promise<ReviewFinding[] | undefined> {
		if (revision <= 1) return undefined;
		const text = await this.artifacts.readText(path.join(paths.base, `progress.v${revision - 1}.json`));
		if (!text) return undefined;
		try {
			const previous = JSON.parse(text) as { findings?: ReviewFinding[] };
			return draftFindings(previous.findings ?? []);
		} catch {
			return undefined;
		}
	}

	/** Inline comments of the previous revision of this review (comments.v<k>.md), if any. */
	private async previousInlineComments(paths: ResolvedPaths): Promise<InlineComment[]> {
		if (!paths.rotated) return [];
		const text = await this.artifacts.readText(path.join(paths.base, `comments.${paths.rotated}.md`));
		return text ? [...parseCommentsMarkdown(text).comments] : [];
	}

	private async requireDiff(paths: ResolvedPaths): Promise<string> {
		const diff = await this.artifacts.readText(paths.diff);
		if (!diff) throw new NotFoundException(`Missing diff at ${paths.diff}. Call pr_review_start first.`);
		return diff;
	}

	/** Saved progress, or a fresh one from units.json. */
	private async ensureProgress(paths: ResolvedPaths, units: ReviewUnitsView | undefined): Promise<ReviewProgress> {
		const existing = await this.artifacts.loadProgress(paths);
		if (existing) return existing;
		if (!units) throw new NotFoundException('Missing units.json — call pr_review_start first.');
		const created = initProgress(units);
		await this.artifacts.saveProgress(paths, created);
		return created;
	}

	/** Regenerate comments.md + report.md from all findings so far. */
	private async writeDraftFromFindings(
		paths: ResolvedPaths,
		options: {
			readonly pr: number;
			readonly repo: string;
			readonly headSha: string;
			readonly revision: number;
			readonly findings: readonly ReviewFinding[];
			readonly summaryExtra?: string;
			readonly reportMarkdown?: string;
			readonly snapshotOriginal: boolean;
			/** Shown in the summary and report once verified; unmet criteria suggest REQUEST_CHANGES. */
			readonly requirements?: RequirementsState;
		},
	) {
		const verified = options.requirements?.status === 'done' ? options.requirements : undefined;
		const units = await this.artifacts.loadReviewUnits(paths);
		const gaps = coverageGaps(units?.skipped);
		// Rejected findings never reach the draft; plausible ones go to the summary; repeats of comments
		// already on the PR are dropped. Deterministic checks (e.g. a committed secrets file) always count.
		const { kept: drafted, duplicates } = withoutDuplicates(
			[...draftFindings(options.findings), ...(units?.checks ?? [])],
			await this.artifacts.loadExistingComments(paths),
		);
		const event = requirementsEvent(verified) ?? suggestEvent(drafted, gaps);
		const generated = parseCommentsMarkdown(
			findingsToCommentsMarkdown({
				pr: options.pr,
				repo: options.repo,
				headSha: options.headSha,
				findings: drafted,
				event,
				summaryExtra: options.summaryExtra,
				gaps,
			}),
		);
		const commentsMarkdown = serializeCommentsMarkdown({
			...generated,
			summary: withRequirementsBlock(generated.summary, verified),
		});
		const architecture = await this.artifacts.loadArchitecture(paths);
		const reportMarkdown =
			options.reportMarkdown ??
			[
				`# PR review #${options.pr}`,
				'',
				`- **Repo:** ${options.repo} · **Head:** \`${options.headSha.slice(0, 8)}\``,
				`- **Review:** #${options.revision} · **Date:** ${today()}`,
				'- **Mode:** interactive (group-by-group)',
				'',
				'## Verdict',
				options.summaryExtra?.trim() || `Suggested event: ${event}. ${options.findings.length} finding(s).`,
				'',
				findingsToReportSection(drafted, gaps),
				'',
				sinceLastReviewSection(drafted, await this.previousFindings(paths, options.revision)),
				'',
				verificationReportSection(options.findings),
				'',
				options.requirements ? requirementsReportSection(options.requirements) : '',
				'',
				architecture ? architectureReportSection(architecture) : '',
			]
				.filter(Boolean)
				.join('\n');

		const saved = await this.comments.saveDraft(paths, {
			reportMarkdown,
			commentsMarkdown,
			snapshotOriginal: options.snapshotOriginal,
		});
		// The same findings as SARIF 2.1.0 (code-scanning format), for tools and upload by a human.
		await this.artifacts.writeText(
			path.join(paths.base, SARIF_FILE),
			JSON.stringify(findingsToSarif({ findings: drafted, version: APP_VERSION }), null, 2),
		);
		const duplicateWarnings = duplicates.map(
			(d) =>
				`Dropped a finding at ${d.finding.path}:${d.finding.startLine}: @${d.of.author} already commented the same there.`,
		);
		return { reportMarkdown, commentsMarkdown, ...saved, warnings: [...saved.warnings, ...duplicateWarnings] };
	}
}
