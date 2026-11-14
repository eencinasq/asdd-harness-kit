import type { ElicitRequestFormParams } from '@modelcontextprotocol/server';

import type { TicketInput } from '../pr-review.schemas.ts';

/**
 * The ticket question of `pr_review_start` (spec-drift-depth REQ-004): a form with the ticket reference and, for Jira or
 * Linear (the server cannot read them), its text. Pure.
 */

export const TICKET_QUESTION = 'ticket';
export const PUBLISH_QUESTION = 'confirm_publish';

export type TicketAnswer = { readonly ticket?: unknown; readonly text?: unknown };

export const ticketQuestion = (
	pr: number,
	suggestion: string | undefined,
): { message: string; schema: ElicitRequestFormParams['requestedSchema'] } => ({
	message: `Which ticket does PR #${pr} implement? Its acceptance criteria are checked after the review. Leave both fields blank to review without a ticket.`,
	schema: {
		type: 'object',
		properties: {
			ticket: {
				type: 'string',
				title: 'Ticket',
				description: 'GitHub issue (#45, owner/repo#45, or its URL), or a Jira / Linear key',
				...(suggestion ? { default: suggestion } : {}),
			},
			text: {
				type: 'string',
				title: 'Ticket text',
				description: 'For Jira or Linear: paste the description with its acceptance criteria',
			},
		},
	},
});

const GITHUB_REF = /^(#\d+|[\w.-]+\/[\w.-]+#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)$/;

/** The answer as a ticket; undefined when both fields are blank. */
export const ticketFromAnswer = (answer: TicketAnswer): TicketInput | undefined => {
	const ref = typeof answer.ticket === 'string' ? answer.ticket.trim() : '';
	const text = typeof answer.text === 'string' ? answer.text.trim() : '';
	if (!ref && !text) return undefined;
	const github = GITHUB_REF.test(ref);
	return {
		source: github ? 'github' : ref && !text ? 'jira' : 'text',
		...(ref ? { ref } : {}),
		...(text ? { text } : {}),
	};
};

export const publishQuestion = (
	pr: number,
	comments: number,
): { message: string; schema: ElicitRequestFormParams['requestedSchema'] } => ({
	message: `Create a pending review on PR #${pr} with ${comments} inline comment${comments === 1 ? '' : 's'}? It stays a draft only you can see until you submit it on GitHub.`,
	schema: {
		type: 'object',
		properties: { confirm: { type: 'boolean', title: 'Create the pending review', default: false } },
		required: ['confirm'],
	},
});
