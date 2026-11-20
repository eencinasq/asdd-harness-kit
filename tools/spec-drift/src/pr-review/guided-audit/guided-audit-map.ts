/**
 * Map security_audit findings → PR Security / Findings inbox items (REQ-028 / REQ-029).
 * Only `confirmed` with a file:line sink/evidence location become pin-able findings.
 */

import type { SecurityFinding, SeverityLevel } from '../../security/findings.ts';
import { severityOf } from '../../security/findings.ts';
import type { ArchitectureFinding } from '../architecture/architecture.types.ts';
import type { GuidedAuditFinding } from './guided-audit.types.ts';

const SEV_TO_ANALYZER: Record<SeverityLevel, string> = {
	critical: 'CRITICAL',
	high: 'ERROR',
	medium: 'WARNING',
	low: 'INFO',
	informational: 'INFO',
};

const locationOf = (f: SecurityFinding): { readonly file: string; readonly line: number } | undefined => {
	const sink = [...f.trace].reverse().find((t) => t.kind === 'sink') ?? f.evidence[0] ?? f.trace[0];
	if (!sink?.file || typeof sink.line !== 'number' || sink.line < 1) return undefined;
	return { file: sink.file, line: sink.line };
};

/** Convert one confirmed finding; null when not confirmed or missing file:line. */
export const confirmedToGuidedFinding = (f: SecurityFinding): GuidedAuditFinding | null => {
	if (f.verdict !== 'confirmed') return null;
	const loc = locationOf(f);
	if (!loc) return null;
	const sev = severityOf(f) ?? 'medium';
	const base: ArchitectureFinding = {
		checkId: f.title.slice(0, 160),
		path: loc.file,
		startLine: loc.line,
		endLine: loc.line,
		severity: SEV_TO_ANALYZER[sev],
		message: f.description.slice(0, 2000),
	};
	return { ...base, fingerprint: f.fingerprint };
};

/** Confirmed + file:line only, sorted by fingerprint. */
export const mapConfirmedGuidedFindings = (findings: readonly SecurityFinding[]): readonly GuidedAuditFinding[] =>
	findings
		.map(confirmedToGuidedFinding)
		.filter((f): f is GuidedAuditFinding => f !== null)
		.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));

/** Wrap the methodology prompt with PR-scoped next steps (start/sync). */
export const buildGuidedAuditHostPrompt = (options: {
	readonly pr: number;
	readonly runId: string;
	readonly paths: readonly string[];
	readonly methodologyPrompt: string;
}): string => {
	const scope =
		options.paths.length === 0
			? '(no changed-file list — focus on the PR diff)'
			: options.paths.slice(0, 40).join(', ') + (options.paths.length > 40 ? '…' : '');
	return [
		`# Guided security audit for PR #${options.pr}`,
		'',
		`Run id: \`${options.runId}\` (already started; do **not** call security_audit_start again unless this run is lost).`,
		`Scoped PR paths: ${scope}`,
		'',
		'## How',
		`1. Follow the methodology prompt below. Use security_audit_checklist and security_audit_submit_findings with runId \`${options.runId}\`.`,
		'2. Prefer **confirmed** findings only when evidence is solid; put uncertain candidates as needs_validation (they stay out of the PR Findings inbox).',
		`3. When you have submitted findings, call \`pr_review_sync_guided_audit\` with pr=${options.pr} and runId \`${options.runId}\` so the Security tab and Findings inbox refresh. Or tell the reviewer to Reload.`,
		'',
		'## Methodology prompt',
		options.methodologyPrompt,
	].join('\n');
};
