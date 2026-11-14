/** Data model of the review engine: file diffs, decisions, groups, findings. */

export type FileDiff = {
	readonly oldPath: string;
	readonly newPath: string;
	readonly diff: string;
	readonly isBinary: boolean;
	readonly isDeleted: boolean;
	readonly isNew: boolean;
	readonly isRenamed: boolean;
	readonly insertions: number;
	readonly deletions: number;
};

export type HunkLineType = 'context' | 'added' | 'deleted';

export type HunkLine = {
	readonly type: HunkLineType;
	readonly content: string;
};

export type Hunk = {
	readonly oldStart: number;
	readonly oldCount: number;
	readonly newStart: number;
	readonly newCount: number;
	readonly lines: readonly HunkLine[];
};

export const EXCLUDE_REASONS = [
	'none',
	'binary',
	'deleted',
	'secret',
	'extension',
	'default-path',
	'too-large',
	'profile',
] as const;
export type ExcludeReason = (typeof EXCLUDE_REASONS)[number];

export type FileDecision = {
	readonly diff: FileDiff;
	readonly reason: ExcludeReason;
	readonly path: string;
};

/** New-side (RIGHT) lines a review group covers, when it holds only part of a large file. */
export type LineSpan = { readonly start: number; readonly end: number };

export type FileGroup = {
	readonly label: string;
	readonly files: readonly string[];
	readonly diffs: readonly FileDiff[];
	/** Rule doc id (e.g. ts_js_tsx_jsx.md). */
	readonly ruleDocId: string;
	/** Glob pattern that selected the rule, or "default". */
	readonly rulePattern: string;
	/** Full rule checklist markdown for this group. */
	readonly ruleMarkdown: string;
	/** Set when the group is one part of a large file: the lines its hunks cover. */
	readonly span?: LineSpan;
};

export const FINDING_CATEGORIES = [
	'bug',
	'security',
	'performance',
	'maintainability',
	'test',
	'style',
	'documentation',
	'other',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** Structured finding the agent returns. */
export type ReviewFinding = {
	readonly path: string;
	readonly content: string;
	readonly suggestionCode?: string;
	readonly existingCode?: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly category?: FindingCategory;
	readonly severity?: FindingSeverity;
	readonly thinking?: string;
	/** Reviewer's confidence that this is a real defect, 0–100 (spec-drift extension). */
	readonly confidence?: number;
	/** Why it is real: the code path, input or caller that triggers it (spec-drift extension). */
	readonly evidence?: string;
	/** Result of the verification pass (spec-drift extension). */
	readonly verdict?: 'confirmed' | 'plausible' | 'rejected';
	readonly verifyNote?: string;
	/** Checklist item it breaks, e.g. `python.mutable-default-arguments` (see system-rules.ts). */
	readonly ruleId?: string;
	/** Stable across reviews: path + rule + anchored code, not the line number (see resolve.ts). */
	readonly fingerprint?: string;
	/** Found by a deterministic check (no model), e.g. a committed secrets file. Not re-verified. */
	readonly source?: 'model' | 'check';
};

/** A file the review could not look at, and why (it keeps the review from suggesting APPROVE). */
export type CoverageGap = { readonly path: string; readonly reason: ExcludeReason };

export type PrepareResult = {
	readonly files: readonly FileDiff[];
	readonly decisions: readonly FileDecision[];
	readonly selected: readonly FileDiff[];
	readonly groups: readonly FileGroup[];
	readonly rightLinesByPath: Readonly<Record<string, readonly number[]>>;
	readonly skipped: readonly { readonly path: string; readonly reason: ExcludeReason }[];
	/** Findings of the deterministic checks (see checks.ts). */
	readonly checks: readonly ReviewFinding[];
};
