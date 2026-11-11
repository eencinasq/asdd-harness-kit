import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import { serializeCommentsMarkdown } from '../../src/pr-review/comments/comments-format.ts';
import type { InlineComment, ParsedComments, PrReviewView, ReviewEvent } from '../../src/pr-review/pr-review.types.ts';
import { INLINE_WORD_LIMIT, SUMMARY_WORD_LIMIT } from '../../src/pr-review/pr-review.types.ts';
import { renderMarkdown } from '../shared/markdown.ts';
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
	inlineMarkdown,
	plural,
	severityClass,
	severityLabel,
	toolErrorText,
	withBusyButton,
} from '../shared/ui.ts';

type Tab = 'comments' | 'requirements' | 'coverage' | 'architecture' | 'report';
type Requirements = NonNullable<PrReviewView['requirements']>;
type Verdict = 'met' | 'partial' | 'unmet' | 'unverifiable';

const VERDICTS: Record<Verdict, { readonly label: string; readonly icon: string; readonly tone: string }> = {
	met: { label: 'Met', icon: '✓', tone: 'tone-success' },
	partial: { label: 'Partial', icon: '◐', tone: 'tone-warning' },
	unmet: { label: 'Not met', icon: '✕', tone: 'tone-danger' },
	unverifiable: { label: 'Manual check', icon: '?', tone: 'tone-info' },
};
type Phase = PrReviewView['phase'];

const EVENT_LABELS: Record<ReviewEvent, string> = {
	APPROVE: 'Approve',
	REQUEST_CHANGES: 'Request changes',
	COMMENT: 'Comment',
};

/** Stepper order; `needsConfirmation` sits on the draft step. */
const STEPS = ['prepared', 'reviewing', 'draft', 'published'] as const;
const STEP_OF: Record<Phase, number> = { prepared: 0, reviewing: 1, draft: 2, needsConfirmation: 2, published: 3 };

const appRoot = $('app');
const loading = $('loading');
const emptyEl = $('empty');
const tabsEl = $('tabs');
const alerts = $('alerts');
const inlineList = $('inline-list');
const summary = $<HTMLTextAreaElement>('summary');
const summaryWords = $('summary-words');
const coveragePanel = $('panel-coverage');
const architectureSummary = $('architecture-summary');
const architectureList = $('architecture-list');
const reportView = $('report-view');
const reportRendered = $('report-rendered');
const actionbar = $('actionbar');
const dirtyState = $('dirty-state');
const publishHint = $('publish-hint');
const confirmBox = $('confirm');
const openPrBtn = $<HTMLButtonElement>('open-pr');
const reloadBtn = $<HTMLButtonElement>('reload');
const saveBtn = $<HTMLButtonElement>('save');
const publishBtn = $<HTMLButtonElement>('publish');
const publishPendingBtn = $<HTMLButtonElement>('publish-pending');
const confirmPublishBtn = $<HTMLButtonElement>('confirm-publish');
const cancelPublishBtn = $<HTMLButtonElement>('cancel-publish');
const sendAgentBtn = $<HTMLButtonElement>('send-agent');
const generateRulesBtn = $<HTMLButtonElement>('generate-rules');
const rescanArchitectureBtn = $<HTMLButtonElement>('rescan-architecture');
const importArchitectureBtn = $<HTMLButtonElement>('import-architecture');
const importArchitectureAllBtn = $<HTMLButtonElement>('import-architecture-all');
const setStatus = createStatus($('status'));

$('inline-limit').textContent = String(INLINE_WORD_LIMIT);
$('summary-limit').textContent = String(SUMMARY_WORD_LIMIT);

let current: PrReviewView | null = null;
/** Comments markdown as last loaded / saved: the baseline for "unsaved changes". */
let savedSnapshot = '';
let activeTab: Tab | null = null;
let busy = false;
let reloadArmed = false;

const selectTab = createTabs<Tab>(tabsEl, (tab) => {
	activeTab = tab;
});

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const lineRange = (start: number, end: number): string => (end && end !== start ? `${start}-${end}` : String(start));

// ── Draft (comments) ─────────────────────────────────────────────────────────

const selectedEvent = (): ReviewEvent =>
	(document.querySelector<HTMLInputElement>('input[name="event"]:checked')?.value as ReviewEvent | undefined) ??
	current?.parsed?.meta.event ??
	'COMMENT';

const collectDraft = (): ParsedComments | null => {
	if (!current?.parsed) return null;
	const comments: InlineComment[] = [...inlineList.querySelectorAll<HTMLElement>('[data-path]')].map((card) => {
		const startLine = card.dataset['startLine'];
		return {
			path: card.dataset['path'] ?? '',
			line: Number(card.dataset['line'] ?? '0'),
			side: 'RIGHT',
			body: card.querySelector('textarea')?.value ?? '',
			...(startLine ? { start_line: Number(startLine), start_side: 'RIGHT' as const } : {}),
		};
	});
	return { meta: { ...current.parsed.meta, event: selectedEvent() }, comments, summary: summary.value.trim() };
};

const draftMarkdown = (): string => {
	const draft = collectDraft();
	return draft ? serializeCommentsMarkdown(draft) : '';
};

