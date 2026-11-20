import type { ArchitectureFinding } from '../architecture/architecture.types.ts';

/** Confirmed guided-audit finding with stable fingerprint for inbox keys (REQ-028 / REQ-029). */
export type GuidedAuditFinding = ArchitectureFinding & {
	readonly fingerprint: string;
};

export type GuidedAuditStatus = 'idle' | 'in_progress' | 'synced' | 'error';

/**
 * PR-linked view of a cloudflare/security-audit-skill run (pr-review-dashboard-ux REQ-027…029).
 * Only confirmed findings with file:line anchors are listed.
 */
export type GuidedAuditView = {
	readonly status: GuidedAuditStatus;
	readonly runId?: string;
	readonly findingCount: number;
	readonly findings: readonly GuidedAuditFinding[];
	readonly coverage?: { readonly reviewed: number; readonly total: number };
	readonly message: string;
	/** Host-agent prompt after start (or continue). */
	readonly auditPrompt?: string;
};
