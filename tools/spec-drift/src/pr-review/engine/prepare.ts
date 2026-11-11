import { bundleDiffs } from './bundle.ts';
import { deterministicFindings } from './checks.ts';
import { retainedDiffs, selectedDiffs, selectFiles } from './filter.ts';
import { rightSideLines } from './hunks.ts';
import { effectivePath, parseDiffText } from './parse-diff.ts';
import { DEFAULT_PROFILE, type ReviewProfile } from './profile.ts';
import { formatRulesBlock } from './system-rules.ts';
import type { ExcludeReason, PrepareResult } from './types.ts';

/** Parse → filter → resolve rules → bundle, under the repo's review profile. */
export const prepareReview = (diffText: string, profile: ReviewProfile = DEFAULT_PROFILE): PrepareResult => {
	const files = parseDiffText(diffText);
	const decisions = selectFiles(files, { reviewTests: profile.reviewTests, exclude: profile.exclude });
	const selected = selectedDiffs(decisions);
	const retained = retainedDiffs(decisions);
	const groups = bundleDiffs(selected, { reviewTests: profile.reviewTests, disable: profile.disable });

	const rightLinesByPath: Record<string, readonly number[]> = {};
	for (const diff of retained) {
		const path = effectivePath(diff);
		if (!path || path === '/dev/null') continue;
		rightLinesByPath[path] = rightSideLines(diff.diff, { addedOnly: profile.addedLinesOnly });
	}

	// Files the profile switched off entirely (a disabled rule doc).
	const grouped = new Set(groups.flatMap((g) => g.files));
	const byProfile = selected
		.map(effectivePath)
		.filter((p) => !grouped.has(p))
		.map((path) => ({ path, reason: 'profile' as ExcludeReason }));

	return {
		files,
		decisions,
		selected,
		groups,
		rightLinesByPath,
		skipped: [
			...decisions
				.filter((d) => d.reason !== 'none' && d.reason !== 'deleted')
				.map((d) => ({ path: d.path, reason: d.reason })),
			...byProfile,
		],
		checks: deterministicFindings(decisions),
	};
};

export const reviewUnitsSummary = (prepared: PrepareResult): string => {
	const lines = [
		`Prepared: ${prepared.files.length} file(s) in diff, ${prepared.selected.length} selected, ${prepared.groups.length} review group(s).`,
		'Files are grouped by the rule checklist their path selects (language/path agnostic).',
		'',
		'## Review groups (review each completely — do not skip files)',
		...prepared.groups.map(
			(g, i) =>
				`${i + 1}. **${g.label}**${g.span ? ` · lines ${g.span.start}-${g.span.end}` : ''} · rule \`${g.ruleDocId}\` (pattern \`${g.rulePattern}\`) · ${g.files.length} file(s), +${g.diffs.reduce((s, d) => s + d.insertions, 0)}/-${g.diffs.reduce((s, d) => s + d.deletions, 0)})\n` +
				g.files.map((f) => `   - ${f}`).join('\n'),
		),
	];
	if (prepared.skipped.length) {
		lines.push('', '## Skipped (deterministic filters)', ...prepared.skipped.map((s) => `- ${s.path} — ${s.reason}`));
	}
	return lines.join('\n');
};

export const rulesMarkdownForGroup = (group: {
	readonly files: readonly string[];
	readonly ruleMarkdown: string;
}): string => formatRulesBlock(group.files, group.ruleMarkdown);