const isDirty = (): boolean => Boolean(current?.parsed) && draftMarkdown() !== savedSnapshot;

const wordLabel = (words: number, limit: number): string => `${words} / ${limit} words`;

const updateWordCount = (label: Element | null, words: number, limit: number): void => {
	if (!label) return;
	label.textContent = wordLabel(words, limit);
	label.classList.toggle('over-limit', words > limit);
};

const refreshDirty = (): void => {
	const dirty = isDirty();
	saveBtn.disabled = busy || !dirty;
	dirtyState.innerHTML = dirty ? '<span class="dirty-dot" aria-hidden="true"></span> Unsaved changes' : '';
	reloadBtn.textContent = dirty ? 'Discard & reload' : 'Reload';
	reloadArmed = false;
};

const renderComments = (view: PrReviewView): void => {
	const parsed = view.parsed;
	$('count-comments').textContent = String(parsed?.comments.length ?? 0);
	if (!parsed) {
		inlineList.innerHTML = `<li>${emptyState('No draft yet', 'The agent writes the comments after reviewing every group.')}</li>`;
		summary.value = '';
		summary.disabled = true;
		return;
	}
	summary.disabled = false;
	inlineList.innerHTML = parsed.comments.length
		? parsed.comments
				.map((c, index) => {
					const words = wordCount(c.body);
					const location = `${c.path}:${lineRange(c.start_line ?? c.line, c.line)}`;
					return `
			<li class="item" data-path="${escapeHtml(c.path)}" data-line="${c.line}"${c.start_line !== undefined ? ` data-start-line="${c.start_line}"` : ''}>
				<label class="field-label" for="inline-${index}">
					<code class="item-path">${escapeHtml(location)}</code>
					<span class="words${words > INLINE_WORD_LIMIT ? ' over-limit' : ''}">${wordLabel(words, INLINE_WORD_LIMIT)}</span>
				</label>
				<textarea id="inline-${index}" class="textarea" rows="4" spellcheck="true">${escapeHtml(c.body)}</textarea>
			</li>`;
				})
				.join('')
		: `<li>${emptyState('No inline comments', 'Only the summary will be posted.')}</li>`;
	summary.value = parsed.summary;
	updateWordCount(summaryWords, wordCount(parsed.summary), SUMMARY_WORD_LIMIT);
	const event = document.querySelector<HTMLInputElement>(`input[name="event"][value="${parsed.meta.event}"]`);
	if (event) event.checked = true;
	savedSnapshot = draftMarkdown();
};

// ── Coverage ─────────────────────────────────────────────────────────────────

const groupBadge = (status: string): string => {
	const tone = status === 'done' ? 'tone-success' : status === 'reviewing' ? 'tone-info' : '';
	const label = status === 'done' ? 'Reviewed' : status === 'reviewing' ? 'In review' : 'Pending';
	return `<span class="badge ${tone}">${label}</span>`;
};

const verdictBadgeOf = (verdict: 'confirmed' | 'plausible' | 'rejected'): string =>
	({
		confirmed: '<span class="badge tone-success">✓ Confirmed</span>',
		plausible: '<span class="badge tone-warning">◐ Plausible</span>',
		rejected: '<span class="badge tone-danger">✕ Rejected</span>',
	})[verdict];

