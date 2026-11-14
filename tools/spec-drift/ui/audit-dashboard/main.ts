import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import './audit.css';
import type { AuditFinding, KnowledgeEdge, KnowledgeNode } from '../../src/audit/audit.types.ts';
import {
	$,
	connectApp,
	createStatus,
	emptyState,
	errorMessage,
	escapeHtml,
	plural,
	toolErrorText,
	withBusyButton,
} from '../shared/ui.ts';
import {
	type Action,
	actionsFor,
	type Details,
	type Kind,
	mergePage,
	messageFor,
	nextOffset,
	type Payload,
	payloadOf,
	percent,
	resolveMode,
	SEVERITIES,
	traceSummary,
	triageCommand,
	type ViewModel,
	viewModel,
} from './model.ts';

const MAX_PATHS = 6;

const TITLES: Record<Kind, string> = {
	diff: 'Spec drift',
	compliance: 'Spec compliance',
	audit: 'Codebase audit',
	architecture: 'Architecture',
	finding: 'Finding',
	ci: 'CI gate',
	learning: 'Learning loop',
	traceability: 'Traceability',
};

type TraceState =
	| { loading: true }
	| { error: string }
	| { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; indexed: boolean; paths: readonly string[] };
type TextState = { loading: true } | { error: string } | { text: string; note?: string };

const titleEl = $('title');
const modeLabel = $('mode-label');
const metaEl = $('meta');
const loading = $('loading');
const content = $('content');
const appRoot = $('app');
const refreshBtn = $<HTMLButtonElement>('refresh');
const setStatus = createStatus($('status'));

let payload: Payload | null = null;
let args: Payload = {};
let toolName: string | null = null;
let severityFilter = 'all';
let sourceFilter = 'all';
let paging: { loading: true } | { error: string } | null = null;
/** Per finding id: the action sent, an open trace, an open dismiss reason. */
const sent = new Map<string, string>();
const traces = new Map<string, TraceState>();
const reasons = new Map<string, string>();
/** Per finding id: the triage command shown to copy (the view records nothing itself). */
const commands = new Map<string, string>();
/** Source texts loaded on demand (verify_architecture_rules { source }). */
const texts = new Map<string, TextState>();
/** Findings currently rendered, by data-index. */
let rendered: AuditFinding[] = [];

const app = new App({ name: 'Spec drift audit', version: '1.0.0' });

const callTool = async (name: string, toolArgs: Payload): Promise<Payload | null> => {
	const result = await app.callServerTool({ name, arguments: toolArgs });
	const data = payloadOf(result);
	if (result.isError && !data?.['error']) return { error: toolErrorText(result) || `${name} failed` };
	return data;
};

// ── Small renderers ──────────────────────────────────────────────────────────

const severityClass = (severity: string): string =>
	severity === 'fail' ? 'sev-error' : severity === 'warn' ? 'sev-warning' : 'sev-advisory';

const statusTone = (status: string): string =>
	status === 'pass'
		? 'tone-success'
		: status === 'fail'
			? 'tone-danger'
			: status === 'error' || status === 'unavailable'
				? 'tone-warning'
				: '';

const levelTone = (level: string | undefined): string =>
	level === 'blocking' ? 'tone-danger' : level === 'warning' ? 'tone-warning' : level === 'clean' ? 'tone-success' : '';

