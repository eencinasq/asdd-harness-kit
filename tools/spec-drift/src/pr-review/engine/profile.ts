/**
 * Per-repo review profile (`.pr-review.yml` at the repo root), like a SonarQube quality profile.
 * It is read from the **base** branch, never from the PR: a PR must not be able to switch off the
 * checks that review it.
 *
 * ```yaml
 * reviewTests: true            # review test files with the tests checklist (default true)
 * addedLinesOnly: false        # comment only on lines the PR added, not context lines
 * exclude: ["legacy/**"]       # extra paths to skip
 * disable: [python.performance, matlab]   # checklist items (or whole rule docs) to drop
 * summaryOnly: [ts_js_tsx_jsx.dead-code]   # report these in the summary only (as low)
 * severity: { go.errors-panics-and-api-contracts: high }
 * ```
 */
import { parse } from 'yaml';
import * as z from 'zod';

import { FINDING_SEVERITIES, type FindingSeverity, type ReviewFinding } from './types.ts';

/** Where the profile lives in the reviewed repo. */
export const PROFILE_PATH = '.pr-review.yml';

const RuleRef = z
	.string()
	.trim()
	.regex(/^[\w-]+(\.[\w-]+)?$/, 'a rule doc (python) or checklist item (python.performance)');

export const ReviewProfileSchema = z
	.object({
		reviewTests: z.boolean().default(true),
		addedLinesOnly: z.boolean().default(false),
		exclude: z.array(z.string().min(1).max(200)).max(200).default([]),
		disable: z.array(RuleRef).max(500).default([]),
		summaryOnly: z.array(RuleRef).max(500).default([]),
		severity: z.record(RuleRef, z.enum(FINDING_SEVERITIES)).default({}),
	})
	.strict();

export type ReviewProfile = z.infer<typeof ReviewProfileSchema>;

export const DEFAULT_PROFILE: ReviewProfile = ReviewProfileSchema.parse({});

/** Parse the profile text. Invalid content falls back to the defaults, with the reason. */
export const parseProfile = (text: string | undefined): { profile: ReviewProfile; warning?: string } => {
	if (!text?.trim()) return { profile: DEFAULT_PROFILE };
	try {
		const result = ReviewProfileSchema.safeParse(parse(text) ?? {});
		if (result.success) return { profile: result.data };
		return {
			profile: DEFAULT_PROFILE,
			warning: `${PROFILE_PATH} ignored (invalid): ${z.prettifyError(result.error).replace(/\n/g, ' ')}`,
		};
	} catch (error) {
		return {
			profile: DEFAULT_PROFILE,
			warning: `${PROFILE_PATH} ignored (not YAML): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
		};
	}
};

/** Does `ref` (a rule doc or checklist item) cover the checklist item `ruleId`? */
export const coversRule = (ref: string, ruleId: string): boolean => ruleId === ref || ruleId.startsWith(`${ref}.`);

/** The severity the profile gives a finding (summaryOnly → low; explicit severity wins). */
export const profiledSeverity = (finding: ReviewFinding, profile: ReviewProfile): FindingSeverity | undefined => {
	const id = finding.ruleId;
	if (!id) return finding.severity;
	const explicit = Object.entries(profile.severity).find(([ref]) => coversRule(ref, id));
	if (explicit) return explicit[1];
	if (profile.summaryOnly.some((ref) => coversRule(ref, id))) return 'low';
	return finding.severity;
};
