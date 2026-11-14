/**
 * Traceability matrix (spec-drift-depth REQ-001): requirement → features → owned files → tests → PRs, with gaps. Pure:
 * the service reads the knowledge index and git, this module joins them.
 */

export type TraceGap = 'no-feature' | 'no-test' | 'not-passing';

export type TraceRequirement = {
	/** Knowledge node id, e.g. `req:my-slice:REQ-001`. */
	readonly key: string;
	readonly slice: string;
	readonly id: string;
	readonly title: string;
};

export type TraceFeature = {
	readonly key: string;
	readonly slice: string;
	readonly id: string;
	readonly status: string;
	/** Requirement node ids it implements. */
	readonly reqs: readonly string[];
	/** Scope paths it owns: files, folders, or globs. */
	readonly owns: readonly string[];
};

export type TraceRow = {
	readonly slice: string;
	readonly req_id: string;
	readonly title: string;
	readonly features: readonly { readonly id: string; readonly status: string }[];
	/** Owned files (folders and globs expanded to tracked files), at most MAX_FILES. */
	readonly files: readonly string[];
	readonly file_count: number;
	readonly tests: readonly string[];
	readonly prs: readonly number[];
	readonly gaps: readonly TraceGap[];
};

export type TraceTotals = {
	readonly requirements: number;
	readonly with_feature: number;
	readonly tested: number;
	readonly passing: number;
	readonly with_gaps: number;
};

export const MAX_FILES = 50;
/** Commits read for PR numbers (ADR-001). */
export const PR_LOG_LIMIT = 5000;
export const RECORD_SEPARATOR = '\x1e';

/** Test files by path (ADR-002). */
const TEST_PATH =
	/(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec|e2e-spec)\.[a-z0-9]+$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Tests?\.(java|kt)$/i;

export const isTestPath = (file: string): boolean => TEST_PATH.test(file);

/** `(#12)` at the end of a squash subject, or `Merge pull request #12`. */
const PR_IN_SUBJECT = /\(#(\d+)\)\s*$|Merge pull request #(\d+)/;

/**
 * Parses `git log --format=%x1e%s --name-only`: each record is a subject line followed by the files it touched. Returns
 * the PR numbers per file.
 */
export const prsByFileFromLog = (log: string): Map<string, Set<number>> => {
	const byFile = new Map<string, Set<number>>();
	for (const record of log.split(RECORD_SEPARATOR)) {
		const [subject = '', ...files] = record.split('\n');
		const m = PR_IN_SUBJECT.exec(subject);
		const pr = m ? Number(m[1] ?? m[2]) : null;
		if (!pr) continue;
		for (const raw of files) {
			const file = raw.trim();
			if (!file) continue;
			const set = byFile.get(file) ?? new Set<number>();
			set.add(pr);
			byFile.set(file, set);
		}
	}
	return byFile;
};

const globToRegExp = (glob: string): RegExp => {
	let re = '';
	for (let i = 0; i < glob.length; i += 1) {
		const c = glob[i] as string;
		if (c === '*') {
			if (glob[i + 1] === '*') {
				re += '.*';
				i += 1;
				if (glob[i + 1] === '/') i += 1;
			} else re += '[^/]*';
		} else if (c === '?') re += '[^/]';
		else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
};

/** An owned scope path as tracked files: itself, the files under a folder, or the files a glob matches. */
export const expandOwned = (owned: string, tracked: readonly string[]): string[] => {
	const p = owned.replace(/\/+$/, '');
	if (/[*?]/.test(p)) {
		const re = globToRegExp(p);
		return tracked.filter((f) => re.test(f));
	}
	if (!tracked.length || tracked.includes(p)) return [p];
	const under = tracked.filter((f) => f.startsWith(`${p}/`));
	return under.length ? under : [p];
};

export const buildMatrix = (input: {
	readonly requirements: readonly TraceRequirement[];
	readonly features: readonly TraceFeature[];
	readonly trackedFiles: readonly string[];
	readonly prsByFile: ReadonlyMap<string, ReadonlySet<number>>;
}): { rows: TraceRow[]; totals: TraceTotals } => {
	const featuresByReq = new Map<string, TraceFeature[]>();
	for (const f of input.features) {
		for (const r of f.reqs) featuresByReq.set(r, [...(featuresByReq.get(r) ?? []), f]);
	}
	const rows = input.requirements.map((req): TraceRow => {
		const features = (featuresByReq.get(req.key) ?? []).sort((a, b) => a.id.localeCompare(b.id));
		const files = [
			...new Set(features.flatMap((f) => f.owns.flatMap((o) => expandOwned(o, input.trackedFiles)))),
		].sort();
		const tests = files.filter(isTestPath);
		const prs = [...new Set(files.flatMap((f) => [...(input.prsByFile.get(f) ?? [])]))].sort((a, b) => a - b);
		const gaps: TraceGap[] = [];
		if (!features.length) gaps.push('no-feature');
		if (!tests.length) gaps.push('no-test');
		if (features.length && features.some((f) => f.status !== 'passing')) gaps.push('not-passing');
		return {
			slice: req.slice,
			req_id: req.id,
			title: req.title,
			features: features.map((f) => ({ id: f.id, status: f.status })),
			files: files.slice(0, MAX_FILES),
			file_count: files.length,
			tests,
			prs,
			gaps,
		};
	});
	return {
		rows,
		totals: {
			requirements: rows.length,
			with_feature: rows.filter((r) => r.features.length > 0).length,
			tested: rows.filter((r) => r.tests.length > 0).length,
			passing: rows.filter((r) => r.features.length > 0 && !r.gaps.includes('not-passing')).length,
			with_gaps: rows.filter((r) => r.gaps.length > 0).length,
		},
	};
};

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The matrix as a Markdown table, for an audit document. */
export const matrixMarkdown = (rows: readonly TraceRow[], totals: TraceTotals): string => {
	const list = (items: readonly (string | number)[], none = '—') => (items.length ? items.join(', ') : none);
	const lines = [
		`Requirements: ${totals.requirements} · with a feature: ${totals.with_feature} · tested: ${totals.tested} · passing: ${totals.passing} · with gaps: ${totals.with_gaps}`,
		'',
		'| Slice | Requirement | Title | Features | Tests | PRs | Gaps |',
		'|-------|-------------|-------|----------|-------|-----|------|',
		...rows.map(
			(r) =>
				`| ${cell(r.slice)} | ${cell(r.req_id)} | ${cell(r.title)} | ${cell(list(r.features.map((f) => `${f.id} (${f.status})`)))} | ${cell(list(r.tests))} | ${cell(list(r.prs.map((n) => `#${n}`)))} | ${cell(list(r.gaps, 'none'))} |`,
		),
	];
	return `${lines.join('\n')}\n`;
};
