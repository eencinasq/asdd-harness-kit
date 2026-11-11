import { Inject, Injectable } from '@nestjs/common';
import { Resource, Tool } from '@nestjs/mcp';

import { appToolMeta, RESOURCE_MIME_TYPE, readAppHtml } from '../common/mcp/mcp-app.util.ts';
import {
	type AuditDiffInput,
	AuditDiffInputSchema,
	type AuditFindingInput,
	AuditFindingInputSchema,
	type AuditReportInput,
	AuditReportInputSchema,
	type GenerateCiGateInput,
	GenerateCiGateInputSchema,
	type VerifyArchitectureInput,
	VerifyArchitectureInputSchema,
	type VerifySpecComplianceInput,
	VerifySpecComplianceInputSchema,
} from './audit.schemas.ts';
import { AuditService } from './audit.service.ts';
import type { AuditPayload, AuditToolName } from './audit.types.ts';
import { FindingsPageStore } from './audit-paging.ts';
import { generateCiGate } from './ci-templates.ts';

export const AUDIT_UI_URI = 'ui://spec-drift/audit-dashboard.html';
const AUDIT_UI_FILE = 'audit-dashboard.html';
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/**
 * The text and structuredContent carry the same payload, compacted to the MCP App size budget; `{ error }`
 * payloads are tool errors.
 */
const toolResult = (payload: AuditPayload) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
	structuredContent: payload as Record<string, unknown>,
	isError: Boolean(payload.error),
});

/**
 * MCP entry points for the harness governance view (spec drift, architecture rules, spec compliance, CI gate, audit
 * reports). Every check runs in the vendored asdd harness (src/harness) through AuditService; these handlers only page and present.
 */
@Injectable()
export class AuditTools {
	private readonly pages = new FindingsPageStore();

	constructor(@Inject(AuditService) private readonly audit: AuditService) {}

	@Tool({
		name: 'audit_diff',
		title: 'Audit a diff for spec drift',
		annotations: READ_ONLY,
		description:
			'Spec drift (DRIFT-01..07) and architecture rules for a diff, with a summary (files_analyzed, spec_compliance, drift_level). mode "review" adds DRIFT-07 and applies TL triage.',
		inputSchema: AuditDiffInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	auditDiff(args: AuditDiffInput) {
		return this.run('audit_diff', args.page_token, args.offset, () => this.audit.auditDiff(args));
	}

	@Tool({
		name: 'verify_architecture_rules',
		title: 'Verify architecture rules',
		annotations: READ_ONLY,
		description:
			'Read domain-layer.md, domain-layer.project.md, product.md, structure.md, and tech.md. Select .semgrep.yml (or the Semgrep rules binding) or generate a temporary config from the boundary table, run semgrep scan --json, and return violations with fixes. Also runs the Gate command when it is bound. Unconfigured and a missing semgrep binary are not a pass. Does not write .semgrep.yml.',
		inputSchema: VerifyArchitectureInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	verifyArchitectureRules(args: VerifyArchitectureInput) {
		return this.run('verify_architecture_rules', args.page_token, args.offset, () => {
			const source = args.source?.trim();
			if (source) return this.audit.architectureSources(source === 'list' ? undefined : source);
			return this.audit.verifyArchitectureRules(args.paths ?? [], { includeText: args.include_text ?? false });
		});
	}

	@Tool({
		name: 'verify_spec_compliance',
		title: 'Verify spec compliance',
		annotations: READ_ONLY,
		description:
			'Compare a slice spec with the code: the "ears" adapter (requirement coverage and test mentions) plus enabled module adapters (for example "openapi").',
		inputSchema: VerifySpecComplianceInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	verifySpecCompliance(args: VerifySpecComplianceInput) {
		return this.run('verify_spec_compliance', undefined, undefined, () =>
			this.audit.verifySpecCompliance(args.slice_id, args.adapter?.trim() || undefined),
		);
	}

	@Tool({
		name: 'generate_ci_gate',
		title: 'Generate CI gate',
		annotations: READ_ONLY,
		description:
			'Return CI configuration text (GitHub or GitLab) that runs check-invariants (including spec drift). Carries no threshold; does not write files.',
		inputSchema: GenerateCiGateInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	generateCiGate(args: GenerateCiGateInput) {
		return this.run('generate_ci_gate', undefined, undefined, async () => generateCiGate(args.provider));
	}

	@Tool({
		name: 'audit_report',
		title: 'Codebase audit report',
		annotations: READ_ONLY,
		description:
			'Latest codebase audit report from .harness/audits/, including Semgrep problems and fixes, filtered by severity or by findings seen since a date.',
		inputSchema: AuditReportInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	auditReport(args: AuditReportInput) {
		return this.run('audit_report', args.page_token, args.offset, () => this.audit.auditReport(args));
	}

	@Tool({
		name: 'audit_finding',
		title: 'Trace one finding',
		annotations: READ_ONLY,
		description:
			'One finding (from the latest audit_diff or audit report) with its knowledge-graph trace (REQ, feature, file).',
		inputSchema: AuditFindingInputSchema,
		_meta: appToolMeta(AUDIT_UI_URI),
	})
	auditFinding(args: AuditFindingInput) {
		return this.run('audit_finding', undefined, undefined, () => this.audit.auditFinding(args.id));
	}

	@Resource({
		uri: 'spec://manifest',
		name: 'Harness manifest',
		mimeType: 'application/json',
		description: 'Generated registry and per-slice manifests of active slices',
	})
	manifest() {
		return JSON.stringify(this.audit.manifestView(), null, 2);
	}

	@Resource({
		uri: 'spec://rules/architecture',
		name: 'Architecture rules',
		mimeType: 'text/markdown',
		description:
			'domain-layer contract and project binding, plus product, structure, and tech bindings (paths from project.json) and QG-DOM / QG-DRIFT gates. Unfilled stubs are marked, not quoted.',
	})
	architectureRules() {
		return this.audit.architectureRules();
	}

	@Resource({
		uri: 'spec://drift/latest-report',
		name: 'Latest drift report',
		mimeType: 'application/json',
		description:
			'Latest audit_diff result in this server process, else the latest .harness/audits report, else a fresh drift check',
	})
	async latestReport() {
		return JSON.stringify(await this.audit.latestDriftReport(), null, 2);
	}

	@Resource({ uri: AUDIT_UI_URI, name: AUDIT_UI_URI, mimeType: RESOURCE_MIME_TYPE })
	dashboard() {
		return readAppHtml(AUDIT_UI_URI, AUDIT_UI_FILE);
	}

	/** A page_token returns the next findings of an earlier result instead of running the check again. */
	private async run(
		tool: AuditToolName,
		pageToken: string | undefined,
		offset: number | undefined,
		check: () => Promise<AuditPayload>,
	) {
		const token = pageToken?.trim();
		if (token) return toolResult(this.pages.page(token, offset));
		return toolResult(this.pages.compact(await check(), tool));
	}
}
