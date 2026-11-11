/**
 * Small, framework-free helpers shared by the dashboards: host theming, accessible tabs and
 * filters, status messages, busy buttons and safe HTML.
 */
import {
	type App,
	applyDocumentTheme,
	applyHostFonts,
	applyHostStyleVariables,
	type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
	const node = document.getElementById(id);
	if (!node) throw new Error(`missing #${id}`);
	return node as T;
};

export const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

/** Escape, then render `code spans` from server messages as <code>. */
export const inlineMarkdown = (value: string): string => escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');

export const plural = (count: number, word: string, many = `${word}s`): string =>
	`${count} ${count === 1 ? word : many}`;

/** Follow the host's theme, design tokens, fonts and safe-area insets so the view looks native. */
const applyHostContext = (context: Partial<McpUiHostContext> | undefined): void => {
	if (!context) return;
	if (context.theme) applyDocumentTheme(context.theme);
	if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
	if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
	if (context.safeAreaInsets) {
		const { top, right, bottom, left } = context.safeAreaInsets;
		document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
	}
};

/** Connect after the handlers are set, then apply the host context (and keep following it). */
export const connectApp = async (app: App): Promise<void> => {
	app.onhostcontextchanged = (context) => applyHostContext(context);
	await app.connect();
	applyHostContext(app.getHostContext());
};

/** Text of a failed tool result (MCP errors come back as content, not exceptions). */
export const toolErrorText = (result: { content?: readonly unknown[] }): string =>
	(result.content ?? [])
		.map((c) => (c && typeof c === 'object' && 'text' in c && typeof c.text === 'string' ? c.text : ''))
		.join(' ')
		.trim();

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type Tone = 'neutral' | 'success' | 'danger' | 'busy';

/** A polite live region: screen readers announce every update. */
export const createStatus = (node: HTMLElement) => {
	node.setAttribute('role', 'status');
	node.setAttribute('aria-live', 'polite');
	return (message: string, tone: Tone = 'neutral'): void => {
		node.className = `status${tone === 'success' ? ' tone-success' : tone === 'danger' ? ' tone-danger' : ''}`;
		node.innerHTML = `${tone === 'busy' ? '<span class="spinner" aria-hidden="true"></span>' : ''}<span>${escapeHtml(message)}</span>`;
	};
};

/** Show a spinner and block the button while `task` runs; restores the label afterwards. */
export const withBusyButton = async <T>(button: HTMLButtonElement, busyLabel: string, task: () => Promise<T>) => {
	const label = button.innerHTML;
	button.disabled = true;
	button.setAttribute('aria-busy', 'true');
	button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
	try {
		return await task();
	} finally {
		button.innerHTML = label;
		button.removeAttribute('aria-busy');
		button.disabled = false;
	}
};

/**
 * WAI-ARIA tabs: click or Arrow/Home/End to move, roving tabindex, panels linked by
 * `aria-controls`. Returns `select(name)`.
 */
export const createTabs = <T extends string>(tablist: HTMLElement, onChange?: (name: T) => void) => {
	const tabs = () => [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter((t) => !t.hidden);
	const select = (name: T, focus = false): void => {
		for (const tab of tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
			const selected = tab.dataset['tab'] === name;
			tab.setAttribute('aria-selected', String(selected));
			tab.tabIndex = selected ? 0 : -1;
			const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
			if (panel) panel.hidden = !selected;
			if (selected && focus) tab.focus();
		}
		onChange?.(name);
	};
	tablist.addEventListener('click', (event) => {
		const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
		if (tab?.dataset['tab']) select(tab.dataset['tab'] as T);
	});
	tablist.addEventListener('keydown', (event) => {
		const list = tabs();
		const index = list.indexOf(document.activeElement as HTMLButtonElement);
		if (index < 0) return;
		const next =
			event.key === 'ArrowRight'
				? list[(index + 1) % list.length]
				: event.key === 'ArrowLeft'
					? list[(index - 1 + list.length) % list.length]
					: event.key === 'Home'
						? list[0]
						: event.key === 'End'
							? list.at(-1)
							: undefined;
		if (!next?.dataset['tab']) return;
		event.preventDefault();
		select(next.dataset['tab'] as T, true);
	});
	return select;
};

/** A segmented filter (buttons with `data-value`, state in `aria-pressed`). */
export const createSegmented = (group: HTMLElement, onChange: (value: string) => void) => {
	const set = (value: string): void => {
		for (const button of group.querySelectorAll<HTMLButtonElement>('button[data-value]')) {
			button.setAttribute('aria-pressed', String(button.dataset['value'] === value));
		}
	};
	group.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-value]');
		if (!button?.dataset['value']) return;
		set(button.dataset['value']);
		onChange(button.dataset['value']);
	});
	return set;
};

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", or a date for anything older than a day. */
export const formatWhen = (iso: string): string => {
	const date = new Date(iso);
	const seconds = Math.round((date.getTime() - Date.now()) / 1000);
	if (Number.isNaN(seconds)) return iso;
	if (Math.abs(seconds) < 45) return 'just now';
	if (Math.abs(seconds) < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
	if (Math.abs(seconds) < 86_400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
	return date.toLocaleString();
};

export const severityClass = (severity: string): string => `sev-${severity.toLowerCase()}`;

export const severityLabel = (severity: string): string =>
	({ ERROR: 'Error', WARNING: 'Warning', INFO: 'Info' })[severity.toUpperCase()] ?? severity;

export const emptyState = (title: string, detail: string, tone: 'neutral' | 'success' = 'neutral'): string =>
	`<div class="empty${tone === 'success' ? ' tone-success' : ''}">
		<span class="empty-icon" aria-hidden="true">${tone === 'success' ? '✓' : '○'}</span>
		<p class="empty-title">${escapeHtml(title)}</p>
		<p class="subtle">${escapeHtml(detail)}</p>
	</div>`;

/** Last path segment: `/a/b/repo` → `repo`. */
export const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