const renderCoverage = (view: PrReviewView): void => {
	const progress = view.progress;
	const units = view.units;
	const groups =
		progress?.groups ??
		(units?.groups ?? []).map((g, index) => ({
			index,
			label: g.label,
			files: g.files,
			status: 'pending' as const,
			findingCount: 0,
			ruleDocId: g.ruleDocId,
		}));
	$('count-coverage').textContent = progress ? `${progress.doneCount}/${progress.totalCount}` : String(groups.length);
	if (groups.length === 0) {
		coveragePanel.innerHTML = emptyState('No review groups yet', 'Ask the agent to start the review.');
		return;
	}

	const next = view.nextGroup
		? `<div class="callout">
				<p class="callout-title">Next: group ${view.nextGroup.index + 1} · ${escapeHtml(view.nextGroup.label)}</p>
				<p class="subtle">Review rule <code>${escapeHtml(view.nextGroup.ruleDocId)}</code> on ${plural(view.nextGroup.files.length, 'file')}.</p>
			</div>`
		: '';

	const groupItems = groups
		.map(
			(g) => `
		<li class="item">
			<div class="item-head">
				<span class="item-title">${g.index + 1}. ${escapeHtml(g.label)}</span>
				${groupBadge(g.status)}
				${g.findingCount ? `<span class="badge">${plural(g.findingCount, 'finding')}</span>` : ''}
			</div>
			<details class="disclosure">
				<summary>${plural(g.files.length, 'file')}${g.ruleDocId ? ` · rule ${escapeHtml(g.ruleDocId)}` : ''}</summary>
				<div class="disclosure-body">${g.files.map((f) => `<div class="item-path">${escapeHtml(f)}</div>`).join('')}</div>
			</details>
		</li>`,
		)
		.join('');

	const findings = progress?.findings.length
		? `<details class="disclosure">
				<summary>${plural(progress.findings.length, 'finding')} submitted by the agent</summary>
				<div class="disclosure-body"><ul class="list">${progress.findings
					.map(
						(f) => `<li${f.verdict === 'rejected' ? ' class="is-rejected"' : ''}>
							<div class="item-head">
								<span class="badge">${escapeHtml(f.severity ?? 'medium')}</span>
								${f.verdict ? verdictBadgeOf(f.verdict) : ''}
								${f.confidence !== undefined ? `<span class="subtle">confidence ${f.confidence}</span>` : ''}
								<code class="item-path">${escapeHtml(f.path)}:${lineRange(f.startLine, f.endLine)}</code>
							</div>
							<p class="item-body">${escapeHtml(f.content)}</p>
							${f.verifyNote ? `<p class="subtle">${escapeHtml(f.verifyNote)}</p>` : ''}
						</li>`,
					)
					.join('')}</ul></div>
			</details>`
		: '';

	const skipped = units?.skipped.length
		? `<details class="disclosure">
				<summary>${plural(units.skipped.length, 'file')} skipped</summary>
				<div class="disclosure-body">${units.skipped
					.map(
						(s) =>
							`<div><code class="item-path">${escapeHtml(s.path)}</code> <span class="subtle">${escapeHtml(s.reason)}</span></div>`,
					)
					.join('')}</div>
			</details>`
		: '';

	const allGroupsDone = groups.every((g) => g.status === 'done');
	const verification = progress?.verification;
	const verificationItem = verification
		? `<li class="item">
				<div class="item-head">
					<span class="item-title">${groups.length + 1}. Verify findings</span>
					${groupBadge(verification === 'done' ? 'done' : allGroupsDone ? 'reviewing' : 'pending')}
				</div>
				<p class="subtle">Each finding re-checked on its own: confirmed ones are posted, plausible ones go to the summary, rejected ones are dropped.</p>
			</li>`
		: '';
	const req = view.requirements;
	const requirementsItem = req
		? `<li class="item">
				<div class="item-head">
					<span class="item-title">${groups.length + (verification ? 2 : 1)}. Ticket criteria</span>
					${groupBadge(req.status === 'done' ? 'done' : allGroupsDone && verification !== 'pending' ? 'reviewing' : 'pending')}
				</div>
				<p class="subtle">${plural(req.criteria.length, 'criterion', 'criteria')} from ${escapeHtml(req.ticket.ref ?? req.ticket.source)}, verified against the whole PR.</p>
			</li>`
		: '';
	coveragePanel.innerHTML = `${next}<ul class="list">${groupItems}${verificationItem}${requirementsItem}</ul>${findings}${skipped}`;
};

// ── Architecture ─────────────────────────────────────────────────────────────

const renderArchitecture = (view: PrReviewView): void => {
	const arch = view.architecture;
	const engine = arch?.engine ?? { name: 'Semgrep', rulesDir: '.semgrep' };
	const card = $('kpi-arch-card');
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');
	$('count-architecture').textContent = String(arch?.findingCount ?? 0);

	const needsRules = arch?.status === 'missing-config' || arch?.status === 'empty-config';
	const hasFindings = arch?.status === 'scanned' && arch.findings.length > 0;
	generateRulesBtn.hidden = !needsRules;
	importArchitectureBtn.hidden = !hasFindings;
	importArchitectureAllBtn.hidden = !hasFindings;
	rescanArchitectureBtn.hidden = !arch;

	if (!arch) {
		$('kpi-arch').textContent = '—';
		$('kpi-arch-hint').textContent = 'Not scanned';
		architectureSummary.innerHTML = emptyState('No architecture scan yet', 'It runs when the review starts.');
		architectureList.innerHTML = '';
		return;
	}

	$('kpi-arch').textContent = arch.status === 'scanned' ? String(arch.findingCount) : '—';
	$('kpi-arch-hint').textContent =
		arch.status === 'scanned'
			? `${engine.name} · ${plural(arch.configFiles.length, 'rule file')}`
			: needsRules
				? `No ${engine.rulesDir} rules`
				: `${engine.name} failed`;
	card.classList.add(arch.status === 'scanned' ? (arch.findingCount ? 'tone-warning' : 'tone-success') : 'tone-danger');

	if (needsRules) {
		architectureSummary.innerHTML = `<div class="callout tone-warning">
			<p class="callout-title">This repo has no ${escapeHtml(engine.name)} rules yet</p>
			<p>${inlineMarkdown(arch.message)} The agent can draft rules from the codebase and its ADRs; then rescan.</p>
		</div>`;
	} else if (arch.status === 'error') {
		architectureSummary.innerHTML = `<div class="callout tone-danger">
			<p class="callout-title">${inlineMarkdown(arch.message)}</p>
			${arch.stderrTail ? `<details class="disclosure"><summary>Error output</summary><pre class="block">${escapeHtml(arch.stderrTail)}</pre></details>` : ''}
		</div>`;
	} else {
		architectureSummary.innerHTML = `<p class="muted">${inlineMarkdown(arch.message)}${
			hasFindings ? ' Pick the ones worth raising, then add them to the draft.' : ''
		}</p>`;
	}

	architectureList.innerHTML = hasFindings
		? `<li><label class="choice"><input type="checkbox" id="arch-select-all" checked /> Select all</label></li>${arch.findings
				.map(
					(f, index) => `
			<li class="item ${severityClass(f.severity)}">
				<label class="item-head" style="cursor:pointer">
					<input type="checkbox" class="arch-check" data-index="${index}" checked aria-label="Include ${escapeHtml(f.checkId)} at ${escapeHtml(f.path)}:${f.startLine}" />
					<span class="badge ${severityClass(f.severity)}">${severityLabel(f.severity)}</span>
					<code class="item-title">${escapeHtml(f.checkId)}</code>
				</label>
				<div class="item-path">${escapeHtml(f.path)}:${lineRange(f.startLine, f.endLine)}</div>
				<p class="item-body">${escapeHtml(f.message)}</p>
			</li>`,
				)
				.join('')}`
		: arch.status === 'scanned'
			? `<li>${emptyState('No architecture findings', 'The changed files follow the project rules.', 'success')}</li>`
			: '';
	updateImportButton();
};

