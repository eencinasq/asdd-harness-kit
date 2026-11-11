/**
 * Ticket-driven requirements check: the acceptance criteria (AC) and definition of done (DoD) of the
 * ticket a PR implements, and the verdict for each one after the review groups.
 */

export const TICKET_SOURCES = ['jira', 'linear', 'github', 'text'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const CRITERION_KINDS = ['acceptance', 'done'] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

/** `pending` until verified; `unverifiable` = the diff alone cannot prove it (runtime, UX, ops). */
export const CRITERION_STATUSES = ['pending', 'met', 'partial', 'unmet', 'unverifiable'] as const;
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];
export type VerdictStatus = Exclude<CriterionStatus, 'pending'>;

export type Ticket = {
	readonly source: TicketSource;
	/** Key / number as given: `MLC-123`, `#45`, `acme/api#45`, `ENG-7`. */
	readonly ref?: string;
	readonly title?: string;
	readonly url?: string;
	/** The ticket body the criteria come from (untrusted input; truncated). */
	readonly text: string;
};

export type Criterion = {
	/** `AC-1`, `AC-2`… for acceptance criteria, `DOD-1`… for the definition of done. */
	readonly id: string;
	readonly kind: CriterionKind;
	readonly text: string;
};

export type CriterionResult = Criterion & {
	readonly status: CriterionStatus;
	/** `path:line` (or `path`) locations in the PR that support the verdict. */
	readonly evidence: readonly string[];
	readonly note?: string;
	/** Who set the status last: the agent's verification or a human in the dashboard. */
	readonly by?: 'agent' | 'human';
};

/** Facts read straight from the diff, so DoD items like "has tests" don't depend on the model. */
export type DoneSignals = {
	readonly testFiles: readonly string[];
	readonly docFiles: readonly string[];
	readonly migrationFiles: readonly string[];
	readonly configFiles: readonly string[];
};

export type RequirementsState = {
	readonly ticket: Ticket;
	readonly criteria: readonly CriterionResult[];
	readonly signals: DoneSignals;
	/** `pending` until pr_review_submit_requirements; blocks publish like an unreviewed group. */
	readonly status: 'pending' | 'done';
	/** Changes the agent found that no criterion explains (scope creep or a stale ticket). */
	readonly unrelatedChanges: readonly string[];
	readonly summary?: string;
	readonly verifiedAt?: string;
};

/** A ticket reference spotted in the PR title, branch or body (when no ticket was passed). */
export type TicketRef = {
	readonly source: 'github' | 'jira-or-linear';
	readonly ref: string;
	readonly foundIn: 'title' | 'branch' | 'body';
};
