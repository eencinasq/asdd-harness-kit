import * as z from 'zod';

const nonEmpty = (name: string) => z.string().trim().min(1, `${name} must be a non-empty string`);

export const SearchInputSchema = z.object({
	query: nonEmpty('query').describe('Natural-language query or keywords'),
	k: z.coerce
		.number()
		.int()
		.default(5)
		.transform((k) => Math.max(1, Math.min(k || 5, 25)))
		.describe('Max results (1-25)'),
	slice_id: z.string().optional().describe('Restrict results to one slice'),
});

export const TraceInputSchema = z.object({
	id: nonEmpty('id').describe('Node id to start from'),
	depth: z.coerce
		.number()
		.int()
		.default(2)
		.transform((d) => Math.max(1, Math.min(d || 2, 4)))
		.describe('Max hops (1-4)'),
});

export const SliceInputSchema = z.object({
	slice_id: nonEmpty('slice_id').describe('Slice identifier (dir under .harness/specs or state)'),
});

export const StatusInputSchema = z.object({});

export const PATTERN_STATUSES = [
	'open',
	'watching',
	'proposed',
	'accepted',
	'rejected',
	'applied',
	'verified',
] as const;

export const PatternsInputSchema = z.object({
	status: z
		.enum(PATTERN_STATUSES)
		.optional()
		.describe('Only patterns in this status (default: everything except watching)'),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;
export type TraceInput = z.infer<typeof TraceInputSchema>;
export type SliceInput = z.infer<typeof SliceInputSchema>;
export type PatternsInput = z.infer<typeof PatternsInputSchema>;