const selectedArchitectureIndices = (): number[] =>
	[...architectureList.querySelectorAll<HTMLInputElement>('input.arch-check:checked')].map((i) =>
		Number(i.dataset['index']),
	);

const updateImportButton = (): void => {
	const count = selectedArchitectureIndices().length;
	importArchitectureBtn.textContent = count
		? `Add ${plural(count, 'finding')} to comments`
		: 'Add selected to comments';
	importArchitectureBtn.disabled = busy || count === 0;
};

// ── Requirements (ticket criteria) ───────────────────────────────────────────

const requirementsList = $('requirements-list');
const saveRequirementsBtn = $<HTMLButtonElement>('save-requirements');
const openTicketBtn = $<HTMLButtonElement>('open-ticket');

/** Verdicts the human changed in this view and has not saved yet. */
const changedVerdicts = (): Array<{ id: string; status: Verdict }> => {
	const criteria = current?.requirements?.criteria ?? [];
	return [...requirementsList.querySelectorAll<HTMLSelectElement>('select[data-id]')]
		.filter(
			(select) =>
				criteria.find((c) => c.id === select.dataset['id'])?.status !== select.value && select.value !== 'pending',
		)
		.map((select) => ({ id: select.dataset['id'] ?? '', status: select.value as Verdict }));
};

const refreshRequirementsDirty = (): void => {
	const count = changedVerdicts().length;
	saveRequirementsBtn.disabled = busy || count === 0;
	saveRequirementsBtn.textContent = count ? `Save ${plural(count, 'verdict')}` : 'Save verdicts';
	$('requirements-dirty').innerHTML = count
		? '<span class="dirty-dot" aria-hidden="true"></span> Unsaved verdicts'
		: '';
};

const verdictBadge = (status: string): string => {
	const v = VERDICTS[status as Verdict];
	return v
		? `<span class="badge ${v.tone}"><span aria-hidden="true">${v.icon}</span> ${v.label}</span>`
		: '<span class="badge">Pending</span>';
};

