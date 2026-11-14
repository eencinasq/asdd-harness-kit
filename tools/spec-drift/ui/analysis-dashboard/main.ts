import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import './trend.css';
import type { Finding, PackSummary, ScanSummary, SpecDriftItem } from '../../src/analysis/analysis.types.ts';
import { buildFixPrompt } from '../../src/analysis/domain/fix-prompt.ts';
import {
	$,
	baseName,
	connectApp,
	createSegmented,
	createStatus,
	createTabs,
	emptyState,
	errorMessage,
	escapeHtml,
	formatWhen,
	plural,
	severityClass,
	severityLabel,
	toolErrorText,
	withBusyButton,
} from '../shared/ui.ts';
import { type BaselineFilter, baselineHint, defaultBaselineFilter, matchesBaseline } from './baseline-view.ts';
import { noRulesView } from './no-rules.ts';
import { formatAgentPrompt, remediationFor } from './remediations.ts';
import { adrCoverageView, testBadge } from './rule-coverage.ts';
import { CHART, nearestIndex, trendModel } from './trend-chart.ts';

type Tab = 'findings' | 'drift' | 'adrs' | 'trend';
type Domain = 'ALL' | 'architecture' | 'standards';

const PAGE_SIZE = 50;
const SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;

const appRoot = $('app');
const engineLabel = $('engine-label');
const scanMeta = $('scan-meta');
const loading = $('loading');
const failure = $('failure');
const noRules = $('no-rules');
const askRulesBtn = $<HTMLButtonElement>('ask-rules');
const copyRulesBtn = $<HTMLButtonElement>('copy-rules-prompt');
const summarySection = $('summary');
const packOverview = $('pack-overview');
const packOverviewBody = $('pack-overview-body');
const packOverviewMeta = $('pack-overview-meta');
const tabsEl = $('tabs');
const findingsList = $('findings-list');
const findingsCount = $('findings-count');
const severityFilterEl = $('severity-filter');
const domainFilterEl = $('domain-filter');
const baselineFilterEl = $('baseline-filter');
const searchInput = $<HTMLInputElement>('search');
const showMoreBtn = $<HTMLButtonElement>('show-more');
const panelDrift = $('panel-drift');
const panelAdrs = $('panel-adrs');
const panelTrend = $('panel-trend');
const modeSelect = $<HTMLSelectElement>('mode');
const rescanBtn = $<HTMLButtonElement>('rescan');
const setStatus = createStatus($('status'));

let current: ScanSummary | null = null;
let severityFilter = 'ALL';
let baselineFilter: BaselineFilter = 'all';
let domainFilter: Domain = 'ALL';
let query = '';
let visibleLimit = PAGE_SIZE;
let activeTab: Tab | null = null;
/** Findings currently rendered, by list index (for the per-finding actions). */
let rendered: Finding[] = [];

const selectTab = createTabs<Tab>(tabsEl, (tab) => {
	activeTab = tab;
});

/** Rule ids can be long (`mmlc.arch.boundary.no-infra-in-domain`); keep the meaningful tail. */
const shortRuleId = (checkId: string): string => {
	const parts = checkId.split('.');
	return parts.length > 3 ? parts.slice(-3).join('.') : checkId;
};

const domainOf = (finding: Finding): Exclude<Domain, 'ALL'> =>
	finding.pack.includes('standard') || finding.category.includes('standard') ? 'standards' : 'architecture';

// ── Summary ──────────────────────────────────────────────────────────────────

const setKpiTone = (card: HTMLElement, tone: 'danger' | 'warning' | 'success' | null): void => {
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');
	if (tone) card.classList.add(`tone-${tone}`);
};

