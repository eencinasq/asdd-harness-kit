import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import { serializeCommentsMarkdown } from '../../src/pr-review/comments/comments-format.ts';
import {
	collectInboxItems,
	type InboxSource,
	isHighSeverity,
	pinableUnmetCriteria,
} from '../../src/pr-review/findings/findings-inbox.ts';
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

type Tab = 'comments' | 'findings' | 'requirements' | 'architecture' | 'security' | 'code-coverage' | 'report';
type FindingsFilter = 'all' | InboxSource;
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
const coverageView = $('coverage-view');
const coveragePanel = $('panel-coverage');
const coverageBackBtn = $<HTMLButtonElement>('coverage-back');
const coverageCard = $<HTMLButtonElement>('kpi-coverage-card');
const inlinesCard = $<HTMLButtonElement>('kpi-inlines-card');
const requirementsCard = $<HTMLButtonElement>('kpi-req-card');
const architectureCard = $<HTMLButtonElement>('kpi-arch-card');
const securityCard = $<HTMLButtonElement>('kpi-security-card');
const codeCoverageCard = $<HTMLButtonElement>('kpi-code-coverage-card');
const architectureSummary = $('architecture-summary');
const architectureList = $('architecture-list');
const securitySummary = $('security-summary');
const securityList = $('security-list');
const codeCoverageSummary = $('code-coverage-summary');
const codeCoverageList = $('code-coverage-list');
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
const generateSecurityRulesBtn = $<HTMLButtonElement>('generate-security-rules');
const generateCodeCoverageBtn = $<HTMLButtonElement>('generate-code-coverage');
const rescanSecurityBtn = $<HTMLButtonElement>('rescan-security');
const rescanCodeCoverageBtn = $<HTMLButtonElement>('rescan-code-coverage');
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
let coverageOpen = false;
let busy = false;
let reloadArmed = false;
let findingsFilter: FindingsFilter = 'all';
/** Comments markdown before the last Findings add — Undo last add. */
let commentsBeforeLastImport: string | null = null;

const hideTabPanels = (): void => {
	for (const tab of tabsEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
		tab.setAttribute('aria-selected', 'false');
		tab.tabIndex = -1;
		const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
		if (panel) panel.hidden = true;
	}
};

const setCoverageOpen = (open: boolean): void => {
	coverageOpen = open;
	coverageView.hidden = !open;
	tabsEl.hidden = open || !current;
	coverageCard.setAttribute('aria-pressed', String(open));
	if (open) {
		hideTabPanels();
		coverageBackBtn.focus();
	}
};

