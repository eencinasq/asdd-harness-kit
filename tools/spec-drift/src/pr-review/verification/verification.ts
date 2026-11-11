/**
 * Verification pass (pure): every finding from the group loop is re-checked on its own before it
 * reaches the draft. Confirmed findings stay as written; plausible ones move to the summary as
 * "worth a look"; rejected ones are dropped (and listed in the report for transparency).
 */
import type { ReviewFinding } from '../engine/types.ts';

export const VERDICTS = ['confirmed', 'plausible', 'rejected'] as const;
export type FindingVerdict = (typeof VERDICTS)[number];

/** Stable while the findings list is unchanged: F1…Fn in progress order. */
export const findingId = (index: number): string => `F${index + 1}`;

export type FindingVerification = {
	readonly id: string;
	readonly verdict: FindingVerdict;
	readonly note?: string;
};

/** Lines of context shown around each finding in the verification pass. */
export const EXCERPT_CONTEXT_LINES = 5;

/** The lines around a finding at the PR head, numbered (what the verifier looks at first). */
export const findingExcerpt = (fileText: string, finding: Pick<ReviewFinding, 'startLine' | 'endLine'>): string => {
	const lines = fileText.replace(/\n$/, '').split('\n');
	const from = Math.max(1, finding.startLine - EXCERPT_CONTEXT_LINES);
	const to = Math.min(
		lines.length,
		Math.max(finding.endLine ?? finding.startLine, finding.startLine) + EXCERPT_CONTEXT_LINES,
	);
	return lines
		.slice(from - 1, to)
		.map((line, i) => `${String(from + i).padStart(5)}  ${line}`)
		.join('\n');
};

/**
 * The verification step. `excerpts[i]` is the code around finding i at the PR head (when it could
 * be read), so the verifier only calls pr_review_read_file when it needs more than that.
 */
export const verificationInstruction = (
	findings: readonly ReviewFinding[],
	excerpts: readonly (string | undefined)[] = [],
): string =>
	[
		`Verification pass: re-check each of the ${findings.length} finding(s) on its own, as a skeptical second reviewer (ideally a fresh subagent with no memory of the group reviews).`,
		'The code around each finding is below; read more with pr_review_read_file / pr_review_search (PR version) only when you need it. Decide:',
		'- confirmed: you can point to the code path / input that triggers it, and it matters;',
		'- plausible: may be real but you cannot prove it from the code (it goes to the summary as "worth a look");',
		'- rejected: wrong, already handled elsewhere, style-only, or a duplicate.',
		'Then call pr_review_verify_findings with one result per id, with a one-line note.',
		'',
		...findings.map((f, i) =>
			[
				`${findingId(i)} [${f.severity ?? 'medium'}${f.confidence !== undefined ? ` · confidence ${f.confidence}` : ''}] ${f.path}:${f.startLine}${f.endLine && f.endLine !== f.startLine ? `-${f.endLine}` : ''}`,
				`   ${f.content.trim().replace(/\s+/g, ' ').slice(0, 400)}`,
				f.evidence ? `   evidence: ${f.evidence.replace(/\s+/g, ' ').slice(0, 300)}` : '',
				excerpts[i] ? `<code path="${f.path}" source="untrusted">\n${excerpts[i]}\n</code>` : '',
			]
				.filter(Boolean)
				.join('\n'),
		),
	].join('\n');

export const applyVerification = (
	findings: readonly ReviewFinding[],
	results: readonly FindingVerification[],
): { readonly findings: ReviewFinding[]; readonly missing: string[]; readonly unknown: string[] } => {
	const byId = new Map(results.map((r) => [r.id.trim().toUpperCase(), r]));
	const ids = findings.map((_f, i) => findingId(i));
	const unknown = [...byId.keys()].filter((id) => !ids.includes(id));
	const missing = ids.filter((id) => !byId.has(id));
	return {
		findings: findings.map((f, i) => {
			const r = byId.get(findingId(i));
			return r ? { ...f, verdict: r.verdict, ...(r.note ? { verifyNote: r.note.trim().slice(0, 300) } : {}) } : f;
		}),
		missing,
		unknown,
	};
};

/**
 * Findings as they go into the draft: rejected dropped, plausible demoted to the summary with a
 * marker. Unverified findings (verification not run yet) pass through unchanged.
 */
export const draftFindings = (findings: readonly ReviewFinding[]): ReviewFinding[] =>
	findings
		.filter((f) => f.verdict !== 'rejected')
		.map((f) =>
			f.verdict === 'plausible'
				? { ...f, severity: 'low' as const, content: `Worth a look (unconfirmed): ${f.content.trim()}` }
				: f,
		);

export const verificationReportSection = (findings: readonly ReviewFinding[]): string => {
	const rejected = findings.filter((f) => f.verdict === 'rejected');
	const plausible = findings.filter((f) => f.verdict === 'plausible');
	if (!rejected.length && !plausible.length) return '';
	const line = (f: ReviewFinding) =>
		`- \`${f.path}:${f.startLine}\` ${f.content.trim().replace(/\s+/g, ' ').slice(0, 160)}${f.verifyNote ? ` — _${f.verifyNote}_` : ''}`;
	return [
		'## Verification',
		`${findings.filter((f) => f.verdict === 'confirmed').length} confirmed · ${plausible.length} plausible (moved to the summary) · ${rejected.length} rejected (not posted)`,
		...(rejected.length ? ['', '**Rejected**', ...rejected.map(line)] : []),
	].join('\n');
};
