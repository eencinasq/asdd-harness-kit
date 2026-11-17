import * as z from 'zod';

/**
 * Output schemas of the security audit tools (security-review REQ-010). Loose objects over the known fields, like the
 * other tools' outputs, so an added field never turns a result into an error.
 */

const LedgerEntryOutput = z.looseObject({
	id: z.string(),
	title: z.string(),
	status: z.enum(['pending', 'reviewed']),
});

export const SecurityStartOutput = z.looseObject({
	runId: z.string(),
	languages: z.record(z.string(), z.number()),
	surfaces: z.array(z.string()),
	ledger: z.array(LedgerEntryOutput),
});

export const SecurityChecklistOutput = z.looseObject({
	id: z.string(),
	title: z.string(),
	page: z.number(),
	pages: z.number(),
});

export const SecuritySubmitOutput = z.looseObject({
	runId: z.string(),
	accepted: z.number(),
	total: z.number(),
	ledger: z.array(LedgerEntryOutput),
	warnings: z.array(z.string()),
});

export const SecurityStatusOutput = z.looseObject({
	kind: z.literal('security-audit'),
	run: z.looseObject({ id: z.string(), startedAt: z.string(), repo: z.string() }),
	counts: z.looseObject({
		total: z.number(),
		byVerdict: z.record(z.string(), z.number()),
		bySeverity: z.record(z.string(), z.number()),
	}),
	coverage: z.looseObject({ reviewed: z.number(), total: z.number() }),
	ledger: z.array(LedgerEntryOutput),
	needsValidation: z.array(z.looseObject({ fingerprint: z.string(), title: z.string() })),
	findings: z.looseObject({
		page: z.number(),
		pages: z.number(),
		items: z.array(
			z.looseObject({
				fingerprint: z.string(),
				title: z.string(),
				verdict: z.string(),
				severity: z.string().nullable(),
				location: z.string(),
			}),
		),
	}),
});
