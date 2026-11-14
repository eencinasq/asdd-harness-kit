import * as query from '../harness/knowledge-query.mjs';
import { computePipelineMetrics as computePipelineMetricsFn } from '../harness/pipeline-metrics.mjs';

/**
 * The knowledge queries are the harness's own `cli/src/harness/knowledge-query.mjs` (the CLI agents and skills
 * run), vendored into `src/harness/` by the kit's `asdd kit vendor`, so the server and the CLI give
 * the same answers. Only the data under `.harness/` comes from the project.
 */

/** A query answer: the payload, and whether it is an error result. */
export type Answer = { readonly payload: Record<string, unknown>; readonly failed: boolean };

export type KnowledgeQuery = {
	status(root: string): Promise<Answer>;
	search(root: string, query: string, opts: { k: number; sliceId?: string }): Promise<Answer>;
	trace(root: string, id: string, opts: { depth: number }): Promise<Answer>;
	slice(root: string, sliceId: string): Promise<Answer>;
	patterns(root: string, opts: { status?: string }): Promise<Answer>;
};

/** Bundled with the server: no runtime lookup of the project's harness CLI. */
export const knowledgeQuery = query as unknown as KnowledgeQuery;

/** Same object as `asdd status --json` (ASDD-ROADMAP P1.2). */
export const computePipelineMetrics = (root: string) => computePipelineMetricsFn({ root }) as Record<string, unknown>;
