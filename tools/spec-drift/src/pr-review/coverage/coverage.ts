import type { LineSpan, ReviewFinding } from '../engine/types.ts';
import type { ReviewUnitsView } from '../pr-review.types.ts';

export type GroupStatus = 'pending' | 'reviewing' | 'done';
/** A coverage step after the groups (verify findings, ticket criteria). Absent = not part of this review. */
export type StepStatus = 'pending' | 'done';
export type ReviewStage = 'groups' | 'verification' | 'requirements' | 'done';

/** One review unit's state, persisted in progress.json (the rules markdown stays in units.json). */
export type GroupProgress = {
	readonly index: number;
	readonly label: string;
	readonly files: readonly string[];
	readonly ruleDocId: string;
	readonly rulePattern: string;
	readonly span?: LineSpan;
	readonly status: GroupStatus;
	readonly findingCount: number;
};

/** Group-by-group coverage of an interactive review (progress.json). */
export type ReviewProgress = {
	readonly groups: readonly GroupProgress[];
	readonly findings: readonly ReviewFinding[];
	readonly activeGroupIndex: number | null;
	readonly complete: boolean;
	readonly verification?: StepStatus;
	readonly requirements?: StepStatus;
	/** The agent's overall verdict, carried into the summary. */
	readonly verdict?: string;
};

const MAX_PENDING_LISTED = 12;

/** A finding is in a group when its file is, and (for one part of a large file) its line is in that part. */
export const belongsToGroup = (
	group: Pick<GroupProgress, 'files' | 'span'>,
	finding: Pick<ReviewFinding, 'path' | 'startLine'>,
): boolean =>
	group.files.includes(finding.path) &&
	(!group.span || (finding.startLine >= group.span.start && finding.startLine <= group.span.end));

const allGroupsDone = (progress: Pick<ReviewProgress, 'groups'>): boolean =>
	progress.groups.every((g) => g.status === 'done');

/** Recompute `complete`: every group done and no step still pending. */
const settle = (progress: ReviewProgress): ReviewProgress => ({
	...progress,
	complete: allGroupsDone(progress) && progress.verification !== 'pending' && progress.requirements !== 'pending',
});

export const reviewStage = (progress: ReviewProgress): ReviewStage => {
	if (!allGroupsDone(progress)) return 'groups';
	if (progress.verification === 'pending') return 'verification';
	if (progress.requirements === 'pending') return 'requirements';
	return 'done';
};

export const awaitingVerification = (progress: ReviewProgress): boolean => reviewStage(progress) === 'verification';

export const awaitingRequirements = (progress: ReviewProgress): boolean => reviewStage(progress) === 'requirements';

export const initProgress = (units: ReviewUnitsView, requirements?: StepStatus): ReviewProgress =>
	settle({
		groups: units.groups.map((g, index) => ({
			index,
			label: g.label,
			files: [...g.files],
			ruleDocId: g.ruleDocId,
			rulePattern: g.rulePattern,
			...(g.span ? { span: g.span } : {}),
			status: 'pending',
			findingCount: 0,
		})),
		findings: [],
		activeGroupIndex: null,
		complete: false,
		...(requirements ? { requirements } : {}),
	});

const withGroupStatus = (progress: ReviewProgress, groupIndex: number, status: GroupStatus): ReviewProgress => ({
	...progress,
	groups: progress.groups.map((g) => (g.index === groupIndex ? { ...g, status } : g)),
});

/** Make a group the active one (any order, e.g. parallel subagents). A done group stays done until resubmitted. */
export const activateGroup = (progress: ReviewProgress, groupIndex: number): ReviewProgress => {
	const group = progress.groups.find((g) => g.index === groupIndex);
	if (!group) return progress;
	const next = group.status === 'pending' ? withGroupStatus(progress, groupIndex, 'reviewing') : progress;
	return settle({ ...next, activeGroupIndex: groupIndex });
};

/** Idempotent: keeps the group under review, else starts the first pending one. */
export const activateNextGroup = (progress: ReviewProgress): ReviewProgress => {
	const active = progress.groups.find((g) => g.index === progress.activeGroupIndex);
	if (active?.status === 'reviewing') return progress;
	const next = progress.groups.find((g) => g.status === 'pending');
	if (!next) return settle({ ...progress, activeGroupIndex: null });
	return activateGroup(progress, next.index);
};