const renderSummary = (s: ScanSummary): void => {
	const errors = s.bySeverity['ERROR'] ?? 0;
	const warnings = s.bySeverity['WARNING'] ?? 0;
	$('kpi-findings').textContent = String(s.findingCount);
	$('kpi-findings-hint').textContent =
		s.findingCount === 0
			? 'No violations'
			: (baselineHint(s) ??
				([errors && `${errors} error`, warnings && `${warnings} warning`].filter(Boolean).join(' · ') || 'Info only'));
	setKpiTone($('kpi-findings-card'), errors > 0 ? 'danger' : warnings > 0 ? 'warning' : 'success');

	const { driftingRules, cleanRules, totalRules } = s.drift;
	$('kpi-drift').textContent = String(driftingRules);
	$('kpi-drift-hint').textContent = `of ${plural(totalRules, 'rule')}`;
	setKpiTone($('kpi-drift-card'), driftingRules > 0 ? 'warning' : 'success');

	$('kpi-clean').textContent = String(cleanRules);
	const meter = $('health-meter');
	const pct = totalRules === 0 ? 100 : Math.round((100 * cleanRules) / totalRules);
	meter.setAttribute('aria-valuemax', String(totalRules));
	meter.setAttribute('aria-valuenow', String(cleanRules));
	meter.setAttribute('aria-valuetext', `${cleanRules} of ${totalRules} rules clean`);
	meter.className = `meter${pct < 50 ? ' tone-danger' : pct < 100 ? ' tone-warning' : ''}`;
	$('health-bar').style.width = `${pct}%`;
};

const packTone = (row: PackSummary): string =>
	row.status === 'clean' ? 'tone-success' : (row.bySeverity['ERROR'] ?? 0) > 0 ? 'tone-danger' : 'tone-warning';

const renderPacks = (rows: readonly PackSummary[]): void => {
	packOverview.hidden = rows.length === 0;
	const max = Math.max(1, ...rows.map((r) => r.findingCount));
	packOverviewMeta.textContent = `${rows.filter((r) => r.status === 'clean').length} of ${rows.length} clean`;
	packOverviewBody.innerHTML = rows
		.map(
			(row) => `
		<tr data-pack="${escapeHtml(row.id)}">
			<td>
				<strong>${escapeHtml(row.title)}</strong>
				<div class="subtle">${escapeHtml(row.description)}</div>
			</td>
			<td><span class="badge ${packTone(row)}">${escapeHtml(row.status === 'clean' ? 'Clean' : row.resultLabel.replace(/^\d+ findings?: /, ''))}</span></td>
			<td class="num">
				${row.findingCount}
				<div class="meter pack-bar tone-${row.status === 'clean' ? 'success' : 'warning'}" aria-hidden="true">
					<span style="width:${(100 * row.findingCount) / max}%"></span>
				</div>
			</td>
		</tr>`,
		)
		.join('');
};

// ── Findings ─────────────────────────────────────────────────────────────────

const matches = (finding: Finding): boolean => {
	if (!matchesBaseline(finding, baselineFilter)) return false;
	if (severityFilter !== 'ALL' && finding.severity !== severityFilter) return false;
	if (domainFilter !== 'ALL' && domainOf(finding) !== domainFilter) return false;
	if (!query) return true;
	return [finding.path, finding.checkId, finding.message, finding.adr ?? ''].some((v) =>
		v.toLowerCase().includes(query),
	);
};

const renderFinding = (finding: Finding, index: number): string => {
	const fix = remediationFor(finding);
	return `
	<li class="item ${severityClass(finding.severity)}" data-index="${index}">
		<div class="item-head">
			<span class="badge ${severityClass(finding.severity)}">${severityLabel(finding.severity)}</span>
			<code class="item-title" title="${escapeHtml(finding.checkId)}">${escapeHtml(shortRuleId(finding.checkId))}</code>
			<span class="badge">${escapeHtml(finding.pack)}</span>
			${finding.adr ? `<span class="badge tone-info">${escapeHtml(finding.adr)}</span>` : ''}
			${finding.baseline === 'new' ? '<span class="badge tone-warning">new</span>' : ''}
		</div>
		<div class="item-path">${escapeHtml(finding.path)}:${finding.startLine}</div>
		<p class="item-body">${escapeHtml(finding.message)}</p>
		<details class="disclosure">
			<summary>How to fix</summary>
			<div class="disclosure-body">
				<div class="stack">
					<h3>${escapeHtml(fix.title)}</h3>
					<ol>${fix.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
					${fix.references?.length ? `<p class="subtle">References: ${fix.references.map((r) => `<code>${escapeHtml(r)}</code>`).join(', ')}</p>` : ''}
				</div>
				<dl class="dl">
					<dt>Rule</dt><dd><code>${escapeHtml(finding.checkId)}</code></dd>
					<dt>Location</dt><dd><code>${escapeHtml(finding.path)}:${finding.startLine}${finding.endLine > finding.startLine ? `-${finding.endLine}` : ''}</code></dd>
					<dt>Category</dt><dd>${escapeHtml(finding.category)}</dd>
				</dl>
			</div>
		</details>
		<div class="item-actions">
			<button type="button" class="btn btn-sm" data-action="send-agent">Ask the agent to fix</button>
		</div>
	</li>`;
};

