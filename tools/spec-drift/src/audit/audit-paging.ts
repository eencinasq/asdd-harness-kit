import type { AuditFinding, AuditPayload, FindingsPage } from './audit.types.ts';

/**
 * Cursor moves tool results larger than about 13 KB into a file and then does not mount the MCP App, so audit
 * results stay under this budget and the view pages in the rest through the same tool.
 */
export const UI_RESULT_BUDGET = 8000;
const UI_PATHS_PER_FINDING = 5;
const PAGE_STORE_MAX = 20;

const jsonSize = (value: unknown): number => JSON.stringify(value, null, 2).length;

const tally = (findings: readonly AuditFinding[], keyOf: (f: AuditFinding) => string): Record<string, number> => {
	const counts: Record<string, number> = {};
	for (const f of findings) {
		const key = keyOf(f);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
};

const trimPaths = (f: AuditFinding): AuditFinding =>
	f.paths && f.paths.length > UI_PATHS_PER_FINDING
		? { ...f, paths: f.paths.slice(0, UI_PATHS_PER_FINDING), paths_total: f.paths.length }
		: f;

/** Longest prefix of findings that keeps `{ ...base, findings }` within the budget (at least one). */
const fitFindings = (
	base: Record<string, unknown>,
	findings: readonly AuditFinding[],
	budget = UI_RESULT_BUDGET,
): AuditFinding[] => {
	let lo = 0;
	let hi = findings.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (jsonSize({ ...base, findings: findings.slice(0, mid) }) <= budget) lo = mid;
		else hi = mid - 1;
	}
	return findings.slice(0, Math.max(lo, Math.min(1, findings.length)));
};

/** Full finding lists of cut results, by token. Bounded: the oldest token expires first. */
export class FindingsPageStore {
	private readonly pages = new Map<string, AuditFinding[]>();
	private seq = 0;

	constructor(private readonly max = PAGE_STORE_MAX) {}

	store(findings: AuditFinding[]): string {
		this.seq += 1;
		const token = `p${this.seq}`;
		this.pages.set(token, findings);
		if (this.pages.size > this.max) {
			const oldest = this.pages.keys().next().value;
			if (oldest !== undefined) this.pages.delete(oldest);
		}
		return token;
	}

	get(token: string): AuditFinding[] | undefined {
		return this.pages.get(token);
	}

	/**
	 * Fit a tool result into the budget: the first findings that fit (paths capped), full counts in `page`, and a
	 * token for paging through the same tool. Results already within budget pass unchanged.
	 */
	compact(payload: AuditPayload, toolName: string): AuditPayload {
		if (!Array.isArray(payload.findings)) return payload;
		if (jsonSize(payload) <= UI_RESULT_BUDGET) return payload;
		const recurring = new Set(Array.isArray(payload['recurring']) ? (payload['recurring'] as string[]) : []);
		const all = payload.findings.map((f) => (recurring.has(f.id) ? { ...f, recurring: true } : f));
		const base: Record<string, unknown> = { ...payload };
		if (typeof base['output'] === 'string' && base['output'].length > 1500) {
			base['output'] = `…${base['output'].slice(-1500)}`;
			base['output_truncated'] = true;
		}
		if (Array.isArray(base['recurring'])) base['recurring'] = base['recurring'].length;
		if (Array.isArray(base['reports'])) base['reports'] = base['reports'].slice(0, 5);
		if (Array.isArray(base['suppressed'])) {
			base['suppressed'] = (base['suppressed'] as AuditFinding[]).map(({ id, check }) => ({ id, check }));
		}
		const page: FindingsPage = {
			tool: toolName,
			token: this.store(all),
			offset: 0,
			count: all.length,
			total: all.length,
			by_severity: tally(all, (f) => f.severity),
			by_source: tally(all, (f) => f.source ?? 'computational'),
			hint: `Only the first findings are inline. Call ${toolName} with page_token = token and offset = count for the rest.`,
		};
		const findings = fitFindings({ ...base, page }, all.map(trimPaths));
		return { ...base, findings, page: { ...page, count: findings.length } };
	}

	/** The findings from `offset` that fit the budget, untrimmed, and the next offset (null at the end). */
	page(token: string, offset: unknown = 0): AuditPayload {
		const all = this.pages.get(token);
		if (!all) return { error: `unknown or expired page token "${token}"; call the original tool again` };
		const start = Math.max(0, Math.floor(Number(offset) || 0));
		const base = { token, offset: start, total: all.length, next: all.length };
		const findings = fitFindings(base, all.slice(start));
		const next = start + findings.length;
		return { ...base, findings, next: next < all.length ? next : null };
	}
}