const badge = (text: string, tone = ''): string => `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
const mono = (text: string | number): string => `<code>${escapeHtml(String(text))}</code>`;
const pre = (text: string): string => `<pre class="block">${escapeHtml(text)}</pre>`;
const disclosure = (summary: string, body: string): string =>
	`<details class="disclosure"><summary>${escapeHtml(summary)}</summary><div class="disclosure-body">${body}</div></details>`;
const table = (head: string[], rows: string[][]): string =>
	`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
		.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
		.join('')}</tbody></table></div>`;

/** A command a human runs in a terminal, with a copy button (the view and the server write nothing). */
const commandBlock = (command: string): string =>
	`<div class="command"><code>${escapeHtml(command)}</code><button type="button" class="btn btn-sm" data-action="copy" data-text="${escapeHtml(command)}">Copy</button></div>`;

/** The learning loop, read-only: patterns, proposals, what each proposal lacks, and the next command (REQ-002). */
/** Team PR review quality (review-quality REQ-005): how many drafted comments humans kept, edited, or removed. */
const renderReviewQuality = (q: Payload | null | undefined): string => {
	if (!q) return '';
	const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '—');
	const acceptance = q['acceptance'] === null ? '—' : `${Math.round(100 * q['acceptance'])}%`;
	const rules = (q['by_rule'] as Payload[]).length
		? table(
				['Checklist rule', 'Drafted', 'Kept', 'Edited', 'Removed'],
				(q['by_rule'] as Payload[]).map((r) => [
					mono(r['rule']),
					escapeHtml(String(r['drafted'])),
					escapeHtml(pct(r['kept'], r['drafted'])),
					escapeHtml(pct(r['edited'], r['drafted'])),
					r['removed'] ? badge(pct(r['removed'], r['drafted']), 'tone-warning') : escapeHtml('0%'),
				]),
			)
		: '';
	return `<h2>PR review quality</h2><p>${escapeHtml(`${q['reviews']} published review(s): ${q['drafted']} drafted comment(s), ${acceptance} kept or edited, ${q['removed']} removed.`)}</p>${rules}`;
};

const GAP_LABEL: Record<string, string> = {
	'no-feature': 'no feature',
	'no-test': 'no test',
	'not-passing': 'not passing',
};

/** Requirement → features → tests → PRs, with gaps (spec-drift-depth REQ-001). */
const renderTraceability = (vm: ViewModel): string => {
	const t = vm.traceability;
	if (!t) return '';
	const n = (k: string): number => Number(t.totals[k] ?? 0);
	const counts = [
		badge(`${n('requirements')} requirements`),
		badge(`${n('with_feature')} with a feature`),
		badge(`${n('tested')} tested`, n('tested') === n('requirements') ? 'tone-success' : ''),
		badge(`${n('passing')} passing`, n('passing') === n('requirements') ? 'tone-success' : ''),
		badge(`${n('with_gaps')} with gaps`, n('with_gaps') ? 'tone-warning' : 'tone-success'),
	].join(' ');
	const list = (items: string[], max = 3): string =>
		items.length
			? `${items
					.slice(0, max)
					.map((i) => mono(i))
					.join('<br>')}${items.length > max ? `<br><span class="subtle">+${items.length - max} more</span>` : ''}`
			: '<span class="subtle">—</span>';
	const rows = t.rows.length
		? table(
				['Requirement', 'Features', 'Tests', 'PRs', 'Gaps'],
				t.rows.map((r) => [
					`${mono(`${r['slice']} · ${r['req_id']}`)}<br>${escapeHtml(String(r['title']))}`,
					(r['features'] as Payload[]).length
						? (r['features'] as Payload[])
								.map((f) =>
									badge(`${f['id']} ${f['status']}`, f['status'] === 'passing' ? 'tone-success' : 'tone-warning'),
								)
								.join(' ')
						: '<span class="subtle">—</span>',
					list(r['tests'] as string[]),
					(r['prs'] as number[]).length
						? escapeHtml((r['prs'] as number[]).map((p) => `#${p}`).join(', '))
						: '<span class="subtle">—</span>',
					(r['gaps'] as string[]).length
						? (r['gaps'] as string[]).map((g) => badge(GAP_LABEL[g] ?? g, 'tone-warning')).join(' ')
						: badge('none', 'tone-success'),
				]),
			)
		: emptyState('No rows', 'No requirement matches.', 'success');
	const copy = t.markdown
		? `<button type="button" class="btn btn-sm" data-action="copy" data-text="${escapeHtml(t.markdown)}">Copy as Markdown</button>`
		: '';
	return `<section class="stack" aria-label="Traceability"><div class="toolbar"><p>${counts}</p>${copy}</div>${rows}${t.note ? `<p class="subtle">${escapeHtml(t.note)}</p>` : ''}</section>`;
};

