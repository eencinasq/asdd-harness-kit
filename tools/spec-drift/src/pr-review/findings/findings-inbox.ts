/**
 * Unified Findings inbox helpers (pr-review-dashboard-ux REQ-022…025):
 * keys, comment body template, evidence parsing, severity helpers.
 */
import type { ArchitectureFinding } from '../architecture/architecture.types.ts';
import type { FindingSeverity, ReviewFinding } from '../engine/types.ts';
import { INLINE_WORD_LIMIT } from '../pr-review.types.ts';
import type { CriterionResult, RequirementsState } from '../requirements/requirements.types.ts';

export type InboxSource = 'architecture' | 'security' | 'ticket';

export type InboxItem = {
	readonly key: string;
	readonly source: InboxSource;
	readonly severity: FindingSeverity;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly title: string;
	readonly message: string;
	readonly suggestedFix?: string;
	/** Default checked in the inbox (high/critical). */
	readonly defaultChecked: boolean;
};

const truncateWords = (text: string, limit: number): string => {
	const words = text.split(/\s+/).filter(Boolean);
	return words.length > limit ? `${words.slice(0, limit).join(' ')}…` : text;
};

export const analyzerSeverityToFinding = (severity: string): FindingSeverity => {
	const s = severity.toUpperCase();
	if (s === 'ERROR' || s === 'CRITICAL' || s === 'HIGH') return s === 'CRITICAL' ? 'critical' : 'high';
	if (s === 'WARNING' || s === 'MEDIUM') return 'medium';
	return 'low';
};

export const isHighSeverity = (severity: FindingSeverity): boolean => severity === 'critical' || severity === 'high';

/** Short PR comment body: source + rule/criterion + message (+ optional fix), word-capped. */
export const formatInboxComment = (item: {
	readonly source: InboxSource;
	readonly title: string;
	readonly message: string;
	readonly suggestedFix?: string;
}): string => {
	const label = item.source === 'architecture' ? 'Architecture' : item.source === 'security' ? 'Security' : 'Ticket';
	const head = `${label}: ${item.title}. ${item.message}`.replace(/\s+/g, ' ').trim();
	const withFix = item.suggestedFix?.trim() ? `${head} Suggested fix: ${item.suggestedFix.trim()}` : head;
	return truncateWords(withFix, INLINE_WORD_LIMIT);
};

/** Parse `path:line` or `path:start-end` evidence into an anchor; bare paths are not pin-able. */
export const parseEvidenceRef = (raw: string): { readonly path: string; readonly line: number } | undefined => {
	const m = raw.trim().match(/^(.+?):(\d+)(?:-(\d+))?$/);
	if (!m?.[1] || !m[2]) return undefined;
	return { path: m[1], line: Number(m[2]) };
};

const fromArchFinding = (
	source: 'architecture' | 'security',
	prefix: string,
	index: number,
	f: ArchitectureFinding,
): InboxItem => {
	const severity = analyzerSeverityToFinding(f.severity);
	return {
		key: `${prefix}:${index}`,
		source,
		severity,
		path: f.path,
		startLine: f.startLine,
		endLine: f.endLine || f.startLine,
		title: f.checkId,
		message: f.message,
		defaultChecked: isHighSeverity(severity),
	};
};

/** Unmet ticket criteria that have at least one `path:line` evidence entry. */
export const ticketPinItems = (requirements: RequirementsState | undefined): readonly InboxItem[] => {
	if (!requirements) return [];
	const items: InboxItem[] = [];
	for (const c of requirements.criteria) {
		if (c.status !== 'unmet') continue;
		const anchor = c.evidence.map(parseEvidenceRef).find(Boolean);
		if (!anchor) continue;
		items.push({
			key: `ticket:${c.id}`,
			source: 'ticket',
			severity: 'high',
			path: anchor.path,
			startLine: anchor.line,
			endLine: anchor.line,
			title: c.id,
			message: c.text,
			suggestedFix: c.note,
			defaultChecked: true,
		});
	}
	return items;
};

export const collectInboxItems = (options: {
	readonly architectureFindings?: readonly ArchitectureFinding[];
	readonly builtinSecurityFindings?: readonly ArchitectureFinding[];
	readonly repoSecurityFindings?: readonly ArchitectureFinding[];
	readonly requirements?: RequirementsState;
}): readonly InboxItem[] => {
	const items: InboxItem[] = [];
	for (const [i, f] of (options.architectureFindings ?? []).entries()) {
		items.push(fromArchFinding('architecture', 'arch', i, f));
	}
	for (const [i, f] of (options.builtinSecurityFindings ?? []).entries()) {
		items.push(fromArchFinding('security', 'sec-builtin', i, f));
	}
	for (const [i, f] of (options.repoSecurityFindings ?? []).entries()) {
		items.push(fromArchFinding('security', 'sec-repo', i, f));
	}
	items.push(...ticketPinItems(options.requirements));
	return items;
};

export const inboxItemToReviewFinding = (item: InboxItem): ReviewFinding => ({
	path: item.path,
	content: formatInboxComment(item),
	startLine: item.startLine,
	endLine: item.endLine,
	severity: item.severity,
	category: item.source === 'security' ? 'security' : item.source === 'ticket' ? 'other' : 'maintainability',
	ruleId: item.title,
});

export const resolveInboxKeys = (
	keys: readonly string[],
	items: readonly InboxItem[],
): { readonly selected: readonly InboxItem[]; readonly unknown: readonly string[] } => {
	const byKey = new Map(items.map((i) => [i.key, i]));
	const selected: InboxItem[] = [];
	const unknown: string[] = [];
	for (const key of keys) {
		const item = byKey.get(key);
		if (item) selected.push(item);
		else unknown.push(key);
	}
	return { selected, unknown };
};

/** Criterion still used by Requirements “Pin unmet” button (same key shape). */
export const pinableUnmetCriteria = (criteria: readonly CriterionResult[]): readonly CriterionResult[] =>
	criteria.filter((c) => c.status === 'unmet' && c.evidence.some((e) => Boolean(parseEvidenceRef(e))));
