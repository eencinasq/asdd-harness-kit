/**
 * Rule resolver: picks the rule checklist (a doc under rules/rule_docs) for each file by path glob,
 * with:
 *
 * - **Checklist item ids.** Every `####` item of a rule doc gets an id, `<doc>.<slug>` (e.g.
 *   `python.mutable-default-arguments-and-shared-state`), shown in the rules block. Findings cite it
 *   (`ruleId`), so metrics, profiles and fingerprints work per item, not per language.
 * - **Test files** get `tests.md` (when the profile reviews tests) instead of being skipped.
 * - **Content hints** for ambiguous extensions: `.m` is Objective-C when the code says so, MATLAB
 *   otherwise.
 * - **Profiles** can drop checklist items (`disable`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isTestPath } from './filter.ts';
import { matchGlob } from './glob.ts';
import { coversRule } from './profile.ts';
import systemRulesJson from './rules/system_rules.json' with { type: 'json' };

export type RuleDetail = {
	readonly text: string;
	readonly source: 'system';
	readonly pattern: string;
	readonly docId: string;
};

export type ResolveOptions = {
	/** Diff text of the file, for content hints (e.g. Objective-C vs MATLAB `.m`). */
	readonly content?: string;
	/** Route test files to the tests checklist (default true). */
	readonly reviewTests?: boolean;
	/** Checklist items or whole docs to drop (profile `disable`). */
	readonly disable?: readonly string[];
};

export type SystemRules = {
	readonly resolve: (filePath: string, options?: ResolveOptions) => string;
	readonly resolveDetail: (filePath: string, options?: ResolveOptions) => RuleDetail;
};

type RawSystemRules = {
	readonly default_rule: string;
	readonly path_rule_map: Readonly<Record<string, string>>;
};

const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rules');
const DOCS_DIR = path.join(RULES_DIR, 'rule_docs');

/** Checklist for test code. */
export const TESTS_DOC = 'tests.md';

/** Content hints for extensions two languages share. */
const CONTENT_HINTS: ReadonlyArray<{ readonly pattern: string; readonly test: RegExp; readonly docId: string }> = [
	{
		pattern: '**/*.m',
		test: /^[+ -]?\s*(@interface|@implementation|@property|@protocol|#import\s*[<"])/m,
		docId: 'objc.md',
	},
];

const slug = (text: string): string =>
	text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 60)
		.replace(/-$/, '');

export const docBase = (docId: string): string => docId.replace(/\.md$/, '');

type RuleItem = { readonly id: string; readonly heading: string; readonly body: string };
type RuleDoc = { readonly docId: string; readonly preamble: string; readonly items: readonly RuleItem[] };

/** Split a doc into its `####` checklist items (text before the first one is the preamble). */
export const parseRuleDoc = (docId: string, text: string): RuleDoc => {
	const parts = text.split(/^(?=#### )/m);
	const preamble = parts[0]?.startsWith('#### ') ? '' : (parts.shift() ?? '');
	const seen = new Map<string, number>();
	const items = parts.map((part) => {
		const [first = '', ...rest] = part.split('\n');
		const heading = first.replace(/^####\s+/, '').trim();
		let id = `${docBase(docId)}.${slug(heading) || 'item'}`;
		const n = (seen.get(id) ?? 0) + 1;
		seen.set(id, n);
		if (n > 1) id = `${id}-${n}`;
		return { id, heading, body: rest.join('\n') };
	});
	return { docId, preamble, items };
};

/** The doc as the reviewer sees it: item ids in the headings, disabled items left out. */
export const renderRuleDoc = (doc: RuleDoc, disable: readonly string[] = []): string => {
	if (disable.some((ref) => ref === docBase(doc.docId))) return '';
	const items = doc.items.filter((item) => !disable.some((ref) => coversRule(ref, item.id)));
	return [doc.preamble.trimEnd(), ...items.map((item) => `#### [${item.id}] ${item.heading}\n${item.body}`.trimEnd())]
		.filter(Boolean)
		.join('\n\n');
};

const readDoc = (docId: string): RuleDoc => {
	const text = fs.readFileSync(path.join(DOCS_DIR, docId), 'utf8').replace(/\n+$/, '');
	return parseRuleDoc(docId, text);
};

let cached: SystemRules | null = null;

export const loadSystemRules = (): SystemRules => {
	if (cached) return cached;

	const raw = systemRulesJson as RawSystemRules;
	const docs = new Map<string, RuleDoc>();
	const doc = (docId: string): RuleDoc => {
		let found = docs.get(docId);
		if (!found) {
			found = readDoc(docId);
			docs.set(docId, found);
		}
		return found;
	};
	const pathRules = Object.entries(raw.path_rule_map).map(([pattern, docId]) => ({
		pattern: pattern.toLowerCase(),
		original: pattern,
		docId,
	}));

	const detail = (docId: string, pattern: string, options: ResolveOptions): RuleDetail => ({
		text: renderRuleDoc(doc(docId), options.disable),
		source: 'system',
		pattern,
		docId,
	});

	const resolveDetail = (filePath: string, options: ResolveOptions = {}): RuleDetail => {
		const lower = filePath.toLowerCase();
		if (options.reviewTests !== false && isTestPath(filePath)) return detail(TESTS_DOC, 'test files', options);
		for (const hint of CONTENT_HINTS) {
			if (options.content && matchGlob(hint.pattern, lower) && hint.test.test(options.content)) {
				return detail(hint.docId, `${hint.pattern} (content)`, options);
			}
		}
		for (const rule of pathRules) {
			if (matchGlob(rule.pattern, lower)) return detail(rule.docId, rule.original, options);
		}
		return detail(raw.default_rule, 'default', options);
	};

	cached = {
		resolve: (filePath, options) => resolveDetail(filePath, options).text,
		resolveDetail,
	};
	return cached;
};

/** Format the rules block for one or more paths sharing the same text. */
export const formatRulesBlock = (paths: readonly string[], ruleText: string): string => {
	if (paths.length === 0 || !ruleText.trim()) return '';
	return `<rules for="${paths.join(', ')}">\nCite the [id] of the item a finding breaks as its ruleId.\n${ruleText}\n</rules>`;
};
