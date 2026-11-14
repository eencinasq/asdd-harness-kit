import fs from 'node:fs';
import path from 'node:path';

import type { EngineInfo, RuleMeta } from '../analysis.types.ts';

/**
 * ADR coverage (rule-coverage REQ-001, REQ-002): which decisions of the project a rule enforces. An ADR is a file in the
 * project's ADR folder (the kit's `documentation-and-adrs` convention, MADR, adr-tools, Nygard); a rule cites it in
 * `metadata.adr`. Ids match by number (`ADR-10` = `ADR-0010` = `0010-x.md`). Reads files only; writes nothing.
 */

/** Folders tried after the `ADR index` binding and `.adr-dir`, in order. */
export const ADR_DIR_CANDIDATES = [
	'docs/decisions',
	'docs/adr',
	'docs/adrs',
	'doc/adr',
	'docs/architecture/decisions',
	'adr',
] as const;

const INACTIVE = /^(superseded|deprecated|rejected)\b/;
const NOT_ADR = /^(readme|index|template|adr-template)(\.|-|$)/i;

export type Adr = {
	/** `ADR-0010`, from the heading or the file name; null when neither has a number. */
	readonly id: string | null;
	readonly number: number | null;
	readonly title: string;
	/** First word of the status, lower case (`accepted`, `proposed`, `superseded`…); null when the file has none. */
	readonly status: string | null;
	/** Repository-relative path. */
	readonly path: string;
	/** `Enforcement: manual` (or `none`): not checkable by code rules, so outside the coverage ratio. */
	readonly exempt: boolean;
	/** Not superseded, deprecated, or rejected. */
	readonly active: boolean;
};

export type AdrLocation = {
	readonly dir: string | null;
	readonly source: 'binding' | 'adr-dir' | 'default' | 'none';
};

export type AdrCoverage = AdrLocation & {
	readonly adrs: readonly (Adr & { readonly rules: readonly string[] })[];
	readonly total: number;
	/** Active and not exempt: the decisions rules should enforce. */
	readonly enforceable: number;
	readonly covered: number;
	/** covered / enforceable; null when there is nothing to enforce. */
	readonly coverage: number | null;
	readonly uncovered: readonly { readonly id: string; readonly title: string; readonly path: string }[];
	/** Rules citing an ADR that has no file, or whose ADR no longer stands. */
	readonly dangling: readonly { readonly ruleId: string; readonly adr: string; readonly reason: string }[];
	readonly rulesWithoutAdr: number;
	/** ADR folder files with no number in the heading or the file name: listed, not counted. */
	readonly unidentified: readonly string[];
};

// ── Discovery ──────────────────────────────────────────────────────────────────

const isDir = (abs: string): boolean => {
	try {
		return fs.statSync(abs).isDirectory();
	} catch {
		return false;
	}
};

/** The `ADR index` row of the kit's structure binding (`| ADR index | \`docs/decisions/\` |`), when it names a path. */
export const adrIndexBinding = (structureMd: string): string | null => {
	const row = structureMd.split('\n').find((l) => /^\|\s*ADR index\s*\|/i.test(l));
	const cell = row?.split('|')[2]?.trim() ?? '';
	// A path in backticks, or a bare first word that looks like a path ("none yet (…)" is not one).
	const first = cell.split(/\s+/)[0] ?? '';
	const value = /`([^`]+)`/.exec(cell)?.[1] ?? (first.includes('/') ? first : '');
	return /^[\w./-]+$/.test(value) ? value.replace(/\/$/, '') : null;
};

/** Where the project keeps its ADRs: the kit binding, else `.adr-dir` (adr-tools), else a conventional folder. */
export const locateAdrs = (repoRoot: string): AdrLocation => {
	const read = (rel: string) => {
		try {
			return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
		} catch {
			return null;
		}
	};
	const bound = adrIndexBinding(read('.harness/steering/structure.md') ?? '');
	if (bound) {
		const dir = isDir(path.join(repoRoot, bound)) ? bound : path.dirname(bound);
		if (dir !== '.' && isDir(path.join(repoRoot, dir))) return { dir, source: 'binding' };
	}
	const adrDir = read('.adr-dir')?.trim();
	if (adrDir && isDir(path.join(repoRoot, adrDir))) return { dir: adrDir.replace(/\/$/, ''), source: 'adr-dir' };
	const found = ADR_DIR_CANDIDATES.find((c) => isDir(path.join(repoRoot, c)));
	return found ? { dir: found, source: 'default' } : { dir: null, source: 'none' };
};

// ── Parsing ────────────────────────────────────────────────────────────────────

const ADR_NUMBER = /\bADR[-_ ]?0*(\d+)\b/i;

/** `ADR-<n>` with the file's zero padding when it has one (`0010-x.md` → `ADR-0010`). */
const formatId = (n: number, padded?: string): string => `ADR-${padded ?? String(n).padStart(3, '0')}`;

/** One ADR from its file name and text. */
export const parseAdr = (relPath: string, text: string): Adr => {
	const base = path.basename(relPath);
	const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
	const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? base.replace(/\.md$/i, '');
	const fileNum = /^(\d+)[-_]/.exec(base)?.[1];
	const headingAdr = ADR_NUMBER.exec(heading);
	const headingNum = headingAdr?.[1] ?? /^(\d+)\.\s/.exec(heading)?.[1];
	const n = headingNum ?? fileNum;
	const number = n === undefined ? null : Number(n);
	const statusText =
		/^status:\s*(.+)$/im.exec(front)?.[1] ??
		/^##\s*Status\s*\n+\s*(?:[-*]\s*)?(.+)$/im.exec(text)?.[1] ??
		/^\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im.exec(text)?.[1];
	const status = statusText?.replace(/[*_`]/g, '').trim().split(/\s+/)[0]?.toLowerCase() ?? null;
	const title = heading
		.replace(ADR_NUMBER, '')
		.replace(/^\d+\.\s*/, '')
		.replace(/^[\s:—–-]+/, '')
		.trim();
	return {
		id: number === null ? null : formatId(number, fileNum && Number(fileNum) === number ? fileNum : undefined),
		number,
		title: title || heading,
		status,
		path: relPath,
		exempt: /^\s*(?:[-*]\s*)?(?:\*\*)?enforcement(?:\*\*)?\s*:\s*(?:\*\*)?\s*(?:manual|none)\b/im.test(text),
		active: !status || !INACTIVE.test(status),
	};
};