const renderSeverityFilter = (s: ScanSummary): void => {
	const options = [
		['ALL', 'All', s.findingCount],
		...SEVERITIES.map((sev) => [sev, severityLabel(sev), s.bySeverity[sev] ?? 0]),
	] as const;
	severityFilterEl.innerHTML = options
		.map(
			([value, label, count]) =>
				`<button type="button" data-value="${value}" aria-pressed="${value === severityFilter}">${label} <span class="count">${count}</span></button>`,
		)
		.join('');
};

const renderFindings = (): void => {
	if (!current) return;
	const all = current.findings;
	if (all.length === 0) {
		findingsCount.textContent = '';
		findingsList.innerHTML =
			current.status === 'failed'
				? ''
				: `<li>${emptyState('No violations', 'The code matches every rule in the selected packs.', 'success')}</li>`;
		showMoreBtn.hidden = true;
		return;
	}
	const filtered = all.filter(matches);
	rendered = filtered.slice(0, visibleLimit);
	const truncated =
		current.findingCount > all.length ? ` (first ${all.length} of ${current.findingCount} returned)` : '';
	findingsCount.textContent =
		filtered.length === all.length
			? `${plural(all.length, 'finding')}${truncated}`
			: `${filtered.length} of ${plural(all.length, 'finding')} match${truncated}`;
	findingsList.innerHTML =
		rendered.length === 0
			? `<li>${emptyState('No findings match', 'Clear the filters to see every finding.')}</li>`
			: rendered.map(renderFinding).join('');
	showMoreBtn.hidden = filtered.length <= rendered.length;
	showMoreBtn.textContent = `Show ${Math.min(PAGE_SIZE, filtered.length - rendered.length)} more`;
};

// ── Spec drift ───────────────────────────────────────────────────────────────

/** The rule's test result as a badge (rule-coverage REQ-005). */
const testBadgeHtml = (ruleId: string): string => {
	const badge = testBadge(current?.ruleTests, ruleId);
	return badge ? `<span class="badge ${badge.tone}">${escapeHtml(badge.label)}</span>` : '';
};

const renderDriftRow = (item: SpecDriftItem): string => `
	<tr>
		<td><span class="badge ${severityClass(item.severity)}">${severityLabel(item.severity)}</span></td>
		<td>
			<code title="${escapeHtml(item.ruleId)}">${escapeHtml(shortRuleId(item.ruleId))}</code>
			${item.adr ? `<span class="badge tone-info">${escapeHtml(item.adr)}</span>` : ''}
			${testBadgeHtml(item.ruleId)}
			<div class="subtle">${escapeHtml(item.message)}</div>
		</td>
		<td class="num">${item.violationCount}</td>
		<td>${item.samplePaths.map((p) => `<div class="item-path">${escapeHtml(p)}</div>`).join('')}</td>
		<td><button type="button" class="btn btn-sm" data-action="fix-rule" data-rule="${escapeHtml(item.ruleId)}">Ask the agent to fix</button></td>
	</tr>`;

