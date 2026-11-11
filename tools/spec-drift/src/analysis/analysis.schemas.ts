import path from 'node:path';

import * as z from 'zod';

import { PACK_ID_PATTERN } from './domain/pack-selection.ts';

/** A path inside the analyzed repo: relative, no `..`, and not option-like. */
const RepoRelativePath = z
	.string()
	.min(1)
	.refine((p) => !p.startsWith('-'), 'must not start with "-"')
	.refine((p) => !path.isAbsolute(p), 'must be relative to the repo root')
	.refine((p) => !path.normalize(p).split(path.sep).includes('..'), 'must not leave the repo root');

export const AnalyzeInputSchema = z.object({
	mode: z
		.enum(['architecture', 'standards', 'all', 'spec-drift'])
		.default('spec-drift')
		.describe('Which rule set to run: architecture, standards, or every pack (all / spec-drift)'),
	packs: z
		.array(z.string().regex(PACK_ID_PATTERN, 'pack ids use letters, digits, dots, dashes or underscores'))
		.optional()
		.describe('Optional subset of rule packs (ids from list_rule_packs; overrides mode defaults)'),
	paths: z.array(RepoRelativePath).optional().describe('Optional relative paths under the repo root to limit the scan'),
	severity: z.enum(['ERROR', 'WARNING', 'INFO']).optional().describe('Minimum severity to report'),
});

/** Same as AnalyzeInputSchema, with `mode` pinned to one value. */
export const scopedAnalyzeSchema = <M extends 'architecture' | 'standards'>(mode: M) =>
	AnalyzeInputSchema.omit({ mode: true }).extend({ mode: z.literal(mode).default(mode) });

export const EmptyInputSchema = z.object({});

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
export type ScopedAnalyzeInput = Omit<AnalyzeInput, 'mode'>;
