import { Inject, Injectable } from '@nestjs/common';
import { Tool } from '@nestjs/mcp';

import {
	type PatternsInput,
	PatternsInputSchema,
	PipelineStatusInputSchema,
	type SearchInput,
	SearchInputSchema,
	type SliceInput,
	SliceInputSchema,
	StatusInputSchema,
	type TraceInput,
	TraceInputSchema,
} from './knowledge.schemas.ts';
import { type Answer, KnowledgeService } from './knowledge.service.ts';

const present = ({ payload, failed }: Answer) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
	structuredContent: payload,
	isError: failed,
});

/** Reads the local index only (search may call the configured embeddings endpoint for the query vector). */
const LOCAL_READ = { readOnlyHint: true, openWorldHint: false } as const;

@Injectable()
export class KnowledgeTools {
	constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}

	@Tool({
		name: 'knowledge_search',
		title: 'Search knowledge',
		annotations: { readOnlyHint: true, openWorldHint: true },
		description:
			'Search harness knowledge chunks (specs, EARS requirements, features, sessions, logs). Uses stored embeddings when present, otherwise lexical token matching.',
		inputSchema: SearchInputSchema,
	})
	async search(args: SearchInput) {
		return present(await this.knowledge.search(args.query, args.k, args.slice_id));
	}

	@Tool({
		name: 'knowledge_trace',
		title: 'Trace',
		annotations: LOCAL_READ,
		description:
			'Traverse the traceability graph from a node id (e.g. req:<slice>:REQ-001, feature:<slice>:F-01, slice:<id>, file:<path>). Returns nodes and edges within `depth` hops.',
		inputSchema: TraceInputSchema,
	})
	async trace(args: TraceInput) {
		return present(await this.knowledge.trace(args.id, args.depth));
	}

	@Tool({
		name: 'knowledge_slice',
		title: 'Slice bundle',
		annotations: LOCAL_READ,
		description:
			'Context bundle for one slice: manifest summary, spec docs, requirements, features with status, and session count. JIT loading — pull only what the current phase needs.',
		inputSchema: SliceInputSchema,
	})
	async slice(args: SliceInput) {
		return present(await this.knowledge.slice(args.slice_id));
	}

	@Tool({
		name: 'knowledge_status',
		title: 'Index status',
		annotations: LOCAL_READ,
		description: 'Index stats: node/edge/chunk counts, generated_at, embedding coverage.',
		inputSchema: StatusInputSchema,
	})
	async status() {
		return present(await this.knowledge.status());
	}

	@Tool({
		name: 'knowledge_patterns',
		title: 'Learning patterns',
		annotations: LOCAL_READ,
		description:
			'Self-improving harness: repeated failures, overrides, and dismissals grouped into patterns (LP-*), with their steering proposals (SP-*) and measured effect. Use before proposing a guide or sensor change.',
		inputSchema: PatternsInputSchema,
	})
	async patterns(args: PatternsInput) {
		return present(await this.knowledge.patterns(args.status));
	}

	@Tool({
		name: 'pipeline_status',
		title: 'Pipeline status',
		annotations: LOCAL_READ,
		description:
			'ASDD pipeline adoption metrics (same as `asdd status --json`): lite share, escalation rate, phase medians, stop-FAIL counts, open learning patterns. Read-only; writes nothing.',
		inputSchema: PipelineStatusInputSchema,
	})
	pipelineStatus() {
		return present(this.knowledge.pipelineStatus());
	}
}