const renderDrift = (s: ScanSummary): void => {
	const drifting = s.drift.items
		.filter((i) => i.status === 'drifting')
		.toSorted(
			(a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.violationCount - a.violationCount,
		);
	const clean = s.drift.items.filter((i) => i.status === 'clean');
	const driftTable = drifting.length
		? `<div class="table-wrap"><table>
				<thead><tr><th scope="col">Severity</th><th scope="col">Rule</th><th scope="col" class="num">Violations</th><th scope="col">Examples</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
				<tbody>${drifting.map(renderDriftRow).join('')}</tbody>
			</table></div>`
		: emptyState('No spec drift', 'Every declared rule is clean.', 'success');
	const cleanList = clean.length
		? `<details class="disclosure">
				<summary>${plural(clean.length, 'clean rule')}</summary>
				<div class="disclosure-body"><ul class="list">${clean
					.map(
						(r) =>
							`<li><code>${escapeHtml(r.ruleId)}</code> ${testBadgeHtml(r.ruleId)} <span class="subtle">${escapeHtml(r.message)}</span></li>`,
					)
					.join('')}</ul></div>
			</details>`
		: '';
	panelDrift.innerHTML = `${driftTable}${cleanList}`;
};

// ── Trend (spec-drift-adoption REQ-002) ──────────────────────────────────────

const shortDate = (iso: string): string => iso.slice(0, 10);

const renderTrend = (s: ScanSummary): void => {
	const model = trendModel(s.trend);
	if (!model) {
		panelTrend.innerHTML = emptyState(
			'No history yet',
			'Record a snapshot with `spec-drift record` (at the end of a sprint, or from a scheduled CI job) and commit it; each one adds a point here.',
		);
		return;
	}
	const last = model.points.at(-1);
	const grid = model.ticks
		.map(
			(t) =>
				`<line class="trend-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${t.y}" y2="${t.y}"></line><text class="trend-axis-label" x="${CHART.left - 6}" y="${t.y + 4}" text-anchor="end">${Number.isInteger(t.value) ? t.value : t.value.toFixed(1)}</text>`,
		)
		.join('');
	const dots = model.points.map((p) => `<circle class="trend-dot" cx="${p.x}" cy="${p.y}" r="4"></circle>`).join('');
	const first = model.points[0];
	const xLabels = [first, ...(model.points.length > 1 ? [last] : [])]
		.map((p, i) =>
			p
				? `<text class="trend-axis-label" x="${p.x}" y="${CHART.height - 6}" text-anchor="${i === 0 && model.points.length > 1 ? 'start' : 'end'}">${escapeHtml(shortDate(p.at))}</text>`
				: '',
		)
		.join('');
	const endLabel = last ? `<text class="trend-end-label" x="${last.x + 8}" y="${last.y + 4}">${last.value}</text>` : '';
	const rows = model.points
		.map(
			(p) =>
				`<tr><td>${escapeHtml(shortDate(p.at))}</td><td class="num">${p.value}</td><td class="subtle">${escapeHtml(p.label)}</td></tr>`,
		)
		.join('');
	panelTrend.innerHTML = `
		<p><span class="badge ${model.verdict.tone}"><span aria-hidden="true">${model.verdict.icon}</span> ${escapeHtml(model.verdict.text)}</span></p>
		<h3>${escapeHtml(model.title)}</h3>
		<div class="trend-chart">
			<svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" tabindex="0" aria-label="${escapeHtml(`${model.title}: ${model.verdict.text}. Use the arrow keys to read each point.`)}">
				${grid}
				<path class="trend-line" d="${model.path}"></path>
				${dots}
				${endLabel}
				${xLabels}
				<line class="trend-crosshair" y1="${CHART.top}" y2="${CHART.height - CHART.bottom}" visibility="hidden"></line>
				<rect class="trend-hit" x="${CHART.left - 12}" y="0" width="${CHART.width - CHART.left - CHART.right + 24}" height="${CHART.height}" fill="transparent"></rect>
			</svg>
			<div class="trend-tooltip" hidden><strong></strong><span></span></div>
		</div>
		<details class="disclosure"><summary>Table</summary><div class="disclosure-body table-wrap"><table>
			<thead><tr><th scope="col">Date</th><th scope="col" class="num">Value</th><th scope="col">Snapshot</th></tr></thead>
			<tbody>${rows}</tbody>
		</table></div></details>`;
	wireTrend(model);
};

/** Crosshair + one tooltip, on pointer and keyboard; values stay reachable in the table view. */
const wireTrend = (model: NonNullable<ReturnType<typeof trendModel>>): void => {
	const svg = panelTrend.querySelector<SVGSVGElement>('svg');
	const crosshair = panelTrend.querySelector<SVGLineElement>('.trend-crosshair');
	const tip = panelTrend.querySelector<HTMLElement>('.trend-tooltip');
	if (!svg || !crosshair || !tip) return;
	const xs = model.points.map((p) => p.x);
	let index = model.points.length - 1;
	const show = (i: number) => {
		const p = model.points[i];
		if (!p) return;
		index = i;
		crosshair.setAttribute('x1', String(p.x));
		crosshair.setAttribute('x2', String(p.x));
		crosshair.setAttribute('visibility', 'visible');
		(tip.querySelector('strong') as HTMLElement).textContent = String(p.value);
		(tip.querySelector('span') as HTMLElement).textContent = `${shortDate(p.at)} · ${p.label}`;
		tip.hidden = false;
		const box = svg.getBoundingClientRect();
		const left = (p.x / CHART.width) * box.width;
		tip.style.left = `${Math.min(Math.max(0, left - tip.offsetWidth / 2), box.width - tip.offsetWidth)}px`;
		// Inside the band above the plot (CHART.top), never over the title above the chart.
		tip.style.top = `${Math.max(0, (CHART.top / CHART.height) * box.height - tip.offsetHeight - 4)}px`;
	};
	const hide = () => {
		crosshair.setAttribute('visibility', 'hidden');
		tip.hidden = true;
	};
	svg.addEventListener('pointermove', (event) => {
		const box = svg.getBoundingClientRect();
		show(nearestIndex(xs, ((event.clientX - box.left) / box.width) * CHART.width));
	});
	svg.addEventListener('pointerleave', hide);
	svg.addEventListener('focus', () => show(index));
	svg.addEventListener('blur', hide);
	svg.addEventListener('keydown', (event) => {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		show(Math.min(model.points.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1))));
	});
};

