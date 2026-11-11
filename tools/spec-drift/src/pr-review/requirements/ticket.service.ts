import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { GithubService } from '../github/github.service.ts';
import type { TicketInput } from '../pr-review.schemas.ts';
import type { Criterion, Ticket } from './requirements.types.ts';
import { extractCriteria, numberCriteria } from './ticket-parser.ts';

/**
 * Turns the `ticket` argument into a ticket + criteria. GitHub issues are fetched with `gh`; Jira and
 * Linear are read by the agent with its own MCP tools (this server holds no credentials for them).
 */
@Injectable()
export class TicketService {
	constructor(@Inject(GithubService) private readonly github: GithubService) {}

	async resolve(input: TicketInput, repoRoot: string): Promise<{ ticket: Ticket; criteria: Criterion[] }> {
		let ticket: Ticket = {
			source: input.source,
			text: input.text ?? '',
			...(input.ref ? { ref: input.ref } : {}),
			...(input.title ? { title: input.title } : {}),
			...(input.url ? { url: input.url } : {}),
		};
		if (input.source === 'github' && !input.text && input.ref) {
			const issue = await this.github.fetchIssue(input.ref, repoRoot);
			ticket = { ...ticket, text: issue.body, title: ticket.title ?? issue.title, url: ticket.url ?? issue.url };
		}
		if (!ticket.text && !input.criteria?.length) {
			throw new BadRequestException(
				`No ticket text for ${input.ref ?? input.source}. Read the ${input.source} ticket with your own tools and pass its text (or criteria).`,
			);
		}
		const criteria = input.criteria?.length ? numberCriteria(input.criteria) : extractCriteria(ticket.text);
		return { ticket, criteria };
	}
}