/** Record a group's findings and mark it done. Findings outside the group are returned, not kept. */
export const completeGroup = (
	progress: ReviewProgress,
	input: {
		readonly groupIndex: number;
		readonly newFindings: readonly ReviewFinding[];
		readonly replaceGroupFindings?: boolean;
	},
): { readonly progress: ReviewProgress; readonly rejectedOutsideGroup: readonly ReviewFinding[] } => {
	const group = progress.groups.find((g) => g.index === input.groupIndex);
	if (!group) return { progress, rejectedOutsideGroup: [...input.newFindings] };
	const accepted = input.newFindings.filter((f) => belongsToGroup(group, f));
	const rejectedOutsideGroup = input.newFindings.filter((f) => !belongsToGroup(group, f));
	const kept = input.replaceGroupFindings
		? progress.findings.filter((f) => !belongsToGroup(group, f))
		: progress.findings;
	const findings = [...kept, ...accepted];
	const findingCount = findings.filter((f) => belongsToGroup(group, f)).length;
	return {
		progress: settle({
			...progress,
			findings,
			groups: progress.groups.map((g) => (g.index === input.groupIndex ? { ...g, status: 'done', findingCount } : g)),
			activeGroupIndex: progress.activeGroupIndex === input.groupIndex ? null : progress.activeGroupIndex,
		}),
		rejectedOutsideGroup,
	};
};

/**
 * Once every group is done, findings need a verdict each: the step is pending until all have one.
 * No findings → no step. While groups remain, the step is not set yet.
 */
export const withVerificationStep = (progress: ReviewProgress): ReviewProgress => {
	const { verification: _previous, ...rest } = progress;
	if (!allGroupsDone(progress) || progress.findings.length === 0) return settle(rest);
	return settle({ ...rest, verification: progress.findings.every((f) => f.verdict) ? 'done' : 'pending' });
};

/** Set (or drop, with `undefined`) the ticket-criteria step. */
export const withRequirementsStep = (progress: ReviewProgress, status: StepStatus | undefined): ReviewProgress => {
	const { requirements: _previous, ...rest } = progress;
	return settle(status ? { ...rest, requirements: status } : rest);
};

/** Sorted line numbers as compact ranges: [9, 1, 2, 3, 7, 10] → "1-3, 7, 9-10". */
export const lineRanges = (lines: readonly number[]): string => {
	const sorted = [...new Set(lines)].sort((a, b) => a - b);
	const ranges: [number, number][] = [];
	for (const line of sorted) {
		const last = ranges.at(-1);
		if (last && line === last[1] + 1) last[1] = line;
		else ranges.push([line, line]);
	}
	return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(', ');
};

const groupRef = (g: Pick<GroupProgress, 'index' | 'label'>): string => `[${g.index}] ${g.label}`;

/** A few lines however many groups: counts, the groups in review, the next pending ones, open steps. */
export const coverageSummary = (progress: ReviewProgress): string => {
	const done = progress.groups.filter((g) => g.status === 'done').length;
	const reviewing = progress.groups.filter((g) => g.status === 'reviewing');
	const pending = progress.groups.filter((g) => g.status === 'pending');
	const steps = [
		...(progress.verification ? [`verification=${progress.verification}`] : []),
		...(progress.requirements ? [`requirements=${progress.requirements}`] : []),
	];
	const more = pending.length - MAX_PENDING_LISTED;
	return [
		`Coverage: ${done}/${progress.groups.length} groups done · ${progress.findings.length} finding(s) · complete=${progress.complete}`,
		reviewing.length ? `In review: ${reviewing.map(groupRef).join(', ')}` : '',
		pending.length
			? `Pending: ${pending.slice(0, MAX_PENDING_LISTED).map(groupRef).join(', ')}${more > 0 ? `, +${more} more` : ''}`
			: '',
		steps.length ? `Steps: ${steps.join(' · ')}` : '',
	]
		.filter(Boolean)
		.join('\n');
};

export type GroupBrief = {
	readonly group?: GroupProgress & { readonly ruleMarkdown: string };
	readonly rightLinesByPath: Readonly<Record<string, readonly number[]>>;
	readonly instruction: string;
};

/** The active group to review: its files, commentable (RIGHT-side) lines and what to do with it. */
export const nextGroupBrief = (progress: ReviewProgress, units: ReviewUnitsView | undefined): GroupBrief => {
	const active = progress.groups.find((g) => g.index === progress.activeGroupIndex && g.status === 'reviewing');
	if (!active) return { rightLinesByPath: {}, instruction: '' };
	const rightLinesByPath: Record<string, readonly number[]> = {};
	for (const file of active.files) {
		const lines = (units?.rightLinesByPath[file] ?? []).filter(
			(l) => !active.span || (l >= active.span.start && l <= active.span.end),
		);
		rightLinesByPath[file] = lines;
	}
	const commentable = active.files.map((f) => `${f} ${lineRanges(rightLinesByPath[f] ?? []) || '(none)'}`).join('; ');
	const part = active.span ? ` (lines ${active.span.start}-${active.span.end})` : '';
	return {
		group: { ...active, ruleMarkdown: units?.groups[active.index]?.ruleMarkdown ?? '' },
		rightLinesByPath,
		instruction: [
			`Review group ${groupRef(active)}${part}: ${active.files.length} file(s). Apply the rules checklist to its diff.`,
			`Comment only on these lines (RIGHT side): ${commentable}.`,
			'Read other code with pr_review_read_file / pr_review_search (the PR version, not the local checkout) when the diff is not enough.',
			`Then call pr_review_submit_findings with groupIndex ${active.index} (an empty findings array if the group is clean).`,
		].join('\n'),
	};
};