// ── ADR coverage (rule-coverage REQ-002, REQ-005) ───────────────────────────────

/** Uncovered ADRs, by list index (for the per-ADR "Ask the agent" action). */
let uncoveredAdrs: { id: string; prompt: string }[] = [];

const renderAdrs = (s: ScanSummary): number => {
	const view = adrCoverageView(s.adrCoverage);
	uncoveredAdrs = view ? [...view.uncovered] : [];
	if (!view) {
		panelAdrs.innerHTML = emptyState('ADR coverage unavailable', 'The ADR folder could not be read.');
		return 0;
	}
	const uncovered = view.uncovered.length
		? `<h3>No rule enforces</h3><ul class="list">${view.uncovered
				.map(
					(a, i) => `<li data-adr-index="${i}">
						<code>${escapeHtml(a.id)}</code> ${escapeHtml(a.title)} <span class="subtle">${escapeHtml(a.path)}</span>
						<div class="toolbar"><button type="button" class="btn btn-sm" data-action="ask-adr-rule">Ask the agent to write the rule</button></div>
					</li>`,
				)
				.join('')}</ul>`
		: '';
	const covered = view.covered.length
		? `<details class="disclosure"><summary>${plural(view.covered.length, 'covered ADR')}</summary><div class="disclosure-body"><ul class="list">${view.covered
				.map(
					(a) =>
						`<li><code>${escapeHtml(a.id)}</code> ${escapeHtml(a.title)} <span class="subtle">${a.rules.map(escapeHtml).join(', ')}</span></li>`,
				)
				.join('')}</ul></div></details>`
		: '';
	const dangling = view.dangling.length
		? `<h3>Rules citing an ADR that does not stand</h3><ul class="list">${view.dangling
				.map(
					(d) =>
						`<li><code>${escapeHtml(d.ruleId)}</code> → ${escapeHtml(d.adr)} <span class="subtle">${escapeHtml(d.reason)}</span></li>`,
				)
				.join('')}</ul>`
		: '';
	const exempt = view.exempt
		? `<p class="subtle">${plural(view.exempt, 'ADR')} marked Enforcement: manual (not counted).</p>`
		: '';
	panelAdrs.innerHTML = `<p><span class="badge ${view.tone}">${escapeHtml(view.headline)}</span></p>${uncovered}${dangling}${covered}${exempt}`;
	return view.uncovered.length;
};

// ── Whole view ───────────────────────────────────────────────────────────────

