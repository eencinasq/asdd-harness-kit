import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import type { Finding, PackSummary, ScanSummary, SpecDriftItem } from '../../src/analysis/analysis.types.ts';
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
import { formatAgentPrompt, remediationFor } from './remediations.ts';

type Tab = 'findings' | 'drift';
type Domain = 'ALL' | 'architecture' | 'standards';

const PAGE_SIZE = 50;
const SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;

const appRoot = $('app');
const engineLabel = $('engine-label');
const scanMeta = $('scan-meta');
const loading = $('loading');
const failure = $('failure');
const summarySection = $('summary');
const packOverview = $('pack-overview');
const packOverviewBody = $('pack-overview-body');
const packOverviewMeta = $('pack-overview-meta');
const tabsEl = $('tabs');
const findingsList = $('findings-list');
const findingsCount = $('findings-count');
const severityFilterEl = $('severity-filter');
const domainFilterEl = $('domain-filter');
const searchInput = $<HTMLInputElement>('search');
const showMoreBtn = $<HTMLButtonElement>('show-more');
const panelDrift = $('panel-drift');
const modeSelect = $<HTMLSelectElement>('mode');
const rescanBtn = $<HTMLButtonElement>('rescan');
const setStatus = createStatus($('status'));

let current: ScanSummary | null = null;
let severityFilter = 'ALL';
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
			: [errors && `${errors} error`, warnings && `${warnings} warning`].filter(Boolean).join(' · ') || 'Info only';
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

const renderDriftRow = (item: SpecDriftItem): string => `
	<tr>
		<td><span class="badge ${severityClass(item.severity)}">${severityLabel(item.severity)}</span></td>
		<td>
			<code title="${escapeHtml(item.ruleId)}">${escapeHtml(shortRuleId(item.ruleId))}</code>
			${item.adr ? `<span class="badge tone-info">${escapeHtml(item.adr)}</span>` : ''}
			<div class="subtle">${escapeHtml(item.message)}</div>
		</td>
		<td class="num">${item.violationCount}</td>
		<td>${item.samplePaths.map((p) => `<div class="item-path">${escapeHtml(p)}</div>`).join('')}</td>
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
				<thead><tr><th scope="col">Severity</th><th scope="col">Rule</th><th scope="col" class="num">Violations</th><th scope="col">Examples</th></tr></thead>
				<tbody>${drifting.map(renderDriftRow).join('')}</tbody>
			</table></div>`
		: emptyState('No spec drift', 'Every declared rule is clean.', 'success');
	const cleanList = clean.length
		? `<details class="disclosure">
				<summary>${plural(clean.length, 'clean rule')}</summary>
				<div class="disclosure-body"><ul class="list">${clean
					.map(
						(r) => `<li><code>${escapeHtml(r.ruleId)}</code> <span class="subtle">${escapeHtml(r.message)}</span></li>`,
					)
					.join('')}</ul></div>
			</details>`
		: '';
	panelDrift.innerHTML = `${driftTable}${cleanList}`;
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
	renderSeverityFilter(s);
	const domains = new Set(s.findings.map(domainOf));
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

// ── Events ───────────────────────────────────────────────────────────────────

createSegmented(severityFilterEl, (value) => {
	severityFilter = value;
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