const renderLearning = (vm: ViewModel): string => {
	const l = vm.learning;
	if (!l) return '';
	const s = l.summary;
	const next = (text: string | null | undefined): string =>
		!text ? '<span class="subtle">—</span>' : text.startsWith('asdd ') ? commandBlock(text) : escapeHtml(text);
	const counts = [
		badge(`${s['open'] ?? 0} open`, (s['open'] ?? 0) > 0 ? 'tone-warning' : 'tone-success'),
		badge(`${s['in_flight'] ?? 0} in flight`),
		badge(`${s['verified'] ?? 0} verified`, 'tone-success'),
		badge(`${s['proposals'] ?? 0} proposals`),
	].join(' ');
	const patterns = l.patterns.length
		? table(
				['Pattern', 'Status', 'Occurrences', 'Signature', 'Next'],
				l.patterns.map((p) => [
					mono(p['id']),
					badge(String(p['status']), p['status'] === 'open' ? 'tone-warning' : ''),
					escapeHtml(`${p['occurrences']} / ${p['threshold']} (${p['kind']})`),
					mono(p['signature']),
					next(p['next']),
				]),
			)
		: '<p class="subtle">No learning patterns yet.</p>';
	const proposals = l.proposals.length
		? table(
				['Proposal', 'Pattern', 'Status', 'Still missing', 'Next'],
				l.proposals.map((p) => [
					mono(p['id'] ?? p['file']),
					p['pattern'] ? mono(p['pattern']) : '—',
					badge(String(p['status'] ?? 'invalid')),
					(p['missing'] as string[]).length
						? `<ul class="plain">${(p['missing'] as string[]).map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
						: badge('complete', 'tone-success'),
					next(p['next']),
				]),
			)
		: '<p class="subtle">No steering proposals.</p>';
	return `<section class="stack" aria-label="Learning loop"><div>${counts}</div>${l.note ? `<div class="callout">${escapeHtml(l.note)}</div>` : ''}${renderReviewQuality(l.reviews)}<h2>Patterns</h2>${patterns}<h2>Steering proposals</h2>${proposals}</section>`;
};

const textBlock = (key: string, label: string): string => {
	const state = texts.get(key);
	const button = `<button type="button" class="btn btn-sm" data-action="load-text" data-key="${escapeHtml(key)}">${state ? `Hide ${escapeHtml(label)}` : `Show ${escapeHtml(label)}`}</button>`;
	if (!state) return button;
	if ('loading' in state) return `${button} <span class="subtle">Loading…</span>`;
	if ('error' in state) return `${button} <span class="subtle">${escapeHtml(state.error)}</span>`;
	return `${button}${state.note ? `<p class="subtle">${escapeHtml(state.note)}</p>` : ''}${pre(state.text)}`;
};

// ── Sections ─────────────────────────────────────────────────────────────────

const renderSummary = (vm: ViewModel): string => {
	const s = vm.summary;
	const parts = [
		badge(vm.level ?? 'unknown', levelTone(vm.level)),
		s['files_analyzed'] !== undefined ? `<span>${plural(s['files_analyzed'], 'file')} analyzed</span>` : '',
		vm.showCompliance ? `<span>spec compliance ${percent(s['spec_compliance'])}</span>` : '',
		s['base'] ? `<span>${mono(`${s['base'].ref ?? s['base']}…${s['target'] ?? 'HEAD'}`)}</span>` : '',
		s['linked_slices']?.length ? `<span>slices: ${escapeHtml(s['linked_slices'].join(', '))}</span>` : '',
		vm.suppressed ? `<span>${vm.suppressed} dismissed by triage</span>` : '',
	];
	return `<div class="chips">${parts.filter(Boolean).join('')}</div>`;
};

const renderChecks = (vm: ViewModel): string => {
	const out: string[] = [];
	if (vm.checks.length) {
		out.push(
			`<div class="chips">${vm.checks
				.map(
					(c) =>
						`<span class="badge ${statusTone(c.status)}" title="${escapeHtml(c.message ?? '')}">${escapeHtml(c.label ?? `${c.id}: ${c.status}`)}</span>`,
				)
				.join('')}</div>`,
		);
	}
	if (vm.unconfigured?.length) {
		out.push(
			`<div class="callout tone-warning">Not checked (unconfigured, not a pass): ${escapeHtml(vm.unconfigured.join(', '))}</div>`,
		);
	}
	const sg = vm.semgrep;
	if (sg) {
		const text = `Semgrep ${sg['status']}${sg['source'] ? ` · ${sg['source']}` : ''}${sg['path'] ? ` · ${sg['path']}` : ''}${sg['message'] ? ` — ${sg['message']}` : ''}`;
		out.push(`<p class="notice">${escapeHtml(text)}</p>`);
		if (sg['yaml']) out.push(disclosure('Generated Semgrep rules', pre(sg['yaml'])));
	}
	return out.join('');
};

const renderArchitecture = (vm: ViewModel): string => {
	const arch = vm.details?.architecture;
	if (!arch) return '';
	const dl = [
		['Gate command', arch.command ? mono(arch.command) : `not bound (${escapeHtml(arch.binding ?? 'Gate command')})`],
		...(arch.exit_code !== undefined ? [['Exit code', mono(arch.exit_code)]] : []),
		...(arch.message ? [['Message', escapeHtml(arch.message)]] : []),
	]
		.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
		.join('');
	const sources = arch.sources.length
		? table(
				['Source', 'Path', 'State', ''],
				arch.sources.map((s) => [
					mono(s.id),
					mono(s.path),
					s.filled ? 'filled' : '<span class="subtle">unfilled stub (not product truth)</span>',
					s.filled ? (s.text ? disclosure('text', pre(s.text)) : textBlock(s.id, 'text')) : '',
				]),
			)
		: '';
	const semgrep =
		vm.semgrep && vm.semgrep['source'] !== 'none' && !vm.semgrep['yaml']
			? `<div>${textBlock('semgrep', 'Semgrep rules')}</div>`
			: '';
	// No rules: the agent can write them from the codebase, in the host, at the user's request (the server writes nothing).
	const offer = arch.generate_prompt
		? `<div class="callout stack">
			<p class="callout-title">No Semgrep rules — this is not a pass</p>
			<p>The agent can write architecture rules from this codebase into <code>.semgrep/architecture/</code>; review them before you commit them.</p>
			<div class="toolbar">
				<button type="button" class="btn btn-primary" data-action="ask-rules">Ask the agent to write rules</button>
				<button type="button" class="btn" data-action="copy" data-text="${escapeHtml(arch.generate_prompt)}">Copy prompt</button>
			</div>
			${disclosure('Prompt', pre(arch.generate_prompt))}
		</div>`
		: '';
	return `<section class="card stack" aria-labelledby="arch-title">
		<div class="card-header"><h2 id="arch-title">Architecture rules</h2>${badge(arch.status, statusTone(arch.status))}</div>
		${offer}
		<dl class="dl">${dl}</dl>
		${arch.output ? disclosure(`Gate output${arch.output_truncated ? ' (last 1,500 characters)' : ''}`, pre(arch.output)) : ''}
		${sources}
		${semgrep}
	</section>`;
};

const renderAuditDetails = (details: Details | undefined): string => {
	if (!details) return '';
	const { commands, notes, reports, recurring, suppressed } = details;
	if (!commands.length && !notes.length && !reports.length && !recurring && !suppressed.length) return '';
	const parts = [
		commands.length
			? table(
					['Command', 'Run', 'Status', 'Exit'],
					commands.map((c) => [
						mono(c.name),
						c.command ? mono(c.command) : '',
						badge(c.status, statusTone(c.status)),
						c.exit_code !== undefined ? mono(c.exit_code) : '',
					]),
				)
			: '',
		...commands.filter((c) => c.output).map((c) => disclosure(`${c.name} output`, pre(c.output ?? ''))),
		recurring ? `<p class="notice">${plural(recurring, 'recurring finding')} (QG-DEB-06), tagged below.</p>` : '',
		notes.length ? `<ul class="notice">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '',
		suppressed.length
			? disclosure(
					`Dismissed by triage (${suppressed.length})`,
					`<ul>${suppressed.map((f) => `<li>${mono(`${f.id} ${f.check}`)}</li>`).join('')}</ul>`,
				)
			: '',
		reports.length
			? disclosure(`Reports (${reports.length})`, `<ul>${reports.map((r) => `<li>${mono(r)}</li>`).join('')}</ul>`)
			: '',
	];
	return `<section class="card stack">${parts.filter(Boolean).join('')}</section>`;
};

const renderHotspots = (vm: ViewModel): string =>
	vm.hotspots?.length
		? disclosure(
				`Hotspots (${vm.hotspots.length})`,
				table(
					['File', 'Score', 'Churn', 'REQ links', 'Findings'],
					vm.hotspots.map((h) => [
						mono(h.path),
						String(h.score),
						String(h.churn),
						String(h.req_links),
						String(h.findings),
					]),
				),
			)
		: '';

const renderTrace = (trace: TraceState): string => {
	if ('loading' in trace) return '<div class="trace subtle">Tracing…</div>';
	if ('error' in trace) return `<div class="trace subtle">${escapeHtml(trace.error)}</div>`;
	const allPaths =
		trace.paths.length > MAX_PATHS
			? disclosure(
					`All files (${trace.paths.length})`,
					`<ul>${trace.paths.map((p) => `<li>${mono(p)}</li>`).join('')}</ul>`,
				)
			: '';
	if (!trace.nodes.length)
		return `<div class="trace">${allPaths}<p class="subtle">${escapeHtml(traceSummary(trace))}</p></div>`;
	const edges = trace.edges.length
		? disclosure(
				`Edges (${trace.edges.length})`,
				`<ul>${trace.edges.map((e) => `<li>${mono(`${e.from} —${e.rel}→ ${e.to}`)}</li>`).join('')}</ul>`,
			)
		: '';
	return `<div class="trace">${allPaths}<ul>${trace.nodes
		.map((n) => `<li>${mono(`${n.id}${n.title ? ` — ${n.title}` : ''}`)}</li>`)
		.join('')}</ul>${edges}</div>`;
};

const renderActions = (finding: AuditFinding, index: number): string => {
	const trace = `<button type="button" class="btn btn-sm" data-action="trace">${traces.has(finding.id) ? 'Hide trace' : 'Trace'}</button>`;
	const done = sent.get(finding.id);
	if (done) return `${trace}<span class="subtle">Sent: ${escapeHtml(done)}</span>`;
	const command = commands.get(finding.id);
	if (command) {
		return `${trace}<div class="stack"><span class="subtle">Run in a terminal (the view records nothing):</span>${commandBlock(command)}</div>`;
	}
	const mode = resolveMode(toolName, args, payload);
	return (
		trace +
		actionsFor(mode)
			.map((a) => {
				if (a.needsReason && reasons.has(finding.id)) {
					const reason = reasons.get(finding.id) ?? '';
					// No <form>: host sandboxes usually omit allow-forms, which blocks submission.
					return `<div class="reason">
						<label class="sr-only" for="reason-${index}">Dismissal reason</label>
						<input id="reason-${index}" class="input" data-role="reason" value="${escapeHtml(reason)}" placeholder="Reason (cite an ADR if there is one)" />
						<button type="button" class="btn btn-sm btn-primary" data-action="send" data-id="${a.id}" ${reason.trim() ? '' : 'disabled'}>${a.command ? 'Show command' : 'Send'}</button>
					</div>`;
				}
				return `<button type="button" class="btn btn-sm${a.id === 'task' ? ' btn-primary' : ''}" data-action="${a.needsReason ? 'ask' : 'send'}" data-id="${a.id}">${escapeHtml(a.label)}</button>`;
			})
			.join('')
	);
};

const renderFinding = (f: AuditFinding, index: number): string => {
	const tags = [
		badge(
			f.severity,
			severityClass(f.severity) === 'sev-error'
				? 'tone-danger'
				: severityClass(f.severity) === 'sev-warning'
					? 'tone-warning'
					: 'tone-info',
		),
		`<code class="item-title">${escapeHtml(f.check)}</code>`,
		f.verdict ? badge(f.verdict) : '',
		f.source === 'inferential' ? badge('inferential') : '',
		f.recurring ? badge(`recurring${f.occurrences ? ` ×${f.occurrences}` : ''}`) : '',
		f.slice_id ? badge(f.slice_id) : '',
		f.rule ? mono(f.rule) : '',
		f.adapter ? `<span class="subtle">${escapeHtml(f.adapter)}</span>` : '',
		f.id ? `<span class="subtle">${mono(f.id)}</span>` : '',
	];
	const paths = f.paths ?? [];
	const total = f.paths_total ?? paths.length;
	const pathLine = paths.length
		? `<div class="item-path" title="${escapeHtml(paths.join('\n'))}">${paths
				.slice(0, MAX_PATHS)
				.map((p, i) => escapeHtml(`${p}${i === 0 && f.line ? `:${f.line}` : ''}`))
				.join(
					', ',
				)}${total > MAX_PATHS ? ` +${total - Math.min(MAX_PATHS, paths.length)} more (Trace lists them)` : ''}</div>`
		: '';
	const seen =
		f.first_seen || f.node
			? `<div class="subtle">${f.node ? `${mono(f.node)} ` : ''}${f.first_seen ? `first seen ${escapeHtml(f.first_seen.slice(0, 10))}, last ${escapeHtml(String(f.last_seen ?? '').slice(0, 10))}` : ''}</div>`
			: '';
	const trace = traces.get(f.id);
	return `<li class="item ${severityClass(f.severity)}" data-index="${index}">
		<div class="item-head">${tags.filter(Boolean).join('')}</div>
		<p class="item-body">${escapeHtml(f.message)}</p>
		${pathLine}${seen}
		${f.code ? pre(f.code) : ''}
		${f.fix ? `<div><span class="subtle">Fix</span>${pre(f.fix)}</div>` : ''}
		${f.remediation ? `<p class="notice">${escapeHtml(f.remediation)}</p>` : ''}
		${trace ? renderTrace(trace) : ''}
		<div class="item-actions">${renderActions(f, index)}</div>
	</li>`;
};

const segmented = (name: string, current: string, options: Array<[string, number | undefined]>): string =>
	`<div class="segmented" role="group" aria-label="${escapeHtml(name)}" data-filter="${escapeHtml(name)}">${options
		.map(
			([value, n]) =>
				`<button type="button" data-value="${escapeHtml(value)}" aria-pressed="${value === current}">${escapeHtml(value)} <span class="count">${n ?? 0}</span></button>`,
		)
		.join('')}</div>`;

const renderFindings = (vm: ViewModel): string => {
	const visible = vm.findings.filter(
		(f) =>
			(severityFilter === 'all' || f.severity === severityFilter) &&
			(sourceFilter === 'all' || (f.source === 'inferential') === (sourceFilter === 'inferential')),
	);
	rendered = visible;
	const filters = [
		vm.sources
			? segmented('Source', sourceFilter, [
					['all', vm.total],
					['computational', vm.sources.computational],
					['inferential', vm.sources.inferential],
				])
			: '',
		segmented('Severity', severityFilter, [
			['all', vm.total],
			...SEVERITIES.map((s): [string, number | undefined] => [s, vm.counts?.[s]]),
		]),
	];
	const partial =
		(vm.loaded ?? 0) < (vm.total ?? 0)
			? `<p class="notice" aria-live="polite">Showing ${vm.loaded} of ${vm.total} findings. ${
					paging && 'error' in paging
						? `Loading the rest failed (${escapeHtml(paging.error)}). <button type="button" class="btn btn-sm" data-action="retry-paging">Retry</button>`
						: 'Loading the rest…'
				}</p>`
			: '';
	const list = visible.length
		? `<ul class="list">${visible.map(renderFinding).join('')}</ul>`
		: emptyState(
				'No findings',
				vm.findings.length ? 'Nothing matches the filters.' : 'Nothing to report.',
				vm.findings.length ? 'neutral' : 'success',
			);
	return `<section class="stack" aria-label="Findings"><div class="toolbar">${filters.join('')}</div>${partial}${list}</section>`;
};

// ── Page ─────────────────────────────────────────────────────────────────────

const setHeader = (vm: ViewModel | null): void => {
	const mode = resolveMode(toolName, args, payload);
	titleEl.textContent = vm ? TITLES[vm.kind] : 'Spec drift';
	modeLabel.textContent =
		vm?.kind === 'ci'
			? `CI gate · ${vm.ci?.provider ?? ''}`
			: vm?.kind === 'learning' || vm?.kind === 'traceability'
				? 'Read-only'
				: mode === 'review'
					? 'Tech Lead review'
					: 'Author';
	const meta = vm?.details?.meta ?? [];
	metaEl.innerHTML = meta.length
		? meta.map(([k, v]) => `<span>${escapeHtml(k)}: ${mono(v)}</span>`).join(' · ')
		: escapeHtml(vm ? 'Harness audit' : 'Waiting for the tool result…');
	refreshBtn.hidden = !toolName || !vm || vm.kind === 'finding';
};

const render = (): void => {
	const vm = viewModel(payload);
	setHeader(vm);
	loading.hidden = Boolean(vm);
	appRoot.setAttribute('aria-busy', String(!vm));
	if (!vm) {
		content.innerHTML = '';
		return;
	}
	if (vm.error) {
		content.innerHTML = `<div class="callout tone-danger" role="alert">${escapeHtml(vm.error)}</div>`;
		return;
	}
	if (vm.noData) {
		content.innerHTML = `${emptyState('No data', vm.noData.reason)}${vm.noData.next ? `<p class="subtle">${escapeHtml(vm.noData.next)}</p>` : ''}`;
		return;
	}
	if (vm.kind === 'ci' && vm.ci) {
		content.innerHTML = `<p>Suggested path: ${mono(vm.ci.path)}</p>${vm.ci.note ? `<div class="callout">${escapeHtml(vm.ci.note)}</div>` : ''}${pre(vm.ci.content)}`;
		return;
	}
	if (vm.kind === 'learning') {
		content.innerHTML = renderLearning(vm);
		return;
	}
	if (vm.kind === 'traceability') {
		content.innerHTML = renderTraceability(vm);
		return;
	}
	if (vm.kind === 'finding') {
		const [f] = vm.findings;
		if (!f) return;
		rendered = [f];
		const trace = vm.trace
			? renderTrace({ ...vm.trace, indexed: true, paths: f.paths ?? [] })
			: `<p class="subtle">${escapeHtml(traceSummary({ indexed: false }))}</p>`;
		content.innerHTML = `<ul class="list">${renderFinding(f, 0)}</ul>${trace}`;
		return;
	}
	content.innerHTML = [
		renderSummary(vm),
		renderChecks(vm),
		renderArchitecture(vm),
		renderAuditDetails(vm.details),
		renderHotspots(vm),
		renderFindings(vm),
	].join('');
};

/** The server cuts large results to fit the host's inline size; page in the rest through the same tool. */
const pageIn = async (): Promise<void> => {
	const offset = nextOffset(payload);
	const token = payload?.['page']?.token as string | undefined;
	const tool = (payload?.['page']?.tool as string | undefined) ?? toolName;
	if (offset === null || !token || !tool || paging) return;
	paging = { loading: true };
	const target = payload;
	try {
		const page = await callTool(tool, { page_token: token, offset });
		if (payload !== target) return;
		if (page?.['error'] || !page?.['findings']?.length) {
			paging = { error: String(page?.['error'] ?? 'no findings returned') };
		} else {
			paging = null;
			payload = mergePage(payload, page);
		}
	} catch (error) {
		paging = { error: errorMessage(error) };
	}
	render();
	if (!paging) void pageIn();
};

const show = (next: Payload | null): void => {
	payload = next;
	paging = null;
	sent.clear();
	traces.clear();
	reasons.clear();
	texts.clear();
	render();
	void pageIn();
};

// ── Events ───────────────────────────────────────────────────────────────────

const findingOf = (el: HTMLElement): AuditFinding | undefined =>
	rendered[Number(el.closest<HTMLElement>('[data-index]')?.dataset['index'])];

const sendAction = async (action: Action, finding: AuditFinding): Promise<void> => {
	try {
		const result = await app.sendMessage({
			role: 'user',
			content: [{ type: 'text', text: messageFor(action.id, finding) }],
		});
		sent.set(
			finding.id,
			result.isError ? 'failed (the host did not accept the message)' : action.label.replace('…', ''),
		);
	} catch (error) {
		sent.set(finding.id, `failed (${errorMessage(error)})`);
	}
	reasons.delete(finding.id);
	render();
};

const toggleTrace = async (finding: AuditFinding): Promise<void> => {
	if (traces.has(finding.id)) {
		traces.delete(finding.id);
		render();
		return;
	}
	traces.set(finding.id, { loading: true });
	render();
	try {
		const res = await callTool('audit_finding', { id: finding.id });
		traces.set(
			finding.id,
			res?.['error']
				? { error: String(res['error']) }
				: {
						nodes: res?.['trace']?.nodes ?? [],
						edges: res?.['trace']?.edges ?? [],
						indexed: Boolean(res?.['trace']),
						paths: res?.['finding']?.paths ?? [],
					},
		);
	} catch (error) {
		traces.set(finding.id, { error: errorMessage(error) });
	}
	render();
};

const toggleText = async (key: string): Promise<void> => {
	if (texts.has(key)) {
		texts.delete(key);
		render();
		return;
	}
	texts.set(key, { loading: true });
	render();
	try {
		const res = await callTool('verify_architecture_rules', { source: key });
		texts.set(
			key,
			res?.['error']
				? { error: String(res['error']) }
				: { text: (res?.['text'] as string | null) ?? '(empty)', note: res?.['message'] as string | undefined },
		);
	} catch (error) {
		texts.set(key, { error: errorMessage(error) });
	}
	render();
};

/** Sends the rules-generation prompt to the host agent, which writes the files at the user's request. */
const askForRules = (button: HTMLButtonElement): Promise<void> =>
	withBusyButton(button, 'Sending…', async () => {
		const prompt = viewModel(payload)?.details?.architecture?.generate_prompt;
		if (!prompt) return;
		try {
			const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] });
			if (result.isError) setStatus('The host did not accept the message. Copy the prompt instead.', 'danger');
			else setStatus('Asked the agent to write rules. Refresh when they exist.', 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});

content.addEventListener('click', (event) => {
	const target = event.target as HTMLElement;
	const filterButton = target.closest<HTMLButtonElement>('[data-filter] button[data-value]');
	if (filterButton) {
		const value = filterButton.dataset['value'] ?? 'all';
		if (filterButton.closest<HTMLElement>('[data-filter]')?.dataset['filter'] === 'Source') sourceFilter = value;
		else severityFilter = value;
		render();
		return;
	}
	const button = target.closest<HTMLButtonElement>('button[data-action]');
	if (!button) return;
	const finding = findingOf(button);
	const mode = resolveMode(toolName, args, payload);
	const action = actionsFor(mode).find((a) => a.id === button.dataset['id']);
	switch (button.dataset['action']) {
		case 'trace':
			if (finding) void toggleTrace(finding);
			break;
		case 'ask':
			if (finding) {
				reasons.set(finding.id, '');
				render();
				content
					.querySelector<HTMLInputElement>(`[data-index="${rendered.indexOf(finding)}"] [data-role="reason"]`)
					?.focus();
			}
			break;
		case 'send':
			if (!finding || !action || (action.needsReason && !reasons.get(finding.id)?.trim())) break;
			if (action.command && (action.id === 'dismiss' || action.id === 'confirm')) {
				commands.set(finding.id, triageCommand(action.id, finding, { reason: reasons.get(finding.id) }));
				reasons.delete(finding.id);
				render();
			} else {
				void sendAction(action, finding);
			}
			break;
		case 'copy': {
			const text = button.dataset['text'] ?? '';
			void navigator.clipboard
				.writeText(text)
				.then(() => setStatus('Copied. Run it in a terminal.', 'success'))
				.catch(() => setStatus('The host blocked the clipboard: select the command and copy it.', 'danger'));
			break;
		}
		case 'ask-rules':
			void askForRules(button);
			break;
		case 'load-text':
			void toggleText(button.dataset['key'] ?? '');
			break;
		case 'retry-paging':
			paging = null;
			void pageIn();
			break;
	}
});

content.addEventListener('input', (event) => {
	const input = event.target as HTMLInputElement;
	if (input.dataset['role'] !== 'reason') return;
	const finding = findingOf(input);
	if (!finding) return;
	reasons.set(finding.id, input.value);
	const send = input.parentElement?.querySelector<HTMLButtonElement>('button[data-action="send"]');
	if (send) send.disabled = !input.value.trim();
});

content.addEventListener('keydown', (event) => {
	const input = event.target as HTMLInputElement;
	if (event.key !== 'Enter' || input.dataset['role'] !== 'reason') return;
	input.parentElement?.querySelector<HTMLButtonElement>('button[data-action="send"]:not(:disabled)')?.click();
});

refreshBtn.addEventListener('click', () => {
	const name = toolName;
	if (!name) return;
	void withBusyButton(refreshBtn, 'Refreshing…', async () => {
		try {
			const { page_token: _token, offset: _offset, ...fresh } = args;
			show(await callTool(name, fresh));
			setStatus('Refreshed.', 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});
});

app.ontoolinput = (params) => {
	args = (params.arguments as Payload | undefined) ?? {};
	setStatus('Running…', 'busy');
};

app.ontoolresult = (result) => {
	setStatus('');
	toolName ??= app.getHostContext()?.toolInfo?.tool.name ?? null;
	const data = payloadOf(result);
	show(result.isError && !data?.['error'] ? { error: toolErrorText(result) || 'The tool failed.' } : data);
};

app.ontoolcancelled = (params) => {
	loading.hidden = true;
	setStatus(`Cancelled${params.reason ? `: ${params.reason}` : '.'}`);
};

void connectApp(app).then(() => {
	toolName = app.getHostContext()?.toolInfo?.tool.name ?? toolName;
	render();
});
