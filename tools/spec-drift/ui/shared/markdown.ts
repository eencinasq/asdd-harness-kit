/**
 * A small, safe Markdown renderer for agent-written reports (headings, paragraphs, lists, task
 * lists, quotes, code blocks, tables, rules; bold, italic, inline code, links).
 *
 * Reports are built from untrusted PR content, so this never passes HTML through: every piece of
 * text is escaped first and only a fixed set of tags is produced. Links are limited to http(s) and
 * carry `data-href`, so the host opens them (sandboxed views cannot navigate).
 */

const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

/** Inline formatting on one line of text. Code spans are cut out first so their content stays literal. */
export const renderInline = (text: string): string => {
	const codes: string[] = [];
	const withoutCode = text.replace(/`([^`]+)`/g, (_m, code: string) => {
		codes.push(`<code>${escapeHtml(code)}</code>`);
		return `\uE000${codes.length - 1}\uE000`;
	});
	let html = escapeHtml(withoutCode)
		// [label](https://…) — only http(s) targets.
		.replace(
			/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
			(_m, label: string, url: string) => `<a href="${url}" data-href="${url}" rel="noreferrer">${label}</a>`,
		)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/__([^_]+)__/g, '<strong>$1</strong>')
		.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
		.replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
		.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	// Bare URLs that are not already inside a link.
	html = html.replace(
		/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
		(_m, lead: string, url: string) => `${lead}<a href="${url}" data-href="${url}" rel="noreferrer">${url}</a>`,
	);
	return html.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codes[Number(i)] ?? '');
};

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row: string): string[] =>
	row
		.trim()
		.replace(/^\||\|$/g, '')
		.split(/(?<!\\)\|/)
		.map((c) => c.trim().replaceAll('\\|', '|'));

/** One cell: inline Markdown, plus the `<br>` line breaks tables use. */
const cellHtml = (cell: string): string =>
	cell
		.split(/<br\s*\/?>/i)
		.map(renderInline)
		.join('<br>');

const renderList = (lines: readonly string[]): string => {
	const first = LIST_ITEM.exec(lines[0] ?? '');
	const ordered = /^\d/.test(first?.[2] ?? '');
	const baseIndent = first?.[1]?.length ?? 0;
	const items: { text: string; children: string[] }[] = [];
	for (const line of lines) {
		const match = LIST_ITEM.exec(line);
		if (match && (match[1]?.length ?? 0) <= baseIndent + 1) {
			items.push({ text: match[3] ?? '', children: [] });
		} else if (match) {
			items.at(-1)?.children.push(line);
		} else if (items.length) {
			const last = items.at(-1);
			if (last) last.text += ` ${line.trim()}`;
		}
	}
	const body = items
		.map(({ text, children }) => {
			const task = TASK.exec(text);
			const content = task
				? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'} aria-hidden="true"> ${renderInline(task[2] ?? '')}`
				: renderInline(text);
			return `<li${task ? ' class="task"' : ''}>${content}${children.length ? renderList(children) : ''}</li>`;
		})
		.join('');
	return ordered ? `<ol>${body}</ol>` : `<ul>${body}</ul>`;
};

/** Markdown → HTML (escaped, fixed tag set). */
export const renderMarkdown = (markdown: string): string => {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';

		const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
		if (fence) {
			const code: string[] = [];
			i += 1;
			while (i < lines.length && !(lines[i] ?? '').trim().startsWith(fence[1] ?? '```')) code.push(lines[i++] ?? '');
			i += 1;
			out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
			continue;
		}
		if (!line.trim()) {
			i += 1;
			continue;
		}
		const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
		if (heading) {
			const level = Math.min(6, (heading[1]?.length ?? 1) + 1); // the panel already has a page heading
			out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
			i += 1;
			continue;
		}
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
			out.push('<hr>');
			i += 1;
			continue;
		}
		if (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] ?? '')) {
			const head = cells(line);
			const rows: string[][] = [];
			i += 2;
			while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim())
				rows.push(cells(lines[i++] ?? ''));
			out.push(
				`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${cellHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
					.map((r) => `<tr>${head.map((_h, c) => `<td>${cellHtml(r[c] ?? '')}</td>`).join('')}</tr>`)
					.join('')}</tbody></table></div>`,
			);
			continue;
		}
		if (/^\s*>/.test(line)) {
			const quote: string[] = [];
			while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) quote.push((lines[i++] ?? '').replace(/^\s*>\s?/, ''));
			out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
			continue;
		}
		if (LIST_ITEM.test(line)) {
			const list: string[] = [];
			while (i < lines.length && (LIST_ITEM.test(lines[i] ?? '') || /^\s{2,}\S/.test(lines[i] ?? '')))
				list.push(lines[i++] ?? '');
			out.push(renderList(list));
			continue;
		}
		const paragraph: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? '').trim() &&
			!/^(#{1,6}\s|\s*```|\s*~~~|\s*>)/.test(lines[i] ?? '') &&
			!LIST_ITEM.test(lines[i] ?? '') &&
			!((lines[i] ?? '').includes('|') && TABLE_DIVIDER.test(lines[i + 1] ?? ''))
		) {
			paragraph.push((lines[i++] ?? '').trim());
		}
		out.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
	}
	return out.join('\n');
};
