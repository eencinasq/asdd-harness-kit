/** Shapes shared by the audit tools and the audit dashboard. Findings come from the vendored asdd harness (src/harness). */

export type AuditSeverity = 'fail' | 'warn' | 'advisory';

export type AuditFinding = {
	readonly id: string;
	readonly check: string;
	readonly severity: AuditSeverity | string;
	readonly message: string;
	readonly paths?: readonly string[];
	/** Set when the UI trimmed `paths` to fit the size budget. */
	readonly paths_total?: number;
	readonly line?: number;
	readonly slice_id?: string | null;
	readonly node?: string | null;
	readonly source?: 'computational' | 'inferential' | string;
	readonly rule?: string;
	readonly code?: string;
	readonly fix?: string;
	readonly remediation?: string;
	readonly verdict?: string;
	readonly recurring?: boolean;
	readonly occurrences?: number;
	readonly first_seen?: string;
	readonly last_seen?: string;
	/** Set by the view for verify_spec_compliance results. */
	readonly adapter?: string;
};

export type KnowledgeNode = { readonly id: string; readonly title?: string; readonly [key: string]: unknown };
export type KnowledgeEdge = { readonly from: string; readonly rel: string; readonly to: string };

export type Trace = {
	readonly start: string;
	readonly nodes: KnowledgeNode[];
	readonly edges: KnowledgeEdge[];
};

/** Any audit tool result: a JSON object, `{ error }` when the call failed. */
export type AuditPayload = Record<string, unknown> & { readonly error?: string; readonly findings?: AuditFinding[] };

/** Nothing to show, why, and the next step: not an error (spec-drift-empty REQ-004). */
export type NoData = { readonly reason: string; readonly next: string };

/** Counts and the token for a result cut to fit the MCP App budget. */
export type FindingsPage = {
	readonly tool: string;
	readonly token: string;
	readonly offset: number;
	readonly count: number;
	readonly total: number;
	readonly by_severity: Record<string, number>;
	readonly by_source: Record<string, number>;
	readonly hint: string;
};

export type AuditToolName =
	| 'audit_diff'
	| 'verify_architecture_rules'
	| 'verify_spec_compliance'
	| 'generate_ci_gate'
	| 'audit_report'
	| 'audit_finding';
