import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publishQuestion, ticketFromAnswer, ticketQuestion } from './ticket-question.ts';

test('spec-drift-depth REQ-004: the ticket answer becomes a ticket input; blank means no ticket', () => {
	assert.equal(ticketFromAnswer({}), undefined);
	assert.equal(ticketFromAnswer({ ticket: '  ', text: '' }), undefined);
	assert.deepEqual(ticketFromAnswer({ ticket: '#7' }), { source: 'github', ref: '#7' });
	assert.deepEqual(ticketFromAnswer({ ticket: 'acme/demo#7' }), { source: 'github', ref: 'acme/demo#7' });
	assert.deepEqual(ticketFromAnswer({ ticket: 'https://github.com/acme/demo/issues/7' }), {
		source: 'github',
		ref: 'https://github.com/acme/demo/issues/7',
	});
	assert.deepEqual(ticketFromAnswer({ ticket: 'MLC-123' }), { source: 'jira', ref: 'MLC-123' });
	assert.deepEqual(ticketFromAnswer({ ticket: 'MLC-123', text: '- [ ] does X' }), {
		source: 'text',
		ref: 'MLC-123',
		text: '- [ ] does X',
	});
	assert.deepEqual(ticketFromAnswer({ text: '- [ ] does X' }), { source: 'text', text: '- [ ] does X' });
	assert.equal(ticketFromAnswer({ ticket: 42 }), undefined, 'non-strings are ignored');
});

test('spec-drift-depth REQ-004: the questions carry the PR, a suggested ticket, and the comment count', () => {
	const q = ticketQuestion(42, '#7');
	assert.match(q.message, /PR #42/);
	assert.equal((q.schema.properties['ticket'] as { default?: string }).default, '#7');
	assert.equal('default' in (ticketQuestion(42, undefined).schema.properties['ticket'] as object), false);
	const p = publishQuestion(42, 1);
	assert.match(p.message, /PR #42 with 1 inline comment\?/);
	assert.deepEqual(p.schema.required, ['confirm']);
	assert.match(publishQuestion(42, 3).message, /3 inline comments/);
});
