/**
 * Pure view logic for the audit dashboard (no DOM), unit-tested with node --test.
 * Payloads are the JSON results of the audit tools (src/audit), possibly cut to the MCP App size budget.
 */
import type { AuditFinding, KnowledgeEdge, KnowledgeNode } from '../../src/audit/audit.types.ts';

export const SEVERITIES = ['fail', 'warn', 'advisory'] as const;

// biome-ignore lint/suspicious/noExplicitAny: tool payloads are open JSON from the harness scripts.
export type Payload = Record<string, any>;

export type Kind = 'diff' | 'compliance' | 'audit' | 'architecture' | 'finding' | 'ci';
export type Mode = 'author' | 'review';
export type Level = 'blocking' | 'warning' | 'clean' | 'unknown';

export type Check = { id: string; status: string; message?: string; label?: string };

export type ArchitectureDetails = {
	status: string;
	command: string | null;
	binding: string | null;
	exit_code?: number;
	output: string | null;
	output_truncated: boolean;
	message: string | null;
	sources: Array<{ id: string; path: string; filled: boolean; text?: string }>;
};

export type Details = {
	meta: Array<[string, string]>;
	notes: string[];
	commands: Array<{ name: string; command?: string; status: string; exit_code?: number; output?: string }>;
	reports: string[];
	recurring: number;
	suppressed: Array<{ id: string; check: string }>;
	architecture: ArchitectureDetails | null;
};

export type Hotspot = { path: string; score: number; churn: number; req_links: number; findings: number };

export type ViewModel = {
	kind: Kind;
	error?: string;
	findings: AuditFinding[];
	summary: Payload;
	checks: Check[];
	ci?: { provider: string; path: string; content: string; note?: string };
	trace?: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } | null;
	level?: Level;
	showCompliance?: boolean;
	sources?: { computational: number; inferential: number } | null;
	counts?: Record<string, number>;
	total?: number;
	loaded?: number;
	details?: Details;
	suppressed?: number;
	adapters?: Check[];
	hotspots?: Hotspot[];
	unconfigured?: string[];
	semgrep?: Payload | null;
};

export type Action = { id: 'task' | 'comment' | 'dismiss'; label: string; needsReason?: boolean };

/** Payload of a CallToolResult: structuredContent, else the JSON text fallback. */
export const payloadOf = (result: unknown): Payload | null => {
	const r = result as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> } | null;
	if (r?.structuredContent && typeof r.structuredContent === 'object') return r.structuredContent as Payload;
	const text = r?.content?.find?.((c) => c.type === 'text')?.text;
	if (!text) return null;
	try {
		return JSON.parse(text) as Payload;
	} catch {
		return null;
	}
};

/** Which tool produced the payload. */
export const kindOf = (payload: Payload | null): Kind | null => {
	if (!payload) return null;
	if (payload['finding']) return 'finding';
	if (payload['provider'] && 'content' in payload) return 'ci';
	if (payload['adapters']) return 'compliance';
	if (payload['hotspots'] || payload['reports']) return 'audit';
	if (payload['semgrep'] && !payload['mode']) return 'architecture';
	return 'diff';
};

/** author for engineers, review for the Tech Lead. */
export const resolveMode = (toolName: string | null, args: Payload | undefined, payload: Payload | null): Mode => {
	const mode = args?.['mode'] ?? payload?.['mode'];
	if (mode === 'author' || mode === 'review') return mode;
	return toolName === 'audit_report' ? 'review' : 'author';
};

const severityRank = (s: string): number => SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]);

const bySeverity = (a: AuditFinding, b: AuditFinding): number =>
	severityRank(a.severity) - severityRank(b.severity) || String(a.check).localeCompare(String(b.check));

const STATUS_LEVEL: Record<string, Level> = {
	fail: 'blocking',
	error: 'warning',
	unconfigured: 'warning',
	pass: 'clean',
};

const gateStatus = (payload: Payload): string => {
	if (!payload['command']) return 'unconfigured';
	if (payload['exit_code'] === 0) return 'pass';
	return typeof payload['exit_code'] === 'number' ? 'fail' : 'error';
};