/** The ADR files of the folder (and one level of subfolders), parsed. */
export const readAdrs = (repoRoot: string, dir: string): Adr[] => {
	const out: Adr[] = [];
	const visit = (rel: string, depth: number) => {
		for (const entry of fs.readdirSync(path.join(repoRoot, rel), { withFileTypes: true })) {
			const child = path.posix.join(rel, entry.name);
			if (entry.isDirectory() && depth === 0) visit(child, 1);
			else if (entry.isFile() && /\.md$/i.test(entry.name) && !NOT_ADR.test(entry.name)) {
				out.push(parseAdr(child, fs.readFileSync(path.join(repoRoot, child), 'utf8')));
			}
		}
	};
	visit(dir, 0);
	return out.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.path.localeCompare(b.path));
};

// ── Coverage ───────────────────────────────────────────────────────────────────

/** ADR numbers a rule's `metadata.adr` names (`ADR-0010, ADR-37`, a link to `docs/decisions/0010-x.md`). */
export const adrRefs = (adr: string | null): { ref: string; number: number | null }[] =>
	(adr ?? '')
		.split(/[,;]\s*|\s+(?=ADR)/i)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((ref) => {
			const n = ADR_NUMBER.exec(ref)?.[1] ?? /(?:^|\/)(\d+)[-_][\w.-]*\.md\b/.exec(ref)?.[1];
			return { ref, number: n === undefined ? null : Number(n) };
		});

export const computeAdrCoverage = (
	location: AdrLocation,
	adrs: readonly Adr[],
	rules: readonly Pick<RuleMeta, 'id' | 'adr'>[],
): AdrCoverage => {
	const byNumber = new Map<number, Adr>();
	for (const a of adrs) if (a.number !== null && !byNumber.has(a.number)) byNumber.set(a.number, a);
	const citing = new Map<number, Set<string>>();
	const dangling: { ruleId: string; adr: string; reason: string }[] = [];
	let rulesWithoutAdr = 0;
	for (const rule of rules) {
		const refs = adrRefs(rule.adr);
		if (!refs.length) rulesWithoutAdr += 1;
		for (const { ref, number } of refs) {
			const target = number === null ? undefined : byNumber.get(number);
			if (!target || number === null) {
				dangling.push({ ruleId: rule.id, adr: ref, reason: location.dir ? 'no ADR file' : 'no ADR folder' });
				continue;
			}
			if (!target.active) dangling.push({ ruleId: rule.id, adr: ref, reason: `ADR is ${target.status}` });
			citing.set(number, (citing.get(number) ?? new Set()).add(rule.id));
		}
	}
	const withRules = adrs.map((a) => ({
		...a,
		rules: a.number === null ? [] : [...(citing.get(a.number) ?? [])].sort(),
	}));
	const enforceable = withRules.filter((a) => a.id !== null && a.active && !a.exempt);
	const covered = enforceable.filter((a) => a.rules.length > 0).length;
	return {
		...location,
		adrs: withRules,
		total: adrs.length,
		enforceable: enforceable.length,
		covered,
		coverage: enforceable.length ? covered / enforceable.length : null,
		uncovered: enforceable
			.filter((a) => a.rules.length === 0)
			.map((a) => ({ id: a.id as string, title: a.title, path: a.path })),
		dangling,
		rulesWithoutAdr,
		unidentified: adrs.filter((a) => a.id === null).map((a) => a.path),
	};
};

/**
 * The prompt that asks the host agent for the rule an ADR lacks (rule-coverage REQ-002). The agent writes the rule and
 * its test in the host, at the user's request; the server only returns this text.
 */
export const buildAdrRulePrompt = (options: {
	readonly adr: { readonly id: string; readonly title: string; readonly path: string };
	readonly repoRoot: string;
	readonly engine: EngineInfo;
	/** Engine-specific authoring steps (CodeAnalyzer.authoringGuide). */
	readonly guide: readonly string[];
}): string => {
	const { adr, engine } = options;
	const steps = [
		`Read \`${adr.path}\`: what does the decision forbid or require in the code? If it cannot be checked by a code rule (hosting, process), say so and suggest adding \`Enforcement: manual\` to the ADR instead of writing a rule.`,
		'Find where the decision applies in this codebase (folders, layers, APIs) and one real place that follows it.',
		`Write the rule under \`${engine.rulesDir}/architecture/\` with \`metadata.adr: ${adr.id}\` and a \`metadata.category\`.`,
		...options.guide,
		'Before writing the files, show the rule and its test to the user so they can confirm.',
	];
	return [
		`# Encode ${adr.id} as a ${engine.name} rule`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		`Decision: **${adr.id} — ${adr.title}** (\`${adr.path}\`). No rule enforces it yet.`,
		'',
		'## How',
		...steps.map((step, i) => `${i + 1}. ${step}`),
		'',
		'## Done',
		`Call \`validate_rules\` (the new rule should be ready: test passed, not noisy) and \`adr_coverage\` (${adr.id} covered).`,
	].join('\n');
};
