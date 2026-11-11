import { Inject, Injectable } from '@nestjs/common';

import { type Answer, knowledgeQuery } from './harness-libs.ts';

export type { Answer } from './harness-libs.ts';

export const KNOWLEDGE_OPTIONS = Symbol('KNOWLEDGE_OPTIONS');

export type KnowledgeOptions = {
	/** Repo with the harness installed: `.harness/knowledge/` is read from here, `.env` / `.env.local` re-read per call. */
	readonly root: string;
};

/**
 * Read-only projection of the generated knowledge index and of the learning loop: a thin wrapper over the vendored
 * `knowledge-query.mjs`, the same code agents run as a CLI. Files under `.harness/` stay the source of truth.
 */
@Injectable()
export class KnowledgeService {
	constructor(@Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions) {}

	status(): Promise<Answer> {
		return knowledgeQuery.status(this.options.root);
	}

	/** Semantic (exact cosine) when the index has vectors and the query embeds; else lexical. */
	search(query: string, k: number, sliceId?: string): Promise<Answer> {
		return knowledgeQuery.search(this.options.root, query, { k, ...(sliceId ? { sliceId } : {}) });
	}

	/** Breadth-first walk over traceability edges, both directions, up to `depth` hops. */
	trace(startId: string, depth: number): Promise<Answer> {
		return knowledgeQuery.trace(this.options.root, startId, { depth });
	}

	/** Context bundle for one slice: spec docs, requirements, criteria, features, session count, log entries. */
	slice(sliceId: string): Promise<Answer> {
		return knowledgeQuery.slice(this.options.root, sliceId);
	}

	/** Learning patterns, computed live from the sources of truth: needs no knowledge index. */
	patterns(status?: string): Promise<Answer> {
		return knowledgeQuery.patterns(this.options.root, status ? { status } : {});
	}
}