/** One status pill per check that ran (or did not), as spec compliance does with its adapters. */
const checksOf = (kind: Kind, payload: Payload, findings: AuditFinding[], semgrep: Payload | null): Check[] => {
	const semgrepCheck: Check[] = semgrep
		? [{ id: 'semgrep', status: semgrep['status'], message: semgrep['message'] }]
		: [];
	if (kind === 'compliance') {
		return Object.entries(payload['adapters'] as Record<string, Payload>).map(([id, r]) => ({
			id,
			status: r['status'],
			message: r['message'],
		}));
	}
	if (kind === 'architecture') {
		return [
			{ id: 'gate', status: gateStatus(payload), message: payload['command'] ?? payload['binding'] },
			...semgrepCheck,
		];
	}
	if (kind === 'audit') {
		const verdicts = findings.filter((f) => f.source === 'inferential').length;
		return [
			...((payload['commands'] ?? []) as Payload[]).map((c) => ({
				id: c['name'],
				status: c['status'],
				message: c['command'],
			})),
			...semgrepCheck,
			{
				id: 'inferential',
				status: verdicts ? 'pass' : 'unconfigured',
				label: verdicts ? `inferential: ${verdicts} verdict${verdicts === 1 ? '' : 's'}` : 'inferential: not run',
				message: 'codebase-audit skill',
			},
		];
	}
	return payload['architecture']
		? [
				{ id: 'architecture', status: payload['architecture'].status, message: payload['architecture'].message },
				...semgrepCheck,
			]
		: semgrepCheck;
};

const levelOf = (kind: Kind, payload: Payload, checks: Check[]): Level => {
	if (payload['summary']?.drift_level) return payload['summary'].drift_level;
	if (kind === 'architecture') return STATUS_LEVEL[payload['status']] ?? 'unknown';
	if (checks.some((c) => c.status === 'fail')) return 'blocking';
	if (checks.some((c) => c.status === 'error')) return 'warning';
	return checks.length ? 'clean' : 'unknown';
};

/** Append a page result (tool called with page_token) to a payload that the server cut to fit the size budget. */
export const mergePage = (payload: Payload | null, page: Payload | null): Payload | null => {
	if (!payload?.['page'] || !Array.isArray(page?.['findings'])) return payload;
	const findings = payload['findings'] as AuditFinding[];
	const seen = new Set(findings.map((f) => f.id));
	const more = (page['findings'] as AuditFinding[]).filter((f) => !seen.has(f.id));
	return {
		...payload,
		findings: [...findings, ...more],
		page: { ...payload['page'], count: findings.length + more.length },
	};
};

/** Next page offset, or null when every finding is loaded. */
export const nextOffset = (payload: Payload | null): number | null => {
	const p = payload?.['page'];
	return p && p.count < p.total ? p.count : null;
};

const architectureOf = (kind: Kind, payload: Payload): ArchitectureDetails | null => {
	const arch = kind === 'architecture' ? payload : payload['architecture'];
	if (!arch) return null;
	return {
		status: arch.status,
		command: arch.command ?? null,
		binding: arch.binding ?? null,
		exit_code: arch.exit_code,
		output: arch.output ?? null,
		output_truncated: Boolean(arch.output_truncated ?? payload['output_truncated']),
		message: arch.message ?? null,
		sources: arch.sources ?? [],
	};
};

/** Everything in the payload besides findings, checks, and summary, so the view can show it. */
const detailsOf = (kind: Kind, payload: Payload): Details => {
	const recurring = payload['recurring'];
	return {
		meta: Object.entries({
			generated: payload['generated_at'],
			commit: payload['commit'],
			report: payload['path'],
			mode: kind === 'diff' ? payload['mode'] : undefined,
			slice: payload['slice_id'],
		}).filter((entry): entry is [string, string] => Boolean(entry[1])),
		notes: payload['notes'] ?? [],
		commands: payload['commands'] ?? [],
		reports: payload['reports'] ?? [],
		recurring: Array.isArray(recurring) ? recurring.length : (recurring ?? 0),
		suppressed: payload['suppressed'] ?? [],
		architecture: architectureOf(kind, payload),
	};
};

const totalsOf = (payload: Payload, findings: AuditFinding[]) => {
	const pageCounts = payload['page']?.by_severity as Record<string, number> | undefined;
	const counts = Object.fromEntries(
		SEVERITIES.map((s) => [s, pageCounts ? (pageCounts[s] ?? 0) : findings.filter((f) => f.severity === s).length]),
	);
	return { counts, total: (payload['page']?.total as number | undefined) ?? findings.length };
};