const renderRequirements = (view: PrReviewView): void => {
	const req: Requirements | undefined = view.requirements;
	$('tab-requirements').hidden = !req;
	$('kpi-req-card').hidden = !req;
	if (!req) return;

	const met = req.criteria.filter((c) => c.status === 'met').length;
	const unmet = req.criteria.filter((c) => c.status === 'unmet').length;
	const verified = req.status === 'done';
	$('count-requirements').textContent = verified ? `${met}/${req.criteria.length}` : String(req.criteria.length);
	$('kpi-req').textContent = verified ? `${met}/${req.criteria.length}` : '—';
	$('kpi-req-hint').textContent = verified ? (unmet ? `${unmet} not met` : 'met') : 'Verified after the groups';
	const card = $('kpi-req-card');
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');
	if (verified)
		card.classList.add(unmet ? 'tone-danger' : met === req.criteria.length ? 'tone-success' : 'tone-warning');

	const ticket = req.ticket;
	$('ticket-title').textContent = [ticket.ref, ticket.title].filter(Boolean).join(' · ') || 'Ticket';
	$('ticket-meta').textContent =
		`${{ jira: 'Jira', linear: 'Linear', github: 'GitHub issue', text: 'Pasted text' }[ticket.source]} · ${plural(req.criteria.filter((c) => c.kind === 'acceptance').length, 'acceptance criterion', 'acceptance criteria')} · ${plural(req.criteria.filter((c) => c.kind === 'done').length, 'done item')}`;
	openTicketBtn.hidden = !ticket.url;

	$('requirements-alert').innerHTML = verified
		? unmet
			? `<div class="callout tone-danger"><p class="callout-title">${plural(unmet, 'criterion', 'criteria')} not met</p><p>The draft suggests “Request changes”. You decide before submitting.</p></div>`
			: ''
		: '<div class="callout"><p class="callout-title">Not verified yet</p><p>The agent checks these against the whole PR after reviewing every group.</p></div>';

	requirementsList.innerHTML = req.criteria
		.map(
			(c) => `
		<li class="item" data-criterion="${escapeHtml(c.id)}">
			<div class="item-head">
				<code class="item-title">${escapeHtml(c.id)}</code>
				<span class="badge">${c.kind === 'acceptance' ? 'Acceptance' : 'Done'}</span>
				${verdictBadge(c.status)}
				${c.by === 'human' ? '<span class="subtle">set by you</span>' : ''}
				<span class="spacer"></span>
				<label class="sr-only" for="verdict-${escapeHtml(c.id)}">Verdict for ${escapeHtml(c.id)}</label>
				<select class="select" id="verdict-${escapeHtml(c.id)}" data-id="${escapeHtml(c.id)}" ${verified ? '' : 'disabled'}>
					${c.status === 'pending' ? '<option value="pending" selected>Pending</option>' : ''}
					${(Object.keys(VERDICTS) as Verdict[])
						.map((v) => `<option value="${v}"${c.status === v ? ' selected' : ''}>${VERDICTS[v].label}</option>`)
						.join('')}
				</select>
			</div>
			<p class="item-body">${inlineMarkdown(c.text)}</p>
			${c.note ? `<p class="subtle">${inlineMarkdown(c.note)}</p>` : ''}
			${c.evidence.length ? `<div>${c.evidence.map((e) => `<code class="item-path">${escapeHtml(e)}</code>`).join(' ')}</div>` : ''}
		</li>`,
		)
		.join('');

	const signals = req.signals;
	const signalRow = (label: string, files: readonly string[]) =>
		`<dt>${label}</dt><dd>${files.length ? files.map((f) => `<code>${escapeHtml(f)}</code>`).join(', ') : '<span class="subtle">none</span>'}</dd>`;
	$('requirements-extra').innerHTML = `
		${req.unrelatedChanges.length ? `<div class="callout tone-warning"><p class="callout-title">Changes the ticket doesn’t explain</p><ul>${req.unrelatedChanges.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul></div>` : ''}
		${req.summary ? `<p class="muted">${escapeHtml(req.summary)}</p>` : ''}
		<details class="disclosure">
			<summary>Facts from the diff</summary>
			<div class="disclosure-body"><dl class="dl">
				${signalRow('Tests', signals.testFiles)}${signalRow('Docs', signals.docFiles)}${signalRow('Migrations', signals.migrationFiles)}${signalRow('Config', signals.configFiles)}
			</dl></div>
		</details>`;
	refreshRequirementsDirty();
};

// ── Report ───────────────────────────────────────────────────────────────────

const renderReport = (view: PrReviewView): void => {
	const markdown = view.reportMarkdown?.trim();
	reportView.textContent = markdown ?? '';
	reportRendered.innerHTML = markdown
		? renderMarkdown(markdown)
		: emptyState('No report yet', 'The agent writes it while reviewing the groups.');
};

const setReportMode = createSegmented($('report-mode'), (mode) => {
	reportRendered.hidden = mode !== 'formatted';
	reportView.hidden = mode !== 'markdown';
});
setReportMode('formatted');

// Sandboxed views cannot navigate: links in the report open through the host.
reportRendered.addEventListener('click', (event) => {
	const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-href]');
	if (!link) return;
	event.preventDefault();
	const url = link.dataset['href'];
	if (url) void app.openLink({ url }).catch((error: unknown) => setStatus(errorMessage(error), 'danger'));
});

// ── Header, KPIs, alerts, actions ────────────────────────────────────────────

const renderHeader = (view: PrReviewView): void => {
	const meta = view.metadata;
	$('repo-label').textContent = view.state.repo || baseName(view.paths.repoRoot);
	$('pr-title').textContent = meta?.title ?? `Pull request #${view.pr}`;
	const phaseLabel = {
		prepared: 'Prepared',
		reviewing: 'Reviewing',
		draft: 'Draft ready',
		needsConfirmation: 'Needs confirmation',
		published: 'Submitted',
	}[view.phase];
	const phaseTone = {
		prepared: '',
		reviewing: 'tone-info',
		draft: 'tone-info',
		needsConfirmation: 'tone-warning',
		published: 'tone-success',
	}[view.phase];
	$('review-meta').innerHTML = [
		`<span class="mono">#<span id="kpi-pr">${view.pr}</span></span>`,
		meta
			? `<span class="dot"></span><code>${escapeHtml(meta.headRefName)}</code> → <code>${escapeHtml(meta.baseRefName)}</code>`
			: '',
		meta?.author ? `<span class="dot"></span><span>${escapeHtml(meta.author)}</span>` : '',
		`<span class="dot"></span><span class="badge ${phaseTone}" id="kpi-phase" data-phase="${view.phase}">${phaseLabel}</span>`,
	].join('');
	openPrBtn.hidden = !(view.reviewUrl ?? meta?.url);
	openPrBtn.textContent = view.reviewUrl ? 'Open review on GitHub ↗' : 'Open on GitHub ↗';

	const stepper = $('stepper');
	stepper.hidden = false;
	const step = STEP_OF[view.phase];
	for (const li of stepper.querySelectorAll<HTMLElement>('li')) {
		const index = STEPS.indexOf(li.dataset['step'] as (typeof STEPS)[number]);
		li.className =
			index < step || (index === step && view.phase === 'published') ? 'is-done' : index === step ? 'is-current' : '';
		if (index === step && view.phase === 'needsConfirmation') li.classList.add('is-attention');
		if (index === step) li.setAttribute('aria-current', 'step');
		else li.removeAttribute('aria-current');
	}
};

