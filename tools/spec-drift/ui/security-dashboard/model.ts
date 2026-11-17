/**
 * Security audit view model (security-review REQ-009): turns a `security_audit_status` result into HTML. Pure, so it
 * runs under node:test; main.ts wires it to the MCP App.
 */
import type { SecurityStatus } from '../../src/security/security.service.ts';
import { emptyState, escapeHtml, plural } from '../shared/ui.ts';

export type StatusView = SecurityStatus & { readonly kind: 'security-audit' };

/** The structured result of a status call, or null when the result is something else. */
export const statusOf = (result: { structuredContent?: unknown }): StatusView | null => {
	const c = result.structuredContent as Partial<StatusView> | undefined;
	return c && c.kind === 'security-audit' && c.run && c.counts && c.findings ? (c as StatusView) : null;
};

const SEVERITY_TONE: Record<string, string> = {
	critical: 'tone-danger',
	high: 'tone-danger',
	medium: 'tone-warning',
	low: '',
	informational: '',
};

const kpi = (label: string, value: string, hint = ''): string =>
	`<div class="kpi"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-value">${escapeHtml(value)}</strong>${
		hint ? `<span class="kpi-hint">${escapeHtml(hint)}</span>` : ''
	}</div>`;

const counts = (record: Readonly<Record<string, number>>): string =>
	Object.entries(record)
		.map(([k, v]) => `${k} ${v}`)
		.join(' · ') || 'none';

export const renderStatus = (s: StatusView): string => {
	const kpis = `<section class="kpis">${[
		kpi('Findings', String(s.counts.total), counts(s.counts.byVerdict)),
		kpi(
			'Confirmed by severity',
			String(Object.values(s.counts.bySeverity).reduce((a, b) => a + b, 0)),
			counts(s.counts.bySeverity),
		),
		kpi('Checklists reviewed', `${s.coverage.reviewed}/${s.coverage.total}`),
		kpi('Needs validation', String(s.counts.byVerdict['needs_validation'] ?? 0)),
	].join('')}</section>`;

	const findings = s.findings.items.length
		? `<ul class="list">${s.findings.items
				.map(
					(f) => `<li class="item">
						<div class="item-head">
							<span class="badge ${f.severity ? (SEVERITY_TONE[f.severity] ?? '') : ''}">${escapeHtml(f.severity ?? f.verdict)}</span>
							<span class="item-title">${escapeHtml(f.title)}</span>
							<code class="item-path">${escapeHtml(f.location)}</code>
						</div>
						<p class="subtle mono">${escapeHtml(f.fingerprint)}</p>
					</li>`,
				)
				.join(
					'',
				)}</ul>${s.findings.pages > 1 ? `<p class="meta">Page ${s.findings.page} of ${s.findings.pages}</p>` : ''}`
		: emptyState('No findings yet', 'Submit findings with security_audit_submit_findings.');

	const ledger = `<ul class="list">${s.ledger
		.map(
			(e) =>
				`<li class="item"><div class="item-head"><span class="badge ${e.status === 'reviewed' ? 'tone-success' : ''}">${
					e.status === 'reviewed' ? '✓ reviewed' : 'pending'
				}</span><span class="item-title">${escapeHtml(e.title)}</span><code class="item-path">${escapeHtml(e.id)}</code></div></li>`,
		)
		.join('')}</ul>`;

	const needs = s.needsValidation.length
		? `<ul class="list">${s.needsValidation
				.map(
					(n) =>
						`<li class="item"><div class="item-head"><span class="item-title">${escapeHtml(n.title)}</span><code class="item-path">${escapeHtml(n.fingerprint)}</code></div></li>`,
				)
				.join('')}</ul>`
		: emptyState('Nothing waiting for validation', 'Every finding is confirmed or rejected.', 'success');

	return [
		kpis,
		`<section class="card"><div class="card-header"><h2>Findings</h2><span class="count">${escapeHtml(plural(s.counts.total, 'finding'))}</span></div>${findings}</section>`,
		`<section class="card"><div class="card-header"><h2>Needs validation</h2></div><p class="subtle">needs_validation findings carry blockers and a validation plan; confirm them only with a sandboxed reproduction.</p>${needs}</section>`,
		`<section class="card"><div class="card-header"><h2>Checklist coverage</h2><span class="count">${s.coverage.reviewed}/${s.coverage.total}</span></div>${ledger}</section>`,
	].join('');
};
