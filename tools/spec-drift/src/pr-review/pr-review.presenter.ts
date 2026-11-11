import type { PrReviewView } from './pr-review.types.ts';
import { statusLabel } from './requirements/requirements-report.ts';

const DASHBOARD_RULE_PREVIEW = 4000;

export type PresentOptions = {
	/**
	 * Hand out nextGroup in full (instruction, rules, diff). Only pr_review_next_group does: every
	 * other result names the next group in one line, so a group's content reaches the model once.
	 */
	readonly withRules?: boolean;
	/**
	 * A step of the group loop (next_group, submit_findings, verify, submit_requirements): the model
	 * already has the paths, the ticket and the per-group table from pr_review_start, so they are not
	 * repeated, and structuredContent is cut to the progress (no dashboard is shown in the loop).
	 */
	readonly loop?: boolean;
};

/** MCP resource URI of a workspace artifact (see PrReviewTools.artifact). */
export const artifactUri = (view: PrReviewView, file: string): string =>
	`pr-review://${encodeURIComponent(view.paths.project)}/${view.pr}/${file}`;

/** Plain-text view of the review state — what the model reads between group submits. */
const toText = (view: PrReviewView, options: PresentOptions): string => {
	const lines = [`PR Review #${view.pr} — phase: ${view.phase}`, view.message];
	// The start prompt already lists the groups and the criteria; loop steps carry only what changed.
	const full = !options.loop && !view.prompt;
	if (!options.loop) {
		lines.push(
			'',
			`repo: ${view.paths.repoRoot}`,
			`artifacts: ${view.paths.base}`,
			`resources: ${['diff.patch', 'report.md', 'comments.md'].map((f) => artifactUri(view, f)).join(' · ')}`,
		);
		if (view.units) {
			lines.push(
				`files: ${view.units.selectedCount}/${view.units.fileCount} reviewed, ${view.units.groups.length} group(s)`,
			);
		}
		if (view.architecture) {
			lines.push(
				`architecture: ${view.architecture.status} · findings=${view.architecture.findingCount} · ${view.architecture.rulesDir}`,
			);
		}
	}
	if (view.requirements) {
		const r = view.requirements;
		lines.push(
			`ticket: ${r.ticket.ref ?? r.ticket.source}${r.ticket.title ? ` — ${r.ticket.title}` : ''} · criteria ${r.status}`,
		);
		if (full) lines.push(...r.criteria.map((c) => `  ${c.id} [${statusLabel(c.status)}] ${c.text.slice(0, 120)}`));
	}
	if (view.progress && full) {
		lines.push(
			`progress: ${view.progress.doneCount}/${view.progress.totalCount} steps · complete=${view.progress.complete}`,
			...view.progress.groups.map((g) => `  [${g.index}] ${g.status} ${g.label} (${g.findingCount} findings)`),
		);
	}
	if (view.nextGroup) {
		const g = view.nextGroup;
		lines.push(
			'',
			options.withRules
				? `NEXT GROUP [${g.index}] ${g.label}\n${g.instruction}`
				: `Next group: [${g.index}] ${g.label} (${g.files.join(', ')}) — call pr_review_next_group for its diff and rules.`,
		);
	}
	if (view.reviewUrl) lines.push(`review: ${view.reviewUrl}`);
	if (view.warnings?.length) {
		lines.push('', 'Warnings:', ...view.warnings.map((w) => `- ${w}`));
	}
	if (view.prompt) {
		lines.push('', '--- agent prompt ---', view.prompt);
	}
	if (view.check) {
		lines.push(
			'',
			'Comment edits vs original:',
			...view.check.changes.map((c) => `- ${c.kind.toUpperCase()} ${c.key}`),
			`- ${view.check.summaryChange.kind.toUpperCase()} summary`,
		);
	}
	return lines.join('\n');
};

/**
 * What the dashboard renders. Drops what it never reads (full diff, every group's rule text, line
 * maps, the model's instruction), which is most of the payload; those stay available as resources.
 */
const forDashboard = (view: PrReviewView): PrReviewView => ({
	...view,
	diff: undefined,
	// The dashboard shows the criteria, not the whole ticket body.
	requirements: view.requirements && { ...view.requirements, ticket: { ...view.requirements.ticket, text: '' } },
	units: view.units && {
		...view.units,
		groups: view.units.groups.map((g) => ({ ...g, ruleMarkdown: '' })),
		rightLinesByPath: {},
	},
	nextGroup: view.nextGroup && {
		...view.nextGroup,
		instruction: '',
		rightLinesByPath: {},
		// The dashboard previews the first 4,000 characters of the group's rules.
		ruleMarkdown: view.nextGroup.ruleMarkdown.slice(0, DASHBOARD_RULE_PREVIEW + 1),
	},
});

/**
 * structuredContent of a loop step: the progress and the next group's identity, nothing the model
 * already has in the text (some clients pass structuredContent to the model too).
 */
const forLoop = (view: PrReviewView) => ({
	kind: view.kind,
	pr: view.pr,
	phase: view.phase,
	...(view.progress && {
		progress: {
			groups: view.progress.groups.map(({ index, label, status, findingCount }) => ({
				index,
				label,
				status,
				findingCount,
			})),
			findingCount: view.progress.findings.length,
			activeGroupIndex: view.progress.activeGroupIndex,
			complete: view.progress.complete,
			doneCount: view.progress.doneCount,
			totalCount: view.progress.totalCount,
			...(view.progress.verification ? { verification: view.progress.verification } : {}),
			...(view.progress.requirements ? { requirements: view.progress.requirements } : {}),
		},
	}),
	...(view.nextGroup && {
		nextGroup: { index: view.nextGroup.index, label: view.nextGroup.label, files: view.nextGroup.files },
	}),
	...(view.requirements && { requirements: { status: view.requirements.status } }),
	...(view.warnings?.length ? { warnings: view.warnings } : {}),
});

/** Tool result: text for the model + structuredContent for the PR Review dashboard. */
export const presentReview = (view: PrReviewView, options: PresentOptions = {}) => ({
	content: [{ type: 'text' as const, text: toText(view, options) }],
	structuredContent: JSON.parse(JSON.stringify(options.loop ? forLoop(view) : forDashboard(view))) as Record<
		string,
		unknown
	>,
});