const render = (s: ScanSummary): void => {
	current = s;
	visibleLimit = PAGE_SIZE;
	appRoot.setAttribute('aria-busy', 'false');
	loading.hidden = true;

	const engine = s.engine?.name ?? 'Semgrep';
	engineLabel.textContent = `${engine} · ${baseName(s.repoRoot)}`;
	scanMeta.innerHTML = [
		`<span>${escapeHtml(plural(s.packs.length, 'pack'))}</span>`,
		`<span class="dot"></span><time datetime="${escapeHtml(s.scannedAt)}" title="${escapeHtml(new Date(s.scannedAt).toLocaleString())}">Scanned ${escapeHtml(formatWhen(s.scannedAt))}</time>`,
	].join('');
	modeSelect.value = s.mode === 'all' ? 'spec-drift' : s.mode;

	const empty = noRulesView(s);
	noRules.hidden = !empty;
	if (empty) {
		$('no-rules-title').textContent = empty.title;
		$('no-rules-message').textContent = empty.message;
		$('no-rules-prompt').textContent = empty.prompt;
		failure.hidden = true;
		summarySection.hidden = true;
		packOverview.hidden = true;
		tabsEl.hidden = true;
		$('panel-findings').hidden = true;
		panelDrift.hidden = true;
		panelAdrs.hidden = true;
		panelTrend.hidden = true;
		setStatus('');
		return;
	}

	failure.hidden = s.status !== 'failed';
	if (s.status === 'failed') {
		failure.innerHTML = `
			<p class="callout-title">${escapeHtml(engine)} did not finish (exit ${s.exitCode})</p>
			<p>The results below may be incomplete. Check that ${escapeHtml(engine)} is installed and the rules are valid.</p>
			${s.stderrTail ? `<details class="disclosure"><summary>Error output</summary><pre class="block">${escapeHtml(s.stderrTail)}</pre></details>` : ''}`;
	}

	summarySection.hidden = false;
	tabsEl.hidden = false;
	renderSummary(s);
	renderPacks(s.packSummaries ?? []);

	$('count-findings').textContent = String(s.findingCount);
	$('count-drift').textContent = String(s.drift.driftingRules);
	$('count-adrs').textContent = String(renderAdrs(s));
	renderTrend(s);
	renderSeverityFilter(s);
	const domains = new Set(s.findings.map(domainOf));
	baselineFilterEl.hidden = !s.baseline;
	baselineFilter = defaultBaselineFilter(s);
	for (const b of baselineFilterEl.querySelectorAll<HTMLButtonElement>('button[data-value]')) {
		b.setAttribute('aria-pressed', String(b.dataset['value'] === baselineFilter));
	}
	domainFilterEl.hidden = domains.size < 2;
	if (domainFilterEl.hidden) domainFilter = 'ALL';
	renderFindings();
	renderDrift(s);

	selectTab(activeTab ?? (s.findingCount > 0 ? 'findings' : 'drift'));
	setStatus('');
};

const parseSummary = (result: { structuredContent?: unknown }): ScanSummary | null => {
	const content = result.structuredContent;
	return content && typeof content === 'object' && 'drift' in content ? (content as ScanSummary) : null;
};

const runScan = (mode: string): Promise<void> =>
	withBusyButton(rescanBtn, 'Scanning…', async () => {
		modeSelect.disabled = true;
		setStatus(`Scanning ${modeSelect.selectedOptions[0]?.textContent?.toLowerCase() ?? mode}…`, 'busy');
		try {
			const result = await app.callServerTool({ name: 'rescan', arguments: { mode } });
			if (result.isError) {
				setStatus(`Scan failed: ${toolErrorText(result) || 'unknown error'}`, 'danger');
				return;
			}
			const summary = parseSummary(result);
			if (summary) render(summary);
			else setStatus('The scan returned no results to show.', 'danger');
		} catch (error) {
			setStatus(`Scan failed: ${errorMessage(error)}`, 'danger');
		} finally {
			modeSelect.disabled = false;
		}
	});

const sendToAgent = async (finding: Finding, button: HTMLButtonElement): Promise<void> => {
	const fix = remediationFor(finding);
	await withBusyButton(button, 'Sending…', async () => {
		try {
			const result = await app.sendMessage({
				role: 'user',
				content: [
					{
						type: 'text',
						text: formatAgentPrompt(finding, fix, {
							engine: current?.engine?.name ?? 'Semgrep',
							repo: baseName(current?.repoRoot ?? 'the repo'),
						}),
					},
				],
			});
			if (result.isError)
				setStatus('The host did not accept the message. Copy the steps from “How to fix” instead.', 'danger');
			else setStatus(`Asked the agent to fix ${shortRuleId(finding.checkId)} in ${baseName(finding.path)}.`, 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});
};

/** The agent writes the rules in the host, at the user's request; the server writes nothing (spec-drift-empty ADR-002). */
const askForRules = (): Promise<void> =>
	withBusyButton(askRulesBtn, 'Sending…', async () => {
		const prompt = current?.generatePrompt;
		if (!prompt) return;
		try {
			const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] });
			if (result.isError) setStatus('The host did not accept the message. Copy the prompt instead.', 'danger');
			else setStatus('Asked the agent to write rules. Re-scan when they exist.', 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});

/** Every violation of one rule, as one request to the agent (spec-drift-demand REQ-002); the agent edits, not the server. */
const askToFixRule = (button: HTMLButtonElement, ruleId: string): Promise<void> =>
	withBusyButton(button, 'Sending…', async () => {
		const item = current?.drift.items.find((i) => i.ruleId === ruleId);
		if (!current || !item) return;
		const prompt = buildFixPrompt({
			rule: { id: item.ruleId, severity: item.severity, message: item.message, adr: item.adr },
			findings: current.findings,
		});
		try {
			const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: prompt }] });
			if (result.isError) setStatus('The host did not accept the message.', 'danger');
			else setStatus(`Asked the agent to fix ${shortRuleId(ruleId)}. Re-scan when it is done.`, 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});

