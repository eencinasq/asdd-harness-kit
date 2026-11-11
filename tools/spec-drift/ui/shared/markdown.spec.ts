import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { renderInline, renderMarkdown } from './markdown.ts';

const REPORT = `# Revisión PR #2108

- **Repo:** acme/api · **Head:** \`86fe70da\`
- **URL:** https://github.com/acme/api/pull/2108

## Veredicto
**Request changes** — gap en \`EventsService.complete\`.

### Medium
- **[apps/x.ts:199]** (bug) no mirrorea cancel.
  sigue aquí

### Minor
- —

| Criterion | Status | Evidence |
| --- | --- | --- |
| **AC-1** pipe \\| inside | ✅ met | \`a.ts:4\`<br>\`b.ts:2\` |

\`\`\`ts
const x = <T>(a: T) => a;
\`\`\`

- [x] tests
- [ ] docs
`;

describe('renderMarkdown', () => {
	const html = renderMarkdown(REPORT);

	test('headings (shifted one level), lists, bold and code', () => {
		assert.match(html, /<h2>Revisión PR #2108<\/h2>/);
		assert.match(html, /<h3>Veredicto<\/h3>/);
		assert.match(html, /<li><strong>Repo:<\/strong> acme\/api · <strong>Head:<\/strong> <code>86fe70da<\/code><\/li>/);
		assert.match(html, /no mirrorea cancel\. sigue aquí<\/li>/, 'continuation lines join their item');
	});

	test('links go through the host (data-href), bare URLs too', () => {
		assert.match(
			html,
			/<a href="https:\/\/github\.com\/acme\/api\/pull\/2108" data-href="https:\/\/github\.com\/acme\/api\/pull\/2108"/,
		);
	});

	test('tables keep escaped pipes and <br> line breaks', () => {
		assert.match(html, /<th scope="col">Criterion<\/th>/);
		assert.match(html, /<td><strong>AC-1<\/strong> pipe \| inside<\/td>/);
		assert.match(html, /<code>a\.ts:4<\/code><br><code>b\.ts:2<\/code>/);
	});

	test('code blocks stay literal; task lists render checkboxes', () => {
		assert.match(html, /<pre><code>const x = &lt;T&gt;\(a: T\) =&gt; a;<\/code><\/pre>/);
		assert.match(html, /<li class="task"><input type="checkbox" disabled checked aria-hidden="true"> tests<\/li>/);
		assert.match(html, /<input type="checkbox" disabled aria-hidden="true"> docs/);
	});
});

describe('safety (reports come from untrusted PR content)', () => {
	test('raw HTML is escaped, never rendered', () => {
		const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n- <b>x</b>');
		assert.doesNotMatch(html, /<img|<script|<b>/);
		assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	});

	test('only http(s) links become links', () => {
		assert.doesNotMatch(renderInline('[x](javascript:alert(1))'), /<a /);
		assert.doesNotMatch(renderInline('[x](data:text/html,hi)'), /<a /);
		assert.doesNotMatch(renderInline('[x](https://a.b/"onmouseover="alert(1))'), /onmouseover="/);
	});

	test('code spans are literal (no formatting or links inside)', () => {
		assert.equal(renderInline('`**a** https://x.y`'), '<code>**a** https://x.y</code>');
	});
});