const renderKpis = (view: PrReviewView): void => {
	$('kpis').hidden = false;
	const progress = view.progress;
	const done = progress?.doneCount ?? 0;
	const total = progress?.totalCount ?? view.units?.groups.length ?? 0;
	$('kpi-coverage').textContent = total ? `${done}/${total}` : '—';
	const pct = total ? Math.round((100 * done) / total) : 0;
	const meter = $('coverage-meter');
	meter.setAttribute('aria-valuemax', String(total));
	meter.setAttribute('aria-valuenow', String(done));
	meter.setAttribute('aria-valuetext', `${done} of ${total} groups reviewed`);
	meter.className = `meter${pct < 100 ? ' tone-warning' : ''}`;
	$('coverage-bar').style.width = `${pct}%`;

	const comments = view.parsed?.comments ?? [];
	$('kpi-inlines').textContent = String(comments.length);
	const edited = view.check?.changes.filter((c) => c.kind !== 'unchanged').length ?? 0;
	$('kpi-inlines-hint').textContent = edited
		? `${plural(edited, 'edit')} by you`
		: view.parsed
			? 'As drafted'
			: 'No draft yet';

	$('kpi-rev').textContent = String(view.state.current.revision);
	// Revisions store a calendar date (YYYY-MM-DD), not a time: show it as such.
	const date = view.state.current.date;
	$('kpi-rev-hint').textContent = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date ? formatWhen(date) : '';
};

const renderAlerts = (view: PrReviewView): void => {
	const items: string[] = [];
	if (view.phase === 'needsConfirmation') {
		const risky = (view.check?.changes ?? []).filter(
			(c) => c.kind === 'removed' || (c.kind === 'edited' && (c.similarity ?? 1) < 0.5),
		);
		const changed = [
			...risky.map(
				(r) => `<li><code>${escapeHtml(r.key)}</code> ${r.kind === 'removed' ? 'removed' : 'rewritten'}</li>`,
			),
			...(view.check && view.check.summaryChange.kind !== 'unchanged'
				? ['<li>The review summary was rewritten</li>']
				: []),
		];
		items.push(`<div class="callout tone-warning" role="alert">
			<p class="callout-title">Your edits change what the agent found</p>
			${changed.length ? `<ul>${changed.join('')}</ul>` : '<p>Some comments were removed or heavily rewritten.</p>'}
			<p>Check the Comments tab. If the changes are intended, submit again to confirm.</p>
		</div>`);
	}
	if (view.phase === 'published') {
		items.push(
			`<div class="callout tone-success"><p class="callout-title">Review submitted to GitHub</p>${
				view.reviewUrl ? `<p class="subtle">${escapeHtml(view.reviewUrl)}</p>` : ''
			}</div>`,
		);
	}
	for (const warning of view.warnings ?? []) {
		if (view.phase !== 'needsConfirmation')
			items.push(`<div class="callout tone-warning"><p>${escapeHtml(warning)}</p></div>`);
	}
	alerts.innerHTML = items.join('');
};

const coverageIncomplete = (): boolean => Boolean(current?.progress && !current.progress.complete);

const renderActions = (view: PrReviewView): void => {
	actionbar.hidden = !view.parsed;
	confirmBox.hidden = true;
	const incomplete = coverageIncomplete();
	publishHint.hidden = !incomplete;
	publishHint.textContent = incomplete
		? `Submitting unlocks once every group${view.requirements ? ' and the ticket criteria are' : ' is'} reviewed (${view.progress?.doneCount}/${view.progress?.totalCount}).`
		: '';
	publishBtn.textContent =
		view.phase === 'published'
			? 'Submit again…'
			: view.phase === 'needsConfirmation'
				? 'Confirm and submit…'
				: 'Submit review…';
	setActionsDisabled(busy);
};

const setActionsDisabled = (disabled: boolean): void => {
	busy = disabled;
	appRoot.setAttribute('aria-busy', String(disabled));
	const blockPublish = disabled || coverageIncomplete();
	publishBtn.disabled = blockPublish;
	publishPendingBtn.disabled = blockPublish;
	confirmPublishBtn.disabled = disabled;
	reloadBtn.disabled = disabled || !current;
	rescanArchitectureBtn.disabled = disabled;
	importArchitectureAllBtn.disabled = disabled;
	generateRulesBtn.disabled = disabled;
	refreshDirty();
	updateImportButton();
	refreshRequirementsDirty();
};

