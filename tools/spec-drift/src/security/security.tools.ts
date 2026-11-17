import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Resource, Tool } from '@nestjs/mcp';

import { appToolMeta, RESOURCE_MIME_TYPE, readAppHtml } from '../common/mcp/mcp-app.util.ts';
import { checklistPage } from './checklists.ts';
import {
	SecurityChecklistOutput,
	SecurityStartOutput,
	SecurityStatusOutput,
	SecuritySubmitOutput,
} from './security.output.ts';
import {
	type SecurityChecklistInput,
	SecurityChecklistSchema,
	type SecurityStartInput,
	SecurityStartSchema,
	type SecurityStatusInput,
	SecurityStatusSchema,
	type SecuritySubmitInput,
	SecuritySubmitSchema,
} from './security.schemas.ts';
import { SecurityAuditService, type SecurityStatus } from './security.service.ts';

export const SECURITY_UI_URI = 'ui://spec-drift/security-dashboard.html';
const SECURITY_UI_FILE = 'security-dashboard.html';

/** Said in every tool description: the methodology's execution-safety rules (security-review REQ-010). */
const SAFETY =
	'Read-only on the repository: it never runs project code, installs dependencies, uses the network, or writes into the repository.';

const statusText = (s: SecurityStatus): string =>
	[
		`Security audit ${s.run.id} of ${s.run.repo} — ${s.counts.total} finding(s); checklists reviewed ${s.coverage.reviewed}/${s.coverage.total}.`,
		`By verdict: ${
			Object.entries(s.counts.byVerdict)
				.map(([k, v]) => `${k} ${v}`)
				.join(', ') || 'none'
		}. Confirmed by severity: ${
			Object.entries(s.counts.bySeverity)
				.map(([k, v]) => `${k} ${v}`)
				.join(', ') || 'none'
		}.`,
		...s.findings.items.map((f) => `- [${f.severity ?? f.verdict}] ${f.title} (${f.location}) — ${f.fingerprint}`),
		s.findings.pages > 1 ? `Page ${s.findings.page}/${s.findings.pages}.` : '',
		s.ledger.some((e) => e.status === 'pending')
			? `Pending checklists: ${s.ledger
					.filter((e) => e.status === 'pending')
					.map((e) => e.id)
					.join(', ')}.`
			: 'Every checklist of the run is reviewed.',
	]
		.filter(Boolean)
		.join('\n');

/**
 * MCP entry points of the security audit (security-review): a guidance-mode run of the vendored
 * cloudflare/security-audit-skill methodology. Loaded under the `security` toolset.
 */
@Injectable()
export class SecurityTools {
	constructor(@Inject(SecurityAuditService) private readonly security: SecurityAuditService) {}

	@Tool({
		name: 'security_audit_start',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Start a security audit',
		description: `Start a security audit of the repository (cloudflare/security-audit-skill methodology, guidance mode): reconnaissance of languages and surfaces (HTTP, frontend, LLM, database, messaging, supply chain, deployment, native code), the checklists that apply, a coverage ledger, and the audit prompt. Then read checklists with security_audit_checklist and submit findings with security_audit_submit_findings. ${SAFETY} Run state is kept outside the repository.`,
		inputSchema: SecurityStartSchema,
		outputSchema: SecurityStartOutput,
	})
	async start(args: SecurityStartInput) {
		const { run, prompt } = await this.security.start({ paths: args.paths });
		return {
			content: [{ type: 'text' as const, text: prompt }],
			structuredContent: {
				runId: run.id,
				languages: run.recon.languages,
				surfaces: [...run.recon.surfaces],
				ledger: [...run.ledger],
			},
		};
	}

	@Tool({
		name: 'security_audit_checklist',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Read a security checklist',
		description: `One page of a security methodology checklist (core, reconnaissance, attack-classes, hunting, validation-and-reporting, web-protocol-and-auth, client-side, protocols-rpc-and-messaging, data-isolation-and-lifecycle, supply-chain-and-release, cloud-and-deployment, ai-and-llm, resource-exhaustion-and-availability, desktop-mobile-and-local-ipc, memory-safety-and-binary). ${SAFETY}`,
		inputSchema: SecurityChecklistSchema,
		outputSchema: SecurityChecklistOutput,
	})
	checklist(args: SecurityChecklistInput) {
		let page: ReturnType<typeof checklistPage>;
		try {
			page = checklistPage(args.id, args.page);
		} catch (error) {
			throw new BadRequestException((error as Error).message);
		}
		const footer = page.page < page.pages ? `\n\n— page ${page.page}/${page.pages}; next: page ${page.page + 1}` : '';
		return {
			content: [{ type: 'text' as const, text: `${page.text}${footer}` }],
			structuredContent: { id: page.id, title: page.title, page: page.page, pages: page.pages },
		};
	}

	@Tool({
		name: 'security_audit_submit_findings',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		title: 'Submit security findings',
		description: `Submit findings of a security audit run in the methodology's report-schema.json format, with the checklists they complete. The skill's own validator checks them (trace entrypoint → sink, evidence, verdict rules), and every trace/evidence file and line must exist in the repository; one invalid finding rejects the whole submission with every error. Valid findings are stored in the run state (outside the repository), merged by fingerprint. ${SAFETY}`,
		inputSchema: SecuritySubmitSchema,
		outputSchema: SecuritySubmitOutput,
	})
	async submit(args: SecuritySubmitInput) {
		const result = await this.security.submit(args);
		const pending = result.ledger.filter((e) => e.status === 'pending').map((e) => e.id);
		const text = [
			`Accepted ${result.accepted} finding(s); the run now holds ${result.total}.`,
			...result.warnings.map((w) => `Warning: ${w}`),
			pending.length
				? `Pending checklists: ${pending.join(', ')}.`
				: 'Every checklist is reviewed: call security_audit_status to open the dashboard.',
		].join('\n');
		return {
			content: [{ type: 'text' as const, text }],
			structuredContent: {
				runId: result.runId,
				accepted: result.accepted,
				total: result.total,
				ledger: [...result.ledger],
				warnings: [...result.warnings],
			},
		};
	}

	@Tool({
		name: 'security_audit_status',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Security audit dashboard',
		description: `Open the security audit dashboard for a run (default: the latest): findings by verdict and severity, checklist coverage, what still needs validation, and a page of findings. ${SAFETY}`,
		inputSchema: SecurityStatusSchema,
		outputSchema: SecurityStatusOutput,
		_meta: appToolMeta(SECURITY_UI_URI),
	})
	async status(args: SecurityStatusInput) {
		const status = await this.security.status({ runId: args.runId, page: args.page });
		return {
			content: [{ type: 'text' as const, text: statusText(status) }],
			structuredContent: { kind: 'security-audit' as const, ...status },
		};
	}

	@Resource({ uri: SECURITY_UI_URI, name: SECURITY_UI_URI, mimeType: RESOURCE_MIME_TYPE })
	dashboard() {
		return readAppHtml(SECURITY_UI_URI, SECURITY_UI_FILE);
	}
}
