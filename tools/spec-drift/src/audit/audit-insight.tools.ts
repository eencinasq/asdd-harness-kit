import { Inject, Injectable } from '@nestjs/common';
import { Tool } from '@nestjs/mcp';

import { appToolMeta } from '../common/mcp/mcp-app.util.ts';
import { AuditService } from './audit.service.ts';
import { AUDIT_UI_URI } from './audit.tools.ts';
import type { AuditPayload } from './audit.types.ts';
import {
	type AuditQueryInput,
	AuditQueryInputSchema,
	AuditQueryOutput,
	type LearningReportInput,
	LearningReportInputSchema,
	LearningReportOutput,
	type TraceabilityInput,
	TraceabilityInputSchema,
	TraceabilityOutput,
} from './audit-insight.output.ts';
import { queryFindings } from './audit-query.ts';

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const result = (payload: AuditPayload) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
	structuredContent: payload as Record<string, unknown>,
	isError: Boolean(payload.error),
});

/**
 * Read-only insight over the harness (spec-drift-apps): a server-side query over audit findings, and the learning loop
 * with the commands a human runs next. Like every audit tool, these write nothing to the repository; triage and proposal
 * decisions stay with the Tech Lead at the asdd CLI.
 */
@Injectable()
export class AuditInsightTools {
	constructor(@Inject(AuditService) private readonly audit: AuditService) {}

	@Tool({
		name: 'audit_query',
		title: 'Query audit findings',
		annotations: READ_ONLY,
		description:
			'Filter and count audit findings on the server (by slice, severity, check, source, path prefix) and group them (slice, severity, check, top-level path). Returns totals, per-group counts, and at most `limit` findings — use it instead of paging through audit_report or audit_diff to summarize. Writes nothing.',
		inputSchema: AuditQueryInputSchema,
		outputSchema: AuditQueryOutput,
	})
	async auditQuery(args: AuditQueryInput) {
		const source = await this.audit.findingsFrom(args.from ?? 'auto');
		const group_by = args.group_by ?? 'none';
		if ('no_data' in source) {
			const empty = { total: 0, matched: 0, group_by, groups: [], findings: [], truncated: false };
			return result({ from: source.from, ...empty, no_data: source.no_data });
		}
		const { slice_id, severity, check, source: origin, path_prefix } = args;
		const query = queryFindings(
			source.findings,
			{ slice_id, severity, check, source: origin, path_prefix },
			group_by,
			args.limit ?? 20,
		);
		return result({ from: source.from, ...query });
	}

	@Tool({
		name: 'learning_report',
		title: 'Learning loop report',
		annotations: READ_ONLY,
		description:
			'The self-improving harness, read-only: learning patterns (open, in flight, verified), steering proposals with the fields each still lacks, and the asdd command a human runs next (asdd learn --propose, the Tech Lead decision). Opens the audit dashboard. Writes nothing.',
		inputSchema: LearningReportInputSchema,
		outputSchema: LearningReportOutput,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	async learningReport(args: LearningReportInput) {
		return result(await this.audit.learningReport(args.limit));
	}

	@Tool({
		name: 'traceability_matrix',
		title: 'Traceability matrix',
		annotations: READ_ONLY,
		description:
			'Requirement → features (status) → owned files → test files → PR numbers, one row per requirement from the knowledge index, with gaps (no-feature, no-test, not-passing), totals, and a Markdown table for an audit document. Opens the audit dashboard. Writes nothing; run asdd knowledge sync first when specs changed.',
		inputSchema: TraceabilityInputSchema,
		outputSchema: TraceabilityOutput,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	async traceabilityMatrix(args: TraceabilityInput) {
		return result(await this.audit.traceabilityMatrix(args));
	}
}
