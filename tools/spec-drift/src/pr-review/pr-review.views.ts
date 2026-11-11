/** Pure mappers from internal review state to the `PrReviewView` sent to the model and dashboard. */

import { diffForFiles } from './context/review-context.ts';
import { type GroupProgress, nextGroupBrief, type ReviewProgress } from './coverage/coverage.ts';
import { formatRulesBlock, type prepareReview } from './engine/index.ts';
import type { ReviewProfile } from './engine/profile.ts';
import type { LiveProgressView, PrReviewView, ReviewUnitsView } from './pr-review.types.ts';
import { requirementsContext } from './requirements/requirements-report.ts';

export const toReviewUnitsView = (
	prepared: ReturnType<typeof prepareReview>,
	profile?: ReviewProfile,
): ReviewUnitsView => ({
	fileCount: prepared.files.length,
	selectedCount: prepared.selected.length,
	groups: prepared.groups.map((g) => ({
		label: g.label,
		files: g.files,
		ruleDocId: g.ruleDocId,
		rulePattern: g.rulePattern,
		ruleMarkdown: g.ruleMarkdown,
		...(g.span ? { span: g.span } : {}),
	})),
	skipped: prepared.skipped,
	rightLinesByPath: prepared.rightLinesByPath,
	...(prepared.checks.length ? { checks: prepared.checks } : {}),
	...(profile ? { profile } : {}),
});

export const toLiveProgress = (progress: ReviewProgress): LiveProgressView => ({
	groups: progress.groups.map((g) => ({
		index: g.index,
		label: g.label,
		files: g.files,
		status: g.status,
		findingCount: g.findingCount,
		ruleDocId: g.ruleDocId,
		rulePattern: g.rulePattern,
	})),
	findings: progress.findings.map((f) => ({
		path: f.path,
		startLine: f.startLine,
		endLine: f.endLine,
		content: f.content,
		severity: f.severity,
		category: f.category,
		...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
		...(f.verdict ? { verdict: f.verdict } : {}),
		...(f.verifyNote ? { verifyNote: f.verifyNote } : {}),
	})),
	activeGroupIndex: progress.activeGroupIndex,
	complete: progress.complete,
	doneCount:
		progress.groups.filter((g) => g.status === 'done').length +
		(progress.verification === 'done' ? 1 : 0) +
		(progress.requirements === 'done' ? 1 : 0),
	totalCount: progress.groups.length + (progress.verification ? 1 : 0) + (progress.requirements ? 1 : 0),
	...(progress.verification ? { verification: progress.verification } : {}),
	...(progress.requirements ? { requirements: progress.requirements } : {}),
});

const MAX_HINTS = 15;

/**
 * The architecture scan's findings in a group's files (and part), as hints: deterministic results
 * the reviewer can confirm, explain or dismiss. They are posted only if the human imports them.
 */
export const staticAnalysisHints = (
	view: Pick<PrReviewView, 'architecture'>,
	group: Pick<GroupProgress, 'files' | 'span'>,
): string => {
	const findings = (view.architecture?.findings ?? []).filter(
		(f) =>
			group.files.includes(f.path) &&
			(!group.span || (f.startLine >= group.span.start && f.startLine <= group.span.end)),
	);
	if (findings.length === 0) return '';
	return [
		`<static-analysis source="${view.architecture?.engine?.name ?? 'semgrep'}" note="the repo's own rules; mention one only if it shows a real problem here">`,
		...findings
			.slice(0, MAX_HINTS)
			.map((f) => `${f.path}:${f.startLine} [${f.checkId}] ${f.message.replace(/\s+/g, ' ').slice(0, 200)}`),
		...(findings.length > MAX_HINTS ? [`… ${findings.length - MAX_HINTS} more in the Architecture tab`] : []),
		'</static-analysis>',
	].join('\n');
};

/** Attach the next group to review (files, rules checklist, instruction), if any. */
export const withNextGroup = (
	view: PrReviewView,
	progress: ReviewProgress | undefined,
	units: ReviewUnitsView | undefined,
): PrReviewView => {
	if (!progress) return view;
	const brief = nextGroupBrief(progress, units);
	if (!brief.group) return view;
	const ruleBlock = brief.group.ruleMarkdown
		? `\n\n${formatRulesBlock(brief.group.files, brief.group.ruleMarkdown)}`
		: '';
	// One line about the ticket: the criteria are in the start prompt and the final step, not in every group.
	const ticketBlock = view.requirements?.criteria.length ? `\n${requirementsContext(view.requirements)}` : '';
	// The group's own diff, so the reviewer does not have to look it up (or read the wrong branch).
	const groupDiff = view.diff ? diffForFiles(view.diff, brief.group.files, undefined, brief.group.span) : '';
	// Deterministic hints first: what the repo's own rules found in these files.
	const hints = staticAnalysisHints(view, brief.group);
	const hintsBlock = hints ? `\n\n${hints}` : '';
	const diffBlock = groupDiff ? `\n\n${groupDiff}` : '';
	return {
		...view,
		nextGroup: {
			index: brief.group.index,
			label: brief.group.label,
			files: brief.group.files,
			rightLinesByPath: brief.rightLinesByPath,
			instruction: `${brief.instruction}${ticketBlock}${ruleBlock}${hintsBlock}${diffBlock}`,
			ruleDocId: brief.group.ruleDocId,
			rulePattern: brief.group.rulePattern,
			ruleMarkdown: brief.group.ruleMarkdown,
		},
	};
};