const defaultTab = (view: PrReviewView): Tab => {
	if (view.phase === 'needsConfirmation') return 'comments';
	const groupsDone = view.progress?.groups.every((g) => g.status === 'done');
	if (view.requirements?.status === 'pending' && groupsDone) return 'requirements';
	if (view.phase === 'prepared' || view.phase === 'reviewing' || coverageIncomplete()) return 'coverage';
	if (view.message.startsWith('Imported')) return 'comments';
	return activeTab ?? (view.parsed ? 'comments' : 'coverage');
};

/** `announce`: show the server's message (only for actions the human took in this view). */
const render = (incoming: PrReviewView, announce = false): void => {
	// Some results omit the ticket; keep the one already shown for this PR.
	const view =
		incoming.requirements || current?.pr !== incoming.pr || !current.requirements
			? incoming
			: { ...incoming, requirements: current.requirements };
	current = view;
	loading.hidden = true;
	emptyEl.hidden = true;
	tabsEl.hidden = false;
	renderHeader(view);
	renderKpis(view);
	renderAlerts(view);
	renderComments(view);
	renderRequirements(view);
	renderCoverage(view);
	renderArchitecture(view);
	renderReport(view);
	renderActions(view);
	selectTab(defaultTab(view));
	// The server's messages are written for the model; show them only as feedback to an action here.
	if (view.phase === 'needsConfirmation') setStatus('Confirm your edits before submitting.');
	else setStatus(announce ? (view.message.split('\n')[0] ?? '') : '');
};

// ── Server calls ─────────────────────────────────────────────────────────────

const parseView = (result: { structuredContent?: unknown }): PrReviewView | null => {
	const content = result.structuredContent as PrReviewView | undefined;
	return content && typeof content === 'object' && content.kind === 'pr-review' ? content : null;
};

/** Identify the review on every call: the server may run outside the reviewed repo (e.g. cwd `/`). */
const prArgs = (): { pr: number; repoPath?: string } => {
	if (!current) throw new Error('No pull request loaded');
	return { pr: current.pr, repoPath: current.paths.repoRoot || undefined };
};

/** Call a tool; render the new view, or report the failure. Resolves to whether it succeeded. */
const callTool = async (name: string, args: Record<string, unknown>, failure: string): Promise<boolean> => {
	try {
		const result = await app.callServerTool({ name, arguments: args });
		if (result.isError) {
			setStatus(`${failure}: ${toolErrorText(result) || 'unknown error'}`, 'danger');
			return false;
		}
		const view = parseView(result);
		if (view) render(view, true);
		return true;
	} catch (error) {
		setStatus(`${failure}: ${errorMessage(error)}`, 'danger');
		return false;
	}
};

/** Run one action at a time, with its button showing progress and the others disabled. */
const run = (button: HTMLButtonElement, busyLabel: string, task: () => Promise<unknown>): void => {
	if (busy) return;
	setActionsDisabled(true);
	void withBusyButton(button, busyLabel, task).finally(() => setActionsDisabled(false));
};

const saveDraft = async (): Promise<boolean> => {
	if (!isDirty()) return true;
	setStatus('Saving draft…', 'busy');
	const ok = await callTool(
		'pr_review_ui_save',
		{ ...prArgs(), commentsMarkdown: draftMarkdown(), reportMarkdown: current?.reportMarkdown },
		'Could not save the draft',
	);
	if (ok) setStatus('Draft saved.', 'success');
	return ok;
};

const publish = async (pending: boolean): Promise<void> => {
	if (!(await saveDraft())) return;
	setStatus(pending ? 'Saving a pending review on GitHub…' : 'Submitting the review to GitHub…', 'busy');
	const force = current?.phase === 'needsConfirmation';
	const ok = await callTool('pr_review_ui_publish', { ...prArgs(), pending, force }, 'Could not submit the review');
	if (ok && current?.phase === 'published')
		setStatus(pending ? 'Pending review saved on GitHub.' : 'Review submitted.', 'success');
};

// ── Events ───────────────────────────────────────────────────────────────────

inlineList.addEventListener('input', (event) => {
	const target = event.target;
	if (!(target instanceof HTMLTextAreaElement)) return;
	updateWordCount(target.closest('li')?.querySelector('.words') ?? null, wordCount(target.value), INLINE_WORD_LIMIT);
	refreshDirty();
});

summary.addEventListener('input', () => {
	updateWordCount(summaryWords, wordCount(summary.value), SUMMARY_WORD_LIMIT);
	refreshDirty();
});

$('event-choices').addEventListener('change', refreshDirty);

saveBtn.addEventListener('click', () => run(saveBtn, 'Saving…', saveDraft));

reloadBtn.addEventListener('click', () => {
	if (isDirty() && !reloadArmed) {
		reloadArmed = true;
		setStatus('You have unsaved edits. Click “Discard & reload” again to drop them.', 'danger');
		return;
	}
	run(reloadBtn, 'Reloading…', () => callTool('pr_review_ui_reload', prArgs(), 'Could not reload'));
});

