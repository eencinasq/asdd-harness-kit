import type { ArchitectureReviewView } from './architecture/architecture.types.ts';
import type { ReviewProfile } from './engine/profile.ts';
import type { ExcludeReason, LineSpan, ReviewFinding } from './engine/types.ts';
import type { RequirementsState } from './requirements/requirements.types.ts';
import type { PrRisk } from './risk/file-risk.ts';

export const REVIEW_EVENTS = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] as const;
export type ReviewEvent = (typeof REVIEW_EVENTS)[number];

export const INLINE_WORD_LIMIT = 80;
export const SUMMARY_WORD_LIMIT = 350;

/** Where review artifacts (report/comments) are stored — not a git worktree. */
export type ReviewLocation = 'repo-dir' | 'fallback';

export type ReviewRevision = {
	readonly revision: number;
	readonly head_sha: string;
	readonly base_sha: string;
	readonly date: string;
	readonly published: boolean;
	readonly review_url?: string;
};

export type ReviewState = {
	readonly pr: number;
	readonly repo: string;
	readonly base: string;
	readonly review_count: number;
	readonly current: ReviewRevision;
	readonly history: readonly ReviewRevision[];
};

export type ResolvedPaths = {
	readonly repoRoot: string;
	readonly project: string;
	readonly location: ReviewLocation;
	readonly base: string;
	readonly report: string;
	readonly comments: string;
	readonly diff: string;
	readonly units: string;
	readonly progress: string;
	readonly architecture: string;
	readonly requirements: string;
	/** PR risk ranking (spec-drift-depth REQ-002). */
	readonly risk: string;
	readonly existingComments: string;
	readonly state: string;
	readonly rotated: string;
	readonly previousHeadSha: string;
	readonly previousBaseSha: string;
	readonly previousReports: readonly string[];
};

/** Compact snapshot of the prepared review for agents / UI (no full per-file patches). */
export type ReviewUnitsView = {
	readonly fileCount: number;
	readonly selectedCount: number;
	readonly groups: readonly {
		readonly label: string;
		readonly files: readonly string[];
		readonly ruleDocId: string;
		readonly rulePattern: string;
		/** Full rule checklist markdown for this group. */
		readonly ruleMarkdown: string;
		/** One part of a large file: the new-side lines its hunks cover. */
		readonly span?: LineSpan;
	}[];
	readonly skipped: readonly { readonly path: string; readonly reason: ExcludeReason }[];
	readonly rightLinesByPath: Readonly<Record<string, readonly number[]>>;
	/** Deterministic findings (no model), e.g. a committed secrets file. */
	readonly checks?: readonly ReviewFinding[];
	/** The repo's review profile in effect (from `.pr-review.yml` on the base branch). */
	readonly profile?: ReviewProfile;
};

export type LiveFinding = {
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly content: string;
	readonly severity?: string;
	readonly category?: string;
	readonly groupIndex?: number;
	readonly confidence?: number;
	readonly verdict?: 'confirmed' | 'plausible' | 'rejected';
	readonly verifyNote?: string;
};

export type LiveGroupStatus = {
	readonly index: number;
	readonly label: string;
	readonly files: readonly string[];
	readonly status: 'pending' | 'reviewing' | 'done';
	readonly findingCount: number;
	readonly ruleDocId?: string;
	readonly rulePattern?: string;
};

/** Interactive session progress (group-by-group). */
export type LiveProgressView = {
	readonly groups: readonly LiveGroupStatus[];
	readonly findings: readonly LiveFinding[];
	readonly activeGroupIndex: number | null;
	readonly complete: boolean;
	readonly doneCount: number;
	readonly totalCount: number;
	/** The verify-findings step, counted in doneCount / totalCount. */
	readonly verification?: 'pending' | 'done';
	/** The ticket-criteria step, counted in doneCount / totalCount. */
	readonly requirements?: 'pending' | 'done';
};

export type InlineComment = {
	readonly path: string;
	readonly line: number;
	readonly side: 'RIGHT';
	readonly body: string;
	readonly start_line?: number;
	readonly start_side?: 'RIGHT';
};

export type ParsedComments = {
	readonly meta: {
		readonly pr: string;
		readonly repo: string;
		readonly head_sha: string;
		readonly event: ReviewEvent;
		readonly [key: string]: string;
	};
	readonly comments: readonly InlineComment[];
	readonly summary: string;
};

export type CommentChangeKind = 'unchanged' | 'edited' | 'added' | 'removed';

export type CommentChange = {
	readonly kind: CommentChangeKind;
	readonly key: string;
	readonly similarity?: number;
	readonly originalBody?: string;
	readonly currentBody?: string;
	readonly diff?: string;
};

export type CommentsCheck = {
	readonly warnings: readonly string[];
	readonly eventChanged: boolean;
	readonly previousEvent?: string;
	readonly currentEvent?: string;
	readonly changes: readonly CommentChange[];
	readonly summaryChange: CommentChange;
	readonly hasOriginal: boolean;
};

export type PrMetadata = {
	readonly number: number;
	readonly title: string;
	readonly baseRefName: string;
	readonly headRefName: string;
	readonly headRefOid: string;
	readonly url: string;
	readonly author: string;
	readonly files: readonly string[];
	/** PR description (ticket references like `Closes #45` live here). */
	readonly body?: string;
};

export type PrReviewView = {
	readonly kind: 'pr-review';
	readonly pr: number;
	readonly phase: 'prepared' | 'draft' | 'published' | 'needsConfirmation' | 'reviewing';
	readonly paths: ResolvedPaths;
	readonly state: ReviewState;
	readonly metadata?: PrMetadata;
	readonly context?: string;
	readonly prompt?: string;
	/** Full PR diff text (may be large). Also written to paths.diff. */
	readonly diff?: string;
	readonly units?: ReviewUnitsView;
	readonly progress?: LiveProgressView;
	/** Per-project architecture scan (or missing-config + generatePrompt). */
	readonly architecture?: ArchitectureReviewView;
	/** Ticket criteria and their verification (when the review has a ticket). */
	readonly requirements?: RequirementsState;
	/** Changed files ranked by risk: where to read first (spec-drift-depth REQ-002). */
	readonly risk?: PrRisk;
	/** Ticket references found in the PR when no ticket was given (e.g. MLC-123, #45). */
	readonly ticketRefs?: readonly { readonly source: string; readonly ref: string; readonly foundIn: string }[];
	/** Current group the agent should review (from pr_review_next_group). */
	readonly nextGroup?: {
		readonly index: number;
		readonly label: string;
		readonly files: readonly string[];
		readonly rightLinesByPath: Readonly<Record<string, readonly number[]>>;
		readonly instruction: string;
		readonly ruleDocId: string;
		readonly rulePattern: string;
		readonly ruleMarkdown: string;
	};
	readonly reportMarkdown?: string;
	readonly commentsMarkdown?: string;
	readonly parsed?: ParsedComments;
	readonly check?: CommentsCheck;
	readonly reviewUrl?: string;
	readonly warnings?: readonly string[];
	readonly message: string;
};
