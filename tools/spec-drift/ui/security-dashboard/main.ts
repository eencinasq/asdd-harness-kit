import { App } from '@modelcontextprotocol/ext-apps';

import '../shared/styles.css';
import { $, connectApp, createStatus, escapeHtml, toolErrorText, withBusyButton } from '../shared/ui.ts';
import { renderStatus, type StatusView, statusOf } from './model.ts';

const loading = $('loading');
const content = $('content');
const meta = $('meta');
const refreshBtn = $<HTMLButtonElement>('refresh');
const setStatus = createStatus($('status'));

const app = new App({ name: 'Spec drift security', version: '1.0.0' });
let current: StatusView | null = null;

const show = (view: StatusView | null, error?: string): void => {
	loading.hidden = true;
	$('app').setAttribute('aria-busy', 'false');
	if (error) {
		content.innerHTML = `<div class="callout tone-danger"><p class="callout-title">The security audit could not be shown</p><p>${escapeHtml(error)}</p></div>`;
		return;
	}
	if (!view) return;
	current = view;
	meta.textContent = `${view.run.repo} · ${view.run.id} · started ${new Date(view.run.startedAt).toLocaleString()}`;
	content.innerHTML = renderStatus(view);
	refreshBtn.hidden = false;
};

refreshBtn.addEventListener('click', () =>
	withBusyButton(refreshBtn, 'Refreshing…', async () => {
		const result = await app.callServerTool({
			name: 'security_audit_status',
			arguments: current ? { runId: current.run.id } : {},
		});
		if (result.isError) show(null, toolErrorText(result) || 'security_audit_status failed');
		else show(statusOf(result));
	}),
);

app.ontoolinput = () => setStatus('Running…', 'busy');

app.ontoolresult = (result) => {
	setStatus('');
	if (result.isError) show(null, toolErrorText(result) || 'The tool failed.');
	else show(statusOf(result), statusOf(result) ? undefined : 'Not a security audit result.');
};

void connectApp(app);