// ── Events ───────────────────────────────────────────────────────────────────

panelDrift.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="fix-rule"]');
	const rule = button?.dataset['rule'];
	if (button && rule) void askToFixRule(button, rule);
});

askRulesBtn.addEventListener('click', () => void askForRules());
copyRulesBtn.addEventListener('click', () => {
	void navigator.clipboard
		.writeText(current?.generatePrompt ?? '')
		.then(() => setStatus('Prompt copied.', 'success'))
		.catch(() => setStatus('The host blocked the clipboard: open “Prompt” and copy it.', 'danger'));
});

createSegmented(severityFilterEl, (value) => {
	severityFilter = value;
	visibleLimit = PAGE_SIZE;
	renderFindings();
});
createSegmented(baselineFilterEl, (value) => {
	baselineFilter = value as BaselineFilter;
	visibleLimit = PAGE_SIZE;
	renderFindings();
});
createSegmented(domainFilterEl, (value) => {
	domainFilter = value as Domain;
	visibleLimit = PAGE_SIZE;
	renderFindings();
});

let searchTimer: number | undefined;
searchInput.addEventListener('input', () => {
	window.clearTimeout(searchTimer);
	searchTimer = window.setTimeout(() => {
		query = searchInput.value.trim().toLowerCase();
		visibleLimit = PAGE_SIZE;
		renderFindings();
	}, 120);
});

showMoreBtn.addEventListener('click', () => {
	visibleLimit += PAGE_SIZE;
	renderFindings();
});

panelAdrs.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="ask-adr-rule"]');
	const index = Number(button?.closest<HTMLElement>('[data-adr-index]')?.dataset['adrIndex']);
	const adr = uncoveredAdrs[index];
	if (!button || !adr) return;
	// The agent writes the rule and its test in the host, at the user's request; the server writes nothing.
	void withBusyButton(button, 'Sending…', async () => {
		try {
			const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: adr.prompt }] });
			if (result.isError)
				setStatus('The host did not accept the message. Use the MCP prompt write-adr-rule instead.', 'danger');
			else setStatus(`Asked the agent to write the rule for ${adr.id}. Re-scan when it exists.`, 'success');
		} catch (error) {
			setStatus(errorMessage(error), 'danger');
		}
	});
});

findingsList.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="send-agent"]');
	const index = Number(button?.closest<HTMLElement>('[data-index]')?.dataset['index']);
	const finding = rendered[index];
	if (button && finding) void sendToAgent(finding, button);
});

modeSelect.addEventListener('change', () => void runScan(modeSelect.value));
rescanBtn.addEventListener('click', () => void runScan(modeSelect.value));

const app = new App({ name: 'Architecture & standards', version: '1.0.0' });

app.ontoolinput = (params) => {
	const mode = (params.arguments as { mode?: string } | undefined)?.mode;
	if (mode) modeSelect.value = mode === 'all' ? 'spec-drift' : mode;
	setStatus('Scanning…', 'busy');
};

app.ontoolresult = (result) => {
	if (result.isError) {
		loading.hidden = true;
		setStatus(`Scan failed: ${toolErrorText(result) || 'unknown error'}`, 'danger');
		return;
	}
	const summary = parseSummary(result);
	if (summary) render(summary);
	else setStatus('The tool returned no scan results to show.', 'danger');
};

app.ontoolcancelled = () => {
	loading.hidden = true;
	setStatus('Scan cancelled.');
};

void connectApp(app);
