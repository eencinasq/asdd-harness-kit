/** File selection: which files of a diff are reviewed (allowlist, excludes, secrets, size). */
import excludePatterns from './data/default_exclude_patterns.json' with { type: 'json' };
import secretPatterns from './data/default_secret_patterns.json' with { type: 'json' };
import supportedExts from './data/supported_file_types.json' with { type: 'json' };

import { matchGlob } from './glob.ts';
import { effectivePath } from './parse-diff.ts';
import type { ExcludeReason, FileDecision, FileDiff } from './types.ts';

const EXT_SET = new Set((supportedExts as string[]).map((e) => e.toLowerCase()));
const EXCLUDES = (excludePatterns as string[]).map((p) => p.toLowerCase());
const SECRETS = (secretPatterns as string[]).map((p) => p.toLowerCase());

/**
 * Test code. The default excludes list it; here it is reviewed with the tests checklist (`tests.md`) unless the
 * profile says `reviewTests: false`. Test data (fixtures, testdata) stays excluded.
 */
const TEST_DATA = ['**/testdata/**', '**/fixtures/**'];
const TEST_PATTERNS = EXCLUDES.filter(
	(p) => /test|spec/.test(p) && !TEST_DATA.includes(p) && !p.includes('pytest_cache'),
);

export const isTestPath = (filePath: string): boolean => {
	const lower = filePath.toLowerCase();
	return TEST_PATTERNS.some((pattern) => matchGlob(pattern, lower));
};

const extOf = (filePath: string): string => {
	const base = filePath.split('/').pop() ?? filePath;
	const dot = base.lastIndexOf('.');
	if (dot <= 0) return '';
	return base.slice(dot).toLowerCase();
};

const isSecretEnvPath = (lowerPath: string): boolean => {
	const base = lowerPath.split('/').pop() ?? lowerPath;
	if (base === '.env.example' || base === '.env.sample' || base === '.env.template') return false;
	return base === '.env' || base.startsWith('.env.');
};

export const isSecretPath = (filePath: string): boolean => {
	const lower = filePath.toLowerCase();
	if (isSecretEnvPath(lower)) return true;
	return SECRETS.some((pattern) => matchGlob(pattern, lower));
};

export const isAllowedExt = (ext: string): boolean => EXT_SET.has(ext.toLowerCase());

export type SelectOptions = {
	/** Hard cap per file diff (chars). Larger files are reported as not reviewed. */
	readonly maxDiffChars?: number;
	/** Review test files (default true). */
	readonly reviewTests?: boolean;
	/** Extra globs to skip (profile `exclude`). */
	readonly exclude?: readonly string[];
};

export const isExcludedPath = (filePath: string, options: SelectOptions = {}): boolean => {
	const lower = filePath.toLowerCase();
	const testsReviewed = options.reviewTests !== false;
	return (
		EXCLUDES.some((pattern) => !(testsReviewed && TEST_PATTERNS.includes(pattern)) && matchGlob(pattern, lower)) ||
		(options.exclude ?? []).some((pattern) => matchGlob(pattern.toLowerCase(), lower))
	);
};

export const whyExcluded = (diff: FileDiff, options: SelectOptions = {}): ExcludeReason => {
	if (diff.isBinary) return 'binary';
	if (isSecretPath(diff.oldPath) || isSecretPath(diff.newPath)) return 'secret';
	const path = effectivePath(diff);
	const ext = extOf(path);
	if (ext && !isAllowedExt(ext)) return 'extension';
	if (isExcludedPath(path, options)) return 'default-path';
	return 'none';
};

/**
 * Hard size cap per file (chars, not tokens). Below it, large files are split into several review
 * groups by hunk (bundle.ts) instead of being skipped; above it (generated dumps), the file is
 * reported as not reviewed, which keeps the review from suggesting APPROVE.
 */
export const DEFAULT_MAX_DIFF_CHARS = 400_000;

export const selectFiles = (diffs: readonly FileDiff[], options: SelectOptions = {}): readonly FileDecision[] => {
	const maxChars = options.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS;
	return diffs.map((diff) => {
		const path = effectivePath(diff);
		let reason = whyExcluded(diff, options);
		if (reason === 'none' && diff.isDeleted) reason = 'deleted';
		if (reason === 'none' && diff.diff.length > maxChars) reason = 'too-large';
		return { diff, reason, path };
	});
};

export const retainedDiffs = (decisions: readonly FileDecision[]): readonly FileDiff[] =>
	decisions.filter((d) => d.reason === 'none' || d.reason === 'deleted').map((d) => d.diff);

export const selectedDiffs = (decisions: readonly FileDecision[]): readonly FileDiff[] =>
	decisions.filter((d) => d.reason === 'none').map((d) => d.diff);