publishBtn.addEventListener('click', () => {
	if (!current) return;
	const count = collectDraft()?.comments.length ?? 0;
	const event = selectedEvent();
	$('confirm-title').textContent =
		current.phase === 'needsConfirmation' ? 'Submit with your edits?' : `Submit “${EVENT_LABELS[event]}” to GitHub?`;
	$('confirm-body').textContent =
		`This posts ${plural(count, 'inline comment')} and the summary on PR #${current.pr} as you. The author and reviewers are notified.`;
	confirmPublishBtn.textContent = current.phase === 'needsConfirmation' ? 'Submit anyway' : 'Submit review';
	confirmBox.hidden = false;
	confirmPublishBtn.focus();
});

cancelPublishBtn.addEventListener('click', () => {
	confirmBox.hidden = true;
	publishBtn.focus();
});

confirmBox.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') cancelPublishBtn.click();
});

confirmPublishBtn.addEventListener('click', () => run(confirmPublishBtn, 'Submitting…', () => publish(false)));
publishPendingBtn.addEventListener('click', () => run(publishPendingBtn, 'Saving…', () => publish(true)));

openPrBtn.addEventListener('click', () => {
	const url = current?.reviewUrl ?? current?.metadata?.url;
	if (url) void app.openLink({ url }).catch((error: unknown) => setStatus(errorMessage(error), 'danger'));
});

const askAgent = async (text: string, done: string): Promise<void> => {
	try {
		const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
		setStatus(result.isError ? 'The host did not accept the message.' : done, result.isError ? 'danger' : 'success');
	} catch (error) {
		setStatus(errorMessage(error), 'danger');
	}
};

sendAgentBtn.addEventListener('click', () => {
	if (!current) return;
	const prompt =
		current.prompt ??
		`Continue the PR #${current.pr} review. Diff: ${current.paths.diff}. Repo: ${current.paths.repoRoot}. Draft: ${current.paths.base}. Revise the report and comments if needed, then call pr_review_save_draft.`;
	run(sendAgentBtn, 'Sending…', () => askAgent(prompt, 'Sent the review context to the agent.'));
});

generateRulesBtn.addEventListener('click', () => {
	const prompt = current?.architecture?.generatePrompt;
	if (!prompt) {
		setStatus('No rule-generation prompt is available for this repo.', 'danger');
		return;
	}
	run(generateRulesBtn, 'Sending…', () =>
		askAgent(prompt, 'Asked the agent to write the rules. Rescan when it is done.'),
	);
});

rescanArchitectureBtn.addEventListener('click', () =>
	run(rescanArchitectureBtn, 'Scanning…', () => callTool('pr_review_architecture_rescan', prArgs(), 'Rescan failed')),
);

architectureList.addEventListener('change', (event) => {
	const target = event.target as HTMLInputElement;
	if (target.id === 'arch-select-all') {
		for (const box of architectureList.querySelectorAll<HTMLInputElement>('input.arch-check'))
			box.checked = target.checked;
	} else {
		const all = $<HTMLInputElement>('arch-select-all');
		const boxes = [...architectureList.querySelectorAll<HTMLInputElement>('input.arch-check')];
		all.checked = boxes.every((b) => b.checked);
		all.indeterminate = !all.checked && boxes.some((b) => b.checked);
	}
	updateImportButton();
});

importArchitectureBtn.addEventListener('click', () =>
	run(importArchitectureBtn, 'Adding…', () =>
		callTool(
			'pr_review_import_architecture',
			{ ...prArgs(), indices: selectedArchitectureIndices() },
			'Could not add the findings',
		),
	),
);

importArchitectureAllBtn.addEventListener('click', () =>
	run(importArchitectureAllBtn, 'Adding…', () =>
		callTool('pr_review_import_architecture', prArgs(), 'Could not add the findings'),
	),
);

requirementsList.addEventListener('change', refreshRequirementsDirty);

saveRequirementsBtn.addEventListener('click', () =>
	run(saveRequirementsBtn, 'Saving…', async () => {
		// Keep unsaved comment edits: the server rewrites the summary's criteria block.
		if (!(await saveDraft())) return;
		const results = changedVerdicts();
		if (results.length === 0) return;
		const ok = await callTool('pr_review_ui_requirements', { ...prArgs(), results }, 'Could not save the verdicts');
		if (ok) setStatus(`Saved ${plural(results.length, 'verdict')}. The summary’s checklist is updated.`, 'success');
	}),
);

openTicketBtn.addEventListener('click', () => {
	const url = current?.requirements?.ticket.url;
	if (url) void app.openLink({ url }).catch((error: unknown) => setStatus(errorMessage(error), 'danger'));
});

const app = new App({ name: 'PR review', version: '1.0.0' });

app.ontoolinput = () => setStatus('Preparing the review…', 'busy');

app.ontoolresult = (result) => {
	if (result.isError) {
		loading.hidden = true;
		setStatus(`The review tool failed: ${toolErrorText(result) || 'unknown error'}`, 'danger');
		return;
	}
	const view = parseView(result);
	if (view) render(view);
	else if (!current) {
		loading.hidden = true;
		emptyEl.hidden = false;
		emptyEl.innerHTML = emptyState('No review yet', 'Ask the agent to start a PR review.');
	}
};

app.ontoolcancelled = () => {
	loading.hidden = true;
	setStatus('Cancelled.');
};

void connectApp(app);