const selectTab = createTabs<Tab>(tabsEl, (tab) => {
	activeTab = tab;
	if (coverageOpen) setCoverageOpen(false);
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

/** Human labels for rule-doc ids (Coverage REQ-011). Unknown ids fall back to a cleaned title. */
const RULE_LABELS: Record<string, string> = {
	ts_js_tsx_jsx: 'TypeScript / JavaScript',
	tests: 'Tests',
	json: 'JSON',
	python: 'Python',
	go: 'Go',
	java: 'Java',
	yaml: 'YAML',
	graphql: 'GraphQL',
	terraform: 'Terraform',
	default: 'General',
	package_json: 'package.json',
	github_workflows: 'GitHub Actions',
};

const ruleLabel = (ruleDocId: string | undefined): string => {
	if (!ruleDocId) return 'Review batch';
	const id = ruleDocId.replace(/\.md$/i, '');
	return RULE_LABELS[id] ?? id.replaceAll('_', ' ');
};

type CoverageGroup = {
	readonly index: number;
	readonly label: string;
	readonly files: readonly string[];
	readonly status: 'pending' | 'reviewing' | 'done';
	readonly findingCount: number;
	readonly ruleDocId?: string;
};

const renderCoverage = (view: PrReviewView): void => {
	const progress = view.progress;
	const units = view.units;
	const groups: readonly CoverageGroup[] =
		progress?.groups ??
		(units?.groups ?? []).map((g, index) => ({
			index,
			label: g.label,
			files: g.files,
			status: 'pending' as const,
			findingCount: 0,
			ruleDocId: g.ruleDocId,
		}));
	const done = progress?.doneCount ?? groups.filter((g) => g.status === 'done').length;
	const total = progress?.totalCount ?? groups.length;
	$('coverage-count').textContent = total ? `${done} of ${total} batches` : plural(groups.length, 'batch', 'batches');
	$('coverage-title').textContent = 'Review progress';
	if (groups.length === 0) {
		coveragePanel.innerHTML = emptyState('No review batches yet', 'Ask the agent to start the review.');
		return;
	}

	const remaining = total - done;
	const summaryTone = remaining === 0 ? 'tone-success' : 'tone-info';
	const summary = `<div class="callout ${summaryTone}" id="coverage-summary">
			<p class="callout-title">${
				remaining === 0
					? `All ${total} review batches are done`
					: `${done} of ${total} review batches done · ${remaining} left`
			}</p>
			<p class="muted">Coverage is how much of the PR the agent has walked through — each batch is a set of related files checked with one review guide. It is not test coverage.</p>
		</div>`;

	const next = view.nextGroup
		? `<div class="callout">
				<p class="callout-title">Up next: ${escapeHtml(ruleLabel(view.nextGroup.ruleDocId))} · batch ${view.nextGroup.index + 1}</p>
				<p class="subtle">${plural(view.nextGroup.files.length, 'file')} still to review.</p>
			</div>`
		: '';

	const findingsBlock = progress?.findings.length
		? `<section class="coverage-section" id="coverage-findings">
				<h3 class="coverage-section-title">${plural(progress.findings.length, 'finding')} from the agent</h3>
				<ul class="list">${progress.findings
					.map(
						(f) => `<li class="item${f.verdict === 'rejected' ? ' is-rejected' : ''}">
							<div class="item-head">
								<span class="badge">${escapeHtml(f.severity ?? 'medium')}</span>
								${f.category === 'security' ? '<span class="badge tone-danger">Security</span>' : ''}
								${f.verdict ? verdictBadgeOf(f.verdict) : ''}
								${f.confidence !== undefined ? `<span class="subtle">${f.confidence}% confidence</span>` : ''}
							</div>
							<code class="item-path">${escapeHtml(f.path)}:${lineRange(f.startLine, f.endLine)}</code>
							<p class="item-body">${escapeHtml(f.content)}</p>
							${f.verifyNote ? `<p class="subtle">${escapeHtml(f.verifyNote)}</p>` : ''}
						</li>`,
					)
					.join('')}</ul>
			</section>`
		: '';

	// REQ-012: group batches that share a rule doc.
	const byRule = new Map<string, CoverageGroup[]>();
	for (const g of groups) {
		const key = g.ruleDocId?.replace(/\.md$/i, '') || g.label;
		const list = byRule.get(key) ?? [];
		list.push(g);
		byRule.set(key, list);
	}

	const ruleSections = [...byRule.entries()]
		.map(([key, batches]) => {
			const doneHere = batches.filter((b) => b.status === 'done').length;
			const findingsHere = batches.reduce((n, b) => n + (b.findingCount || 0), 0);
			const fileCount = batches.reduce((n, b) => n + b.files.length, 0);
			const title = ruleLabel(key);
			const statusHint = doneHere === batches.length ? 'All reviewed' : `${doneHere}/${batches.length} reviewed`;
			const batchRows = batches
				.map((g, i) => {
					const part = batches.length > 1 ? `Batch ${i + 1} of ${batches.length}` : 'Batch';
					return `<li class="item coverage-batch">
						<div class="item-head">
							<span class="item-title">${escapeHtml(part)}</span>
							${groupBadge(g.status)}
							${g.findingCount ? `<span class="badge">${plural(g.findingCount, 'finding')}</span>` : ''}
						</div>
						<details class="disclosure">
							<summary>${plural(g.files.length, 'file')}</summary>
							<div class="disclosure-body">${g.files.map((f) => `<div class="item-path">${escapeHtml(f)}</div>`).join('')}</div>
						</details>
					</li>`;
				})
				.join('');
			return `<details class="disclosure coverage-rule" ${doneHere < batches.length ? 'open' : ''}>
					<summary>
						<strong>${escapeHtml(title)}</strong>
						<span class="subtle">${statusHint} · ${plural(fileCount, 'file')}${
							findingsHere ? ` · ${plural(findingsHere, 'finding')}` : ''
						}</span>
					</summary>
					<div class="disclosure-body"><ul class="list">${batchRows}</ul></div>
				</details>`;
		})
		.join('');

	const allGroupsDone = groups.every((g) => g.status === 'done');
	const verification = progress?.verification;
	const verificationItem = verification
		? `<li class="item">
				<div class="item-head">
					<span class="item-title">Verify findings</span>
					${groupBadge(verification === 'done' ? 'done' : allGroupsDone ? 'reviewing' : 'pending')}
				</div>
				<p class="subtle">Each finding is re-checked: confirmed ones can be posted, plausible ones go to the summary, rejected ones are dropped.</p>
			</li>`
		: '';
	const req = view.requirements;
	const requirementsItem = req
		? `<li class="item">
				<div class="item-head">
					<span class="item-title">Ticket criteria</span>
					${groupBadge(req.status === 'done' ? 'done' : allGroupsDone && verification !== 'pending' ? 'reviewing' : 'pending')}
				</div>
				<p class="subtle">${plural(req.criteria.length, 'criterion', 'criteria')} from ${escapeHtml(req.ticket.ref ?? req.ticket.source)}.</p>
			</li>`
		: '';
	const closingSteps =
		verificationItem || requirementsItem
			? `<section class="coverage-section">
					<h3 class="coverage-section-title">Closing steps</h3>
					<ul class="list">${verificationItem}${requirementsItem}</ul>
				</section>`
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

	coveragePanel.innerHTML = `${summary}${next}${findingsBlock}<section class="coverage-section">
			<h3 class="coverage-section-title">Batches by guide</h3>
			${ruleSections}
		</section>${closingSteps}${readFirstBlock(view)}${skipped}`;
};

/** Where to read first: changed files ranked by risk (spec-drift-depth REQ-002). Advisory: the groups keep their order. */
const RISK_TONE: Record<string, string> = { high: 'tone-danger', medium: 'tone-warning', low: '' };
const readFirstBlock = (view: PrReviewView): string => {
	const risk = view.risk;
	const top = risk?.files.filter((f) => f.score > 0).slice(0, 5) ?? [];
	if (!risk || !top.length) return '';
	const rows = top
		.map(
			(f) => `<li class="item">
				<div class="item-head">
					<span class="badge ${RISK_TONE[f.level] ?? ''}">${escapeHtml(f.level)}</span>
					<code class="item-path">${escapeHtml(f.path)}</code>
					<span class="subtle">score ${f.score}</span>
				</div>
				<p class="subtle">${escapeHtml(f.reasons.join(' · '))}</p>
			</li>`,
		)
		.join('');
	const missing = risk.unavailable.length
		? `<p class="subtle">Not available here: ${escapeHtml(risk.unavailable.join(', '))}.</p>`
		: '';
	return `<details class="disclosure" id="read-first">
			<summary>Suggested reading order · ${plural(top.length, 'risky file')}</summary>
			<div class="disclosure-body">
				<p class="subtle">Optional hint — start here if you want to skim the riskiest changes first. The agent still reviews every batch.</p>
				<ul class="list">${rows}</ul>
				<p class="subtle">${escapeHtml(risk.formula)}.</p>${missing}
			</div>
		</details>`;
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
			? `${engine.name} · ${plural(arch.configFiles.length, 'rule file')} · open tab`
			: needsRules
				? `No ${engine.rulesDir} rules — open tab to generate`
				: `${engine.name} failed · open tab`;
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

// ── Security Findings (built-in first, then repo .semgrep/security) ───────────

type RepoSecurityView = NonNullable<NonNullable<PrReviewView['architecture']>['repoSecurity']>;

const securityFindingItem = (f: {
	readonly checkId: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly severity: string;
	readonly message: string;
}): string => `
			<li class="item ${severityClass(f.severity)}">
				<div class="item-head">
					<span class="badge tone-danger">Security</span>
					<span class="badge ${severityClass(f.severity)}">${severityLabel(f.severity)}</span>
					<code class="item-title">${escapeHtml(f.checkId)}</code>
				</div>
				<div class="item-path">${escapeHtml(f.path)}:${lineRange(f.startLine, f.endLine)}</div>
				<p class="item-body">${escapeHtml(f.message)}</p>
			</li>`;

/** Prompt used when the server did not send generatePrompt (legacy architecture.json). */
const fallbackSecurityGeneratePrompt = (view: PrReviewView): string => {
	const project = view.state.repo || baseName(view.paths.repoRoot) || 'this project';
	const root = view.paths.repoRoot || '.';
	return [
		`# Generate .semgrep/security security rules for ${project}`,
		'',
		`Repo root: \`${root}\``,
		'There is no usable `.semgrep/security/` rule set in this project yet.',
		'',
		'## Goal',
		'Create a project-specific Semgrep **security** rule set under `.semgrep/security/` based on security best practices for this codebase’s area (injection, authz, unsafe sinks, secret exposure).',
		'',
		'## How',
		'1. Explore auth/session entrypoints, trust boundaries, parsers of untrusted input, and shell/SQL/template sinks.',
		'2. Prefer rules that encode this product’s area over a generic dump; cite the boundary each rule protects.',
		'3. Write YAML rules under `.semgrep/security/` without overwriting unrelated packs.',
		'4. Before writing files, list the rules you plan so the user can confirm.',
		'',
		'## Done',
		`After creating the security rules, call \`pr_review_architecture_rescan\` with pr=${view.pr} so the Security Findings tab re-runs on the PR files.`,
	].join('\n');
};

/**
 * Normalize repo security for the tab (REQ-009): legacy scans omit `repoSecurity` even when the
 * built-in message already says there is no `.semgrep/security/` — treat that as `missing`.
 */
const resolveRepoSecurity = (view: PrReviewView): RepoSecurityView | undefined => {
	const saved = view.architecture?.repoSecurity;
	if (saved) return saved;
	if (!view.architecture) return undefined;
	return {
		status: 'missing',
		findingCount: 0,
		findings: [],
		configFiles: [],
		message: 'No `.semgrep/security/` rules. Generate a security set from best practices for this codebase’s area.',
		generatePrompt: fallbackSecurityGeneratePrompt(view),
	};
};

const renderSecurity = (view: PrReviewView): void => {
	const builtin = view.architecture?.builtinSecurity;
	const repo = resolveRepoSecurity(view);
	const card = securityCard;
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');

	const findingTotal = (builtin?.findingCount ?? 0) + (repo?.status === 'scanned' ? repo.findingCount : 0);
	$('count-security').textContent = String(findingTotal);
	generateSecurityRulesBtn.hidden = !(repo?.status === 'missing' && Boolean(repo.generatePrompt));

	if (!view.architecture) {
		$('kpi-security').textContent = '—';
		$('kpi-security-hint').textContent = 'Not scanned';
		securitySummary.innerHTML = emptyState(
			'No security scan yet',
			'It runs with the architecture scan when the review starts.',
		);
		securityList.innerHTML = '';
		return;
	}

	const hasError = builtin?.status === 'error' || repo?.status === 'error';
	const hasFindings = findingTotal > 0;
	$('kpi-security').textContent = hasError && !hasFindings ? '—' : String(findingTotal);
	$('kpi-security-hint').textContent =
		repo?.status === 'missing'
			? builtin
				? 'Built-in · open tab to generate repo rules'
				: 'No repo security set — open tab to generate'
			: repo?.status === 'scanned'
				? builtin
					? `Built-in + ${plural(repo.configFiles.length, 'repo rule file')} · open tab`
					: `${plural(repo.configFiles.length, 'repo rule file')} · open tab`
				: builtin
					? 'Built-in pack · open tab'
					: 'Security scan · open tab';
	card.classList.add(hasError ? 'tone-danger' : hasFindings ? 'tone-warning' : 'tone-success');

	const blocks: string[] = [];

	// REQ-005 / REQ-008: built-in section first (always on Semgrep when scannable).
	if (builtin) {
		if (builtin.status === 'error') {
			blocks.push(`<div class="callout tone-danger">
				<p class="callout-title">Built-in security pack</p>
				<p>${inlineMarkdown(builtin.message)}</p>
			</div>`);
		} else {
			blocks.push(`<div class="callout">
				<p class="callout-title">Built-in security pack</p>
				<p class="muted">${inlineMarkdown(builtin.message)}</p>
			</div>`);
		}
	} else {
		blocks.push(`<div class="callout">
			<p class="callout-title">Built-in security pack</p>
			<p class="muted">Skipped — engine is not Semgrep, or this PR has no scannable files.</p>
		</div>`);
	}

	// REQ-006 / REQ-007 / REQ-009: repository security set next (legacy scans without repoSecurity → missing).
	if (!repo) {
		blocks.push(`<div class="callout">
			<p class="callout-title">Repository security rules</p>
			<p class="muted">Not available on this scan.</p>
		</div>`);
	} else if (repo.status === 'missing') {
		blocks.push(`<div class="callout tone-warning">
			<p class="callout-title">Repository security rules</p>
			<p>${inlineMarkdown(repo.message)} Use <strong>Ask the agent to write security rules</strong>, then <strong>Rescan</strong>.</p>
		</div>`);
	} else if (repo.status === 'error') {
		blocks.push(`<div class="callout tone-danger">
			<p class="callout-title">Repository security rules</p>
			<p>${inlineMarkdown(repo.message)}</p>
		</div>`);
	} else {
		blocks.push(`<div class="callout">
			<p class="callout-title">Repository security rules</p>
			<p class="muted">${inlineMarkdown(repo.message)}</p>
		</div>`);
	}

	securitySummary.innerHTML = blocks.join('');

	const items: string[] = [];
	if (builtin?.status === 'scanned') {
		items.push(
			...(builtin.findings.length
				? builtin.findings.map(securityFindingItem)
				: [
						`<li>${emptyState('No built-in findings', 'The built-in pack found nothing on the PR files.', 'success')}</li>`,
					]),
		);
	}
	if (repo?.status === 'scanned') {
		items.push(
			...(repo.findings.length
				? repo.findings.map(securityFindingItem)
				: [
						`<li>${emptyState('No repository security findings', 'The repo security rules found nothing on the PR files.', 'success')}</li>`,
					]),
		);
	}
	securityList.innerHTML = items.join('');
};

// ── Code coverage (Istanbul-style JS/TS) ─────────────────────────────────────

const fallbackCodeCoverageGeneratePrompt = (view: PrReviewView): string => {
	const project = view.state.repo || baseName(view.paths.repoRoot) || 'this project';
	const root = view.paths.repoRoot || '.';
	return [
		`# Add JS/TS unit tests and Istanbul-style coverage for ${project}`,
		'',
		`Repo root: \`${root}\``,
		'This project has no usable JS/TS unit-test + coverage setup yet (Jest, Vitest, c8, or nyc).',
		'',
		'## Goal',
		'Add a minimal unit-test runner and coverage reporting so PR Review can show an Istanbul-style summary.',
		'',
		'## Done',
		`After tests and coverage work, call \`pr_review_architecture_rescan\` with pr=${view.pr} so the Code coverage tab re-runs.`,
	].join('\n');
};

const renderCodeCoverage = (view: PrReviewView): void => {
	const cov = view.codeCoverage;
	const card = codeCoverageCard;
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');
	const missing = !cov || cov.status === 'missing';
	generateCodeCoverageBtn.hidden = !(missing && Boolean(cov?.generatePrompt || view.paths.repoRoot));
	// REQ-017: always show Rescan like Security Findings (including legacy reviews without codeCoverage).
	rescanCodeCoverageBtn.hidden = false;

	if (!cov) {
		$('kpi-code-coverage').textContent = '—';
		$('kpi-code-coverage-hint').textContent = 'Not scanned — open tab to generate';
		$('count-code-coverage').textContent = '—';
		card.classList.add('tone-warning');
		codeCoverageSummary.innerHTML = `<div class="callout tone-warning">
			<p class="callout-title">No code coverage yet</p>
			<p>It runs with the architecture scan when the review starts. Use <strong>Ask the agent to add tests + coverage</strong>, then <strong>Rescan</strong>.</p>
		</div>`;
		codeCoverageList.innerHTML = '';
		return;
	}

	if (cov.status === 'scanned' && cov.totals) {
		const pct = `${Math.round(cov.totals.linesPct)}%`;
		$('kpi-code-coverage').textContent = pct;
		$('count-code-coverage').textContent = pct;
		$('kpi-code-coverage-hint').textContent =
			`${cov.tool ?? 'coverage'} · ${cov.totals.linesCovered}/${cov.totals.linesTotal} lines · open tab`;
		card.classList.add(
			cov.totals.linesPct >= 80 ? 'tone-success' : cov.totals.linesPct >= 50 ? 'tone-warning' : 'tone-danger',
		);
		codeCoverageSummary.innerHTML = `<div class="callout">
			<p class="callout-title">Istanbul-style coverage (${escapeHtml(cov.tool ?? 'js')})</p>
			<p class="muted">${inlineMarkdown(cov.message)}</p>
			<p class="muted">Lines ${cov.totals.linesPct}% · Statements ${cov.totals.statementsPct}% · Functions ${cov.totals.functionsPct}% · Branches ${cov.totals.branchesPct}%</p>
			${cov.command ? `<details class="disclosure"><summary>Command</summary><pre class="block">${escapeHtml(cov.command)}</pre></details>` : ''}
		</div>`;
		codeCoverageList.innerHTML = cov.files.length
			? cov.files
					.map(
						(f) => `
			<li class="item">
				<div class="item-head">
					<span class="badge ${f.linesPct >= 80 ? 'tone-success' : f.linesPct >= 50 ? 'tone-warning' : 'tone-danger'}">${Math.round(f.linesPct)}%</span>
					<code class="item-title">${escapeHtml(f.path)}</code>
				</div>
				<div class="item-path">${f.linesCovered}/${f.linesTotal} lines covered</div>
			</li>`,
					)
					.join('')
			: `<li>${emptyState('No PR file rows', 'Overall totals are above; no matching JS/TS paths in the summary.')}</li>`;
		return;
	}

	if (cov.status === 'missing') {
		$('kpi-code-coverage').textContent = '—';
		$('count-code-coverage').textContent = '—';
		$('kpi-code-coverage-hint').textContent = 'No test+coverage setup — open tab to generate';
		card.classList.add('tone-warning');
		codeCoverageSummary.innerHTML = `<div class="callout tone-warning">
			<p class="callout-title">No JS/TS coverage setup</p>
			<p>${inlineMarkdown(cov.message)} Use <strong>Ask the agent to add tests + coverage</strong>, then <strong>Rescan</strong>.</p>
		</div>`;
		codeCoverageList.innerHTML = '';
		return;
	}

	$('kpi-code-coverage').textContent = '—';
	$('count-code-coverage').textContent = '—';
	$('kpi-code-coverage-hint').textContent = `${cov.tool ?? 'coverage'} failed · open tab`;
	card.classList.add('tone-danger');
	codeCoverageSummary.innerHTML = `<div class="callout tone-danger">
		<p class="callout-title">${inlineMarkdown(cov.message)}</p>
		${cov.stderrTail ? `<details class="disclosure"><summary>Error output</summary><pre class="block">${escapeHtml(cov.stderrTail)}</pre></details>` : ''}
		${cov.command ? `<details class="disclosure"><summary>Command</summary><pre class="block">${escapeHtml(cov.command)}</pre></details>` : ''}
	</div>`;
	codeCoverageList.innerHTML = '';
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
const requirementsSummary = $('requirements-summary');
const saveRequirementsBtn = $<HTMLButtonElement>('save-requirements');
const attachTicketBtn = $<HTMLButtonElement>('attach-ticket');
const pinUnmetBtn = $<HTMLButtonElement>('pin-unmet-inline');
const openTicketBtn = $<HTMLButtonElement>('open-ticket');
const requirementsTicketHead = $('requirements-ticket-head');
const requirementsSaveBar = $('requirements-save-bar');
const findingsList = $('findings-list');
const findingsAddSelectedBtn = $<HTMLButtonElement>('findings-add-selected');
const findingsAddHighBtn = $<HTMLButtonElement>('findings-add-high');
const findingsSkipBtn = $<HTMLButtonElement>('findings-skip');
const findingsUndoBtn = $<HTMLButtonElement>('findings-undo');

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

const inboxItemsFor = (view: PrReviewView) =>
	collectInboxItems({
		architectureFindings: view.architecture?.status === 'scanned' ? view.architecture.findings : [],
		builtinSecurityFindings:
			view.architecture?.builtinSecurity?.status === 'scanned' ? view.architecture.builtinSecurity.findings : [],
		repoSecurityFindings:
			view.architecture?.repoSecurity?.status === 'scanned' ? view.architecture.repoSecurity.findings : [],
		requirements: view.requirements,
	});

const selectedFindingKeys = (): string[] =>
	[...findingsList.querySelectorAll<HTMLInputElement>('input.finding-check:checked')].map((el) => el.value);

const refreshFindingsActions = (): void => {
	const count = selectedFindingKeys().length;
	findingsAddSelectedBtn.disabled = busy || count === 0;
	findingsAddSelectedBtn.textContent = count ? `Add selected (${count})` : 'Add selected';
	findingsUndoBtn.hidden = !commentsBeforeLastImport;
};

/** Map FindingSeverity → analyzer-style label for shared badge CSS. */
const findingSevUi = (severity: string): string =>
	severity === 'critical' || severity === 'high' ? 'ERROR' : severity === 'medium' ? 'WARNING' : 'INFO';

const findingSevLabel = (severity: string): string =>
	({ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' })[severity] ?? severity;

const countSummaryNotes = (text: string): number => {
	const block = text.match(/\*\*Findings \(minor\)\*\*\n([\s\S]*?)(?=\n\*\*|\n## |$)/);
	if (!block?.[1]) return 0;
	return block[1].split('\n').filter((line) => line.startsWith('- ')).length;
};

const renderFindings = (view: PrReviewView): void => {
	const items = inboxItemsFor(view);
	const filtered = findingsFilter === 'all' ? items : items.filter((i) => i.source === findingsFilter);
	$('count-findings').textContent = String(items.length);
	findingsAddHighBtn.disabled = busy || !items.some((i) => isHighSeverity(i.severity));

	if (!filtered.length) {
		findingsList.innerHTML = `<li>${emptyState(
			'No findings for this filter',
			'Architecture/Security scans and unmet ticket evidence with path:line show up here.',
		)}</li>`;
		refreshFindingsActions();
		return;
	}

	const sourceBadge = (source: InboxSource): string =>
		source === 'architecture'
			? '<span class="badge">Architecture</span>'
			: source === 'security'
				? '<span class="badge tone-danger">Security</span>'
				: '<span class="badge tone-warning">Ticket</span>';

	findingsList.innerHTML = `
		<li><label class="choice"><input type="checkbox" id="findings-select-all" /> Select all visible</label></li>
		${filtered
			.map((f) => {
				const sev = findingSevUi(f.severity);
				return `
		<li class="item ${severityClass(sev)}">
			<label class="item-head" style="cursor:pointer">
				<input type="checkbox" class="finding-check" value="${escapeHtml(f.key)}" ${f.defaultChecked ? 'checked' : ''} aria-label="Include ${escapeHtml(f.title)}" />
				<span class="badge ${severityClass(sev)}">${escapeHtml(findingSevLabel(f.severity))}</span>
				${sourceBadge(f.source)}
				<code class="item-title">${escapeHtml(f.title)}</code>
			</label>
			<div class="item-path">${escapeHtml(f.path)}:${lineRange(f.startLine, f.endLine)}</div>
			<p class="item-body">${escapeHtml(f.message)}</p>
		</li>`;
			})
			.join('')}`;
	refreshFindingsActions();
};

const importFindingKeys = async (keys: string[]): Promise<boolean> => {
	if (!keys.length || !current) return false;
	commentsBeforeLastImport = draftMarkdown() || current.commentsMarkdown || '';
	const ok = await callTool('pr_review_import_findings', { ...prArgs(), keys }, 'Could not add findings');
	if (ok) {
		refreshFindingsActions();
		selectTab('comments');
		setStatus(`Added ${keys.length} finding(s) to Comments.`, 'success');
	} else {
		commentsBeforeLastImport = null;
		refreshFindingsActions();
	}
	return ok;
};

const undoLastFindingsImport = async (): Promise<boolean> => {
	if (!commentsBeforeLastImport || !current) return false;
	const previous = commentsBeforeLastImport;
	const ok = await callTool(
		'pr_review_ui_save',
		{ ...prArgs(), commentsMarkdown: previous, reportMarkdown: current.reportMarkdown },
		'Could not undo the last add',
	);
	if (ok) {
		commentsBeforeLastImport = null;
		refreshFindingsActions();
		selectTab('comments');
		setStatus('Undid the last Findings add.', 'success');
	}
	return ok;
};

const attachTicketPrompt = (view: PrReviewView): string => {
	const refs = view.ticketRefs?.map((r) => r.ref).join(', ');
	const hint = refs
		? `Possible ticket ref(s) from the PR: ${refs}. Confirm with the human if needed.`
		: 'Ask the human for the Jira/Linear key, GitHub issue (#N), or paste the ticket text.';
	return [
		`# Attach a ticket to PR #${view.pr}`,
		'',
		hint,
		'',
		'## Goal',
		'Attach the ticket this PR implements so the Requirements tab can verify acceptance criteria.',
		'',
		'## How',
		'1. Resolve the ticket (Jira/Linear tools, `gh` for GitHub issues, or pasted text).',
		`2. Call \`pr_review_set_ticket\` with pr=${view.pr} and the ticket payload (source + text/ref/criteria as the tool expects).`,
		'3. Continue the review; criteria become the last coverage step.',
	].join('\n');
};

const renderRequirements = (view: PrReviewView): void => {
	const req: Requirements | undefined = view.requirements;
	const card = requirementsCard;
	card.classList.remove('tone-danger', 'tone-warning', 'tone-success');
	// REQ-019: always visible (never hide tab/KPI).
	$('tab-requirements').hidden = false;
	card.hidden = false;

	if (!req) {
		$('kpi-req').textContent = '—';
		$('count-requirements').textContent = '—';
		$('kpi-req-hint').textContent = 'No ticket — open tab to attach';
		card.classList.add('tone-warning');
		attachTicketBtn.hidden = false;
		pinUnmetBtn.hidden = true;
		openTicketBtn.hidden = true;
		requirementsTicketHead.hidden = true;
		requirementsSaveBar.hidden = true;
		const refs = view.ticketRefs?.length
			? `<p class="muted">Possible refs: ${view.ticketRefs.map((r) => `<code>${escapeHtml(r.ref)}</code>`).join(', ')}.</p>`
			: '';
		requirementsSummary.innerHTML = `<div class="callout tone-warning">
			<p class="callout-title">No ticket attached</p>
			<p>Pass a Jira/Linear key, GitHub issue, or pasted text when starting the review (or use <strong>Ask the agent to attach a ticket</strong>).</p>
			${refs}
		</div>`;
		$('requirements-alert').innerHTML = '';
		requirementsList.innerHTML = '';
		$('requirements-extra').innerHTML = '';
		refreshRequirementsDirty();
		return;
	}

	attachTicketBtn.hidden = true;
	pinUnmetBtn.hidden = !(req.status === 'done' && pinableUnmetCriteria(req.criteria).length > 0);
	requirementsTicketHead.hidden = false;
	requirementsSaveBar.hidden = false;
	requirementsSummary.innerHTML = '';

	const met = req.criteria.filter((c) => c.status === 'met').length;
	const unmet = req.criteria.filter((c) => c.status === 'unmet').length;
	const verified = req.status === 'done';
	$('count-requirements').textContent = verified ? `${met}/${req.criteria.length}` : String(req.criteria.length);
	$('kpi-req').textContent = verified ? `${met}/${req.criteria.length}` : '—';
	$('kpi-req-hint').textContent = verified
		? `${unmet ? `${unmet} not met` : 'met'} · open tab`
		: 'Verified after the groups · open tab';
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
	const revDate = view.state.current.date;
	const revDateLabel = /^\d{4}-\d{2}-\d{2}$/.test(revDate) ? revDate : revDate ? formatWhen(revDate) : '';
	$('review-meta').innerHTML = [
		`<span class="mono">#<span id="kpi-pr">${view.pr}</span></span>`,
		`<span class="rev-chip" title="Review revision"><span id="kpi-rev">Rev ${view.state.current.revision}</span>${
			revDateLabel ? `<span class="dot"></span><span id="kpi-rev-hint">${escapeHtml(revDateLabel)}</span>` : ''
		}</span>`,
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
	$('header-actions').hidden = false;
	$('kpis').hidden = false;
	const progress = view.progress;
	const done = progress?.doneCount ?? 0;
	const total = progress?.totalCount ?? view.units?.groups.length ?? 0;
	$('kpi-coverage').textContent = total ? `${done}/${total}` : '—';
	const pct = total ? Math.round((100 * done) / total) : 0;
	const meter = $('coverage-meter');
	meter.setAttribute('aria-valuemax', String(total));
	meter.setAttribute('aria-valuenow', String(done));
	meter.setAttribute('aria-valuetext', `${done} of ${total} review batches done`);
	meter.className = `meter${pct < 100 ? ' tone-warning' : ''}`;
	$('coverage-bar').style.width = `${pct}%`;
	const coverageHint = $('kpi-coverage-hint');
	if (coverageHint) {
		coverageHint.textContent = total
			? pct === 100
				? 'All batches reviewed'
				: `${total - done} batch${total - done === 1 ? '' : 'es'} left`
			: '';
	}

	const comments = view.parsed?.comments ?? [];
	$('kpi-inlines').textContent = String(comments.length);
	const edited = view.check?.changes.filter((c) => c.kind !== 'unchanged').length ?? 0;
	const inlinesHint = edited ? `${plural(edited, 'edit')} by you` : view.parsed ? 'As drafted' : 'No draft yet';
	$('kpi-inlines-hint').textContent = `${inlinesHint} · open tab`;
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
	generateSecurityRulesBtn.disabled = disabled;
	generateCodeCoverageBtn.disabled = disabled;
	attachTicketBtn.disabled = disabled;
	rescanSecurityBtn.disabled = disabled;
	rescanCodeCoverageBtn.disabled = disabled;
	refreshDirty();
	updateImportButton();
	refreshRequirementsDirty();
	refreshFindingsActions();
	if (current) findingsAddHighBtn.disabled = busy || !inboxItemsFor(current).some((i) => isHighSeverity(i.severity));
	findingsSkipBtn.disabled = busy;
	pinUnmetBtn.disabled = busy;
};

const defaultTab = (view: PrReviewView): Tab => {
	if (view.phase === 'needsConfirmation') return 'comments';
	const groupsDone = view.progress?.groups.every((g) => g.status === 'done');
	if (view.requirements?.status === 'pending' && groupsDone) return 'requirements';
	if (view.message.startsWith('Imported')) return 'comments';
	return activeTab ?? 'comments';
};

/** Prefer the coverage drill-down while groups are still open; otherwise pick a tab. */
const showDefaultSection = (view: PrReviewView): void => {
	if (view.phase === 'needsConfirmation') {
		selectTab('comments');
		return;
	}
	if (view.phase === 'prepared' || view.phase === 'reviewing' || coverageIncomplete()) {
		setCoverageOpen(true);
		return;
	}
	selectTab(defaultTab(view));
};

/** `announce`: show the server's message (only for actions the human took in this view). */
const render = (incoming: PrReviewView, announce = false): void => {
	// Some results omit the ticket; keep the one already shown for this PR.
	const view =
		incoming.requirements || current?.pr !== incoming.pr || !current.requirements
			? incoming
			: { ...incoming, requirements: current.requirements };
	const keepCoverage = coverageOpen && current?.pr === incoming.pr;
	current = view;
	loading.hidden = true;
	emptyEl.hidden = true;
	tabsEl.hidden = keepCoverage;
	renderHeader(view);
	renderKpis(view);
	renderAlerts(view);
	renderComments(view);
	renderFindings(view);
	renderRequirements(view);
	renderCoverage(view);
	renderArchitecture(view);
	renderSecurity(view);
	renderCodeCoverage(view);
	renderReport(view);
	renderActions(view);
	if (keepCoverage) setCoverageOpen(true);
	else showDefaultSection(view);
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
	const draft = collectDraft();
	const inlineCount = draft?.comments.length ?? 0;
	const summaryNotes = countSummaryNotes(draft?.summary ?? summary.value);
	const event = selectedEvent();
	$('confirm-title').textContent =
		current.phase === 'needsConfirmation' ? 'Submit with your edits?' : `Submit “${EVENT_LABELS[event]}” to GitHub?`;
	$('confirm-body').textContent = [
		`${inlineCount} inline · ${summaryNotes} in summary · ${EVENT_LABELS[event]}`,
		`This posts on PR #${current.pr} as you. The author and reviewers are notified.`,
		commentsBeforeLastImport ? 'Undo last Findings add is available on the Findings tab.' : '',
	]
		.filter(Boolean)
		.join(' ');
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

generateSecurityRulesBtn.addEventListener('click', () => {
	if (!current) return;
	const prompt = resolveRepoSecurity(current)?.generatePrompt;
	if (!prompt) {
		setStatus('No security-rule prompt is available for this repo.', 'danger');
		return;
	}
	run(generateSecurityRulesBtn, 'Sending…', () =>
		askAgent(prompt, 'Asked the agent to write security rules. Rescan when it is done.'),
	);
});

rescanSecurityBtn.addEventListener('click', () =>
	run(rescanSecurityBtn, 'Scanning…', () => callTool('pr_review_architecture_rescan', prArgs(), 'Rescan failed')),
);

rescanArchitectureBtn.addEventListener('click', () =>
	run(rescanArchitectureBtn, 'Scanning…', () => callTool('pr_review_architecture_rescan', prArgs(), 'Rescan failed')),
);

coverageCard.addEventListener('click', () => {
	if (coverageOpen) {
		setCoverageOpen(false);
		selectTab(activeTab ?? 'comments');
		return;
	}
	setCoverageOpen(true);
});

coverageBackBtn.addEventListener('click', () => {
	setCoverageOpen(false);
	selectTab(activeTab ?? 'comments');
});

inlinesCard.addEventListener('click', () => selectTab('comments'));
requirementsCard.addEventListener('click', () => selectTab('requirements'));
architectureCard.addEventListener('click', () => selectTab('architecture'));
securityCard.addEventListener('click', () => selectTab('security'));
codeCoverageCard.addEventListener('click', () => selectTab('code-coverage'));

attachTicketBtn.addEventListener('click', () => {
	const view = current;
	if (!view) {
		setStatus('No review loaded yet.', 'danger');
		return;
	}
	run(attachTicketBtn, 'Sending…', () =>
		askAgent(attachTicketPrompt(view), 'Asked the agent to attach a ticket. Reload when it is done.'),
	);
});

generateCodeCoverageBtn.addEventListener('click', () => {
	const prompt = current?.codeCoverage?.generatePrompt ?? (current ? fallbackCodeCoverageGeneratePrompt(current) : '');
	if (!prompt) {
		setStatus('No coverage-setup prompt is available for this repo.', 'danger');
		return;
	}
	run(generateCodeCoverageBtn, 'Sending…', () =>
		askAgent(prompt, 'Asked the agent to add tests + coverage. Rescan when it is done.'),
	);
});

rescanCodeCoverageBtn.addEventListener('click', () =>
	run(rescanCodeCoverageBtn, 'Scanning…', () => callTool('pr_review_architecture_rescan', prArgs(), 'Rescan failed')),
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

createSegmented($('findings-filter'), (value) => {
	findingsFilter = value as FindingsFilter;
	if (current) renderFindings(current);
});

findingsList.addEventListener('change', (event) => {
	const target = event.target as HTMLInputElement;
	if (target.id === 'findings-select-all') {
		for (const box of findingsList.querySelectorAll<HTMLInputElement>('input.finding-check'))
			box.checked = target.checked;
	} else if (target.classList.contains('finding-check')) {
		const all = document.getElementById('findings-select-all') as HTMLInputElement | null;
		const boxes = [...findingsList.querySelectorAll<HTMLInputElement>('input.finding-check')];
		if (all) {
			all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
			all.indeterminate = !all.checked && boxes.some((b) => b.checked);
		}
	}
	refreshFindingsActions();
});

findingsAddSelectedBtn.addEventListener('click', () =>
	run(findingsAddSelectedBtn, 'Adding…', () => importFindingKeys(selectedFindingKeys())),
);

findingsAddHighBtn.addEventListener('click', () =>
	run(findingsAddHighBtn, 'Adding…', async () => {
		if (!current) return false;
		const keys = inboxItemsFor(current)
			.filter((i) => isHighSeverity(i.severity))
			.map((i) => i.key);
		return importFindingKeys(keys);
	}),
);

findingsSkipBtn.addEventListener('click', () => {
	for (const box of findingsList.querySelectorAll<HTMLInputElement>('input.finding-check, #findings-select-all')) {
		box.checked = false;
		box.indeterminate = false;
	}
	refreshFindingsActions();
	setStatus('Selection cleared.', 'success');
});

findingsUndoBtn.addEventListener('click', () => run(findingsUndoBtn, 'Undoing…', () => undoLastFindingsImport()));

pinUnmetBtn.addEventListener('click', () =>
	run(pinUnmetBtn, 'Pinning…', async () => {
		if (!current?.requirements) return false;
		const keys = pinableUnmetCriteria(current.requirements.criteria).map((c) => `ticket:${c.id}`);
		return importFindingKeys(keys);
	}),
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
