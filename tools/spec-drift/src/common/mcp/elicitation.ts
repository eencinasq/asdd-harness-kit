import {
	acceptedContent,
	CLIENT_CAPABILITIES_META_KEY,
	type ElicitRequestFormParams,
	type InputRequiredResult,
	inputRequired,
} from '@modelcontextprotocol/server';
import type { McpContext } from '@nestjs/mcp';

/**
 * Structured questions to the user (spec-drift-depth REQ-004, ADR-004). On protocol 2026-07-28 a tool asks by returning
 * an `inputRequired` result; the client shows the form and retries the same call with the answers in `inputResponses`
 * (the server keeps no state between the rounds). 2025-era requests are served statelessly and cannot be asked: the tool
 * behaves as before.
 */

export type Answer<T> =
	| { readonly kind: 'accepted'; readonly content: T }
	| { readonly kind: 'declined' }
	/** Not asked yet on this call. */
	| { readonly kind: 'none' };

/** Whether this call's client declared the `elicitation` capability on a 2026-07-28 request. */
export const canElicit = (ctx: McpContext | undefined): boolean => {
	if (ctx?.era !== 'modern') return false;
	const envelope = ctx.server?.mcpReq?.envelope as Record<string, unknown> | undefined;
	const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as { elicitation?: unknown } | undefined;
	return Boolean(capabilities?.elicitation);
};

/** The answer to the question `key` carried by this (retried) call. Declined and cancelled read the same. */
export const answerOf = <T extends Record<string, unknown>>(ctx: McpContext | undefined, key: string): Answer<T> => {
	const responses = ctx?.server?.mcpReq?.inputResponses;
	if (!responses || !(key in responses)) return { kind: 'none' };
	const content = acceptedContent<T>(responses, key);
	return content ? { kind: 'accepted', content } : { kind: 'declined' };
};

/** The result that asks the question `key`; the client retries the call with the answer. */
export const ask = (
	key: string,
	message: string,
	requestedSchema: ElicitRequestFormParams['requestedSchema'],
): InputRequiredResult =>
	inputRequired({ inputRequests: { [key]: inputRequired.elicit({ message, requestedSchema }) } });