export const viewModel = (payload: Payload | null): ViewModel | null => {
	const kind = kindOf(payload);
	if (!kind || !payload) return null;
	if (payload['error']) return { kind, error: String(payload['error']), findings: [], summary: {}, checks: [] };
	if (kind === 'ci') {
		return {
			kind,
			ci: {
				provider: payload['provider'],
				path: payload['suggested_path'],
				content: payload['content'],
				note: payload['note'],
			},
			findings: [],
			summary: {},
			checks: [],
		};
	}
	if (kind === 'finding') {
		return { kind, findings: [payload['finding']], trace: payload['trace'] ?? null, summary: {}, checks: [] };
	}
	const findings: AuditFinding[] =
		kind === 'compliance'
			? Object.entries(payload['adapters'] as Record<string, Payload>).flatMap(([adapter, r]) =>
					((r['findings'] ?? []) as AuditFinding[]).map((f) => ({ ...f, adapter })),
				)
			: (payload['findings'] ?? []);
	const { counts, total } = totalsOf(payload, findings);
	const recurringIds = new Set(Array.isArray(payload['recurring']) ? (payload['recurring'] as string[]) : []);
	const semgrep: Payload | null = payload['semgrep'] ?? payload['architecture']?.semgrep ?? null;
	const checks = checksOf(kind, payload, findings, semgrep);
	const summary: Payload =
		kind === 'compliance'
			? {
					...payload['summary'],
					spec_compliance: payload['summary']?.spec_compliance ?? payload['adapters'].ears?.spec_compliance,
				}
			: (payload['summary'] ?? {});
	const inferential: number =
		payload['page']?.by_source?.inferential ?? findings.filter((f) => f.source === 'inferential').length;
	return {
		kind,
		checks,
		level: levelOf(kind, payload, checks),
		showCompliance: kind !== 'architecture',
		sources: inferential ? { computational: total - inferential, inferential } : null,
		summary,
		findings: findings.map((f) => (recurringIds.has(f.id) ? { ...f, recurring: true } : f)).sort(bySeverity),
		counts,
		total,
		loaded: findings.length,
		details: detailsOf(kind, payload),
		suppressed: payload['suppressed']?.length ?? 0,
		adapters:
			kind === 'compliance'
				? Object.entries(payload['adapters'] as Record<string, Payload>).map(([id, r]) => ({
						id,
						status: r['status'],
						message: r['message'],
					}))
				: [],
		hotspots: payload['hotspots'] ?? [],
		unconfigured: [
			...new Set<string>([
				...((payload['unconfigured'] ?? []) as string[]),
				...(payload['architecture']?.status === 'unconfigured' ||
				(payload['status'] === 'unconfigured' && kind === 'architecture')
					? ['architecture']
					: []),
				...(semgrep?.['status'] === 'unconfigured' && kind === 'architecture' ? ['semgrep'] : []),
				...(semgrep?.['status'] === 'unavailable' ? ['semgrep'] : []),
			]),
		],
		semgrep,
	};
};

export const actionsFor = (mode: Mode): Action[] =>
	mode === 'review'
		? [
				{ id: 'comment', label: 'Draft comment' },
				{ id: 'dismiss', label: 'Dismiss…', needsReason: true },
			]
		: [{ id: 'task', label: 'Send to agent as task' }];

const describe = (f: AuditFinding): string => {
	const files = f.paths?.length ? `\nFiles: ${f.paths.join(', ')}${f.line ? `:${f.line}` : ''}` : '';
	const node = f.node ? `\nNode: ${f.node}` : '';
	const rule = f.rule ? `\nRule: ${f.rule}` : '';
	const fix = f.fix ? `\nFix:\n${f.fix}` : '';
	const remediation = f.remediation ? `\nRemediation: ${f.remediation}` : '';
	return `${f.id} (${f.check}, ${f.severity}): ${f.message}${files}${node}${rule}${fix}${remediation}`;
};

/** Text the view sends to the host chat (ui/message). The view never changes files itself. */
export const messageFor = (
	actionId: Action['id'],
	finding: AuditFinding,
	{ reason }: { reason?: string } = {},
): string => {
	switch (actionId) {
		case 'task':
			return `Fix spec drift finding ${describe(finding)}\n\nWork inside the active slice: change only files mapped by its intent, design, tasks, or spec, or by feature scope_paths. If the change is intended, map the file in the slice instead of reverting it. Run audit_diff again when done.`;
		case 'comment':
			return `Draft a pull request review comment for finding ${describe(finding)}\n\nCite the requirement or rule it breaks, with file and line. Do not post it; show me the draft.`;
		case 'dismiss':
			return `Record a Tech Lead dismissal for finding ${finding.id} (${finding.check}). Run:\nasdd triage ${finding.id} --dismiss --reason ${JSON.stringify(reason ?? '')}\n\nThe dismissal holds until the finding's files change.`;
		default:
			throw new Error(`unknown action ${String(actionId)}`);
	}
};

/** Text for a trace with no nodes: no knowledge index, or a finding with no graph node. */
export const traceSummary = (trace: { indexed?: boolean }): string =>
	trace.indexed
		? 'No linked requirements or features in the knowledge graph.'
		: 'No knowledge index or no graph node for this finding (run asdd knowledge sync).';

export const percent = (value: unknown): string => (typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a');
