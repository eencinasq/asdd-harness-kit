import { matchGlob } from '../../../pr-review/engine/glob.ts';
import type { Layer, LayerConfig } from './layers.ts';

/**
 * Checks over the import graph (spec-drift-depth REQ-003): layer violations and cycles. Pure: nodes are repository
 * files, edges carry the importing line.
 */

export const DEP_LAYER = 'dep-layer';
export const DEP_CYCLE = 'dep-cycle';

export type Edge = { readonly to: string; readonly line: number; readonly typeOnly?: boolean };
export type ImportGraph = ReadonlyMap<string, readonly Edge[]>;

export type GraphViolation = {
	readonly rule: typeof DEP_LAYER | typeof DEP_CYCLE;
	readonly path: string;
	readonly line: number;
	readonly message: string;
};

const covers = (pattern: string, file: string): boolean => {
	const p = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
	return /[*?{]/.test(p) ? matchGlob(p, file) : file === p || file.startsWith(`${p}/`);
};

/** The first layer (table order) whose paths cover the file; null outside every layer. */
export const layerOf = (layers: readonly Layer[], file: string): Layer | null =>
	layers.find((l) => l.paths.some((p) => covers(p, file))) ?? null;

export const layerViolations = (
	config: LayerConfig,
	graph: ImportGraph,
	only?: ReadonlySet<string>,
): GraphViolation[] => {
	const out: GraphViolation[] = [];
	for (const [from, edges] of graph) {
		if (only && !only.has(from)) continue;
		const source = layerOf(config.layers, from);
		if (!source) continue;
		const allowed = new Set([source.name, ...source.mayDependOn].map((n) => n.toLowerCase()));
		for (const edge of edges) {
			const target = layerOf(config.layers, edge.to);
			if (!target || allowed.has(target.name.toLowerCase())) continue;
			const may = source.mayDependOn.length ? source.mayDependOn.join(', ') : 'no other layer';
			out.push({
				rule: DEP_LAYER,
				path: from,
				line: edge.line,
				message: `${source.name} must not depend on ${target.name}: imports ${edge.to} (${source.name} may depend on ${may}).`,
			});
		}
	}
	return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
};

/** Strongly connected components with more than one file (Tarjan, iterative). */
export const cyclesOf = (graph: ImportGraph): string[][] => {
	let index = 0;
	const indexOf = new Map<string, number>();
	const low = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const out: string[][] = [];
	const nodes = [...graph.keys()].sort();
	for (const root of nodes) {
		if (indexOf.has(root)) continue;
		const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
		indexOf.set(root, index);
		low.set(root, index);
		index += 1;
		stack.push(root);
		onStack.add(root);
		while (work.length) {
			const frame = work[work.length - 1] as { node: string; next: number };
			const edges = graph.get(frame.node) ?? [];
			if (frame.next < edges.length) {
				const to = (edges[frame.next] as Edge).to;
				frame.next += 1;
				if (!indexOf.has(to)) {
					indexOf.set(to, index);
					low.set(to, index);
					index += 1;
					stack.push(to);
					onStack.add(to);
					work.push({ node: to, next: 0 });
				} else if (onStack.has(to)) {
					low.set(frame.node, Math.min(low.get(frame.node) as number, indexOf.get(to) as number));
				}
				continue;
			}
			work.pop();
			const parent = work[work.length - 1];
			if (parent) low.set(parent.node, Math.min(low.get(parent.node) as number, low.get(frame.node) as number));
			if (low.get(frame.node) === indexOf.get(frame.node)) {
				const component: string[] = [];
				let member: string | undefined;
				do {
					member = stack.pop() as string;
					onStack.delete(member);
					component.push(member);
				} while (member !== frame.node);
				if (component.length > 1) out.push(component.sort());
			}
		}
	}
	return out.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));
};

/** A shortest cycle through `start` inside its component (BFS), as a file list that ends where it starts. */
const cyclePath = (graph: ImportGraph, start: string, members: ReadonlySet<string>): string[] => {
	const prev = new Map<string, string>();
	const queue = [start];
	while (queue.length) {
		const node = queue.shift() as string;
		for (const { to } of graph.get(node) ?? []) {
			if (!members.has(to)) continue;
			if (to === start) {
				const path = [start];
				for (let n = node; n !== start; n = prev.get(n) as string) path.unshift(n);
				path.unshift(start);
				return path;
			}
			if (!prev.has(to)) {
				prev.set(to, node);
				queue.push(to);
			}
		}
	}
	return [start];
};

/**
 * One finding per cycle, at the first file's import of the next file in the cycle. With `only`, cycles that touch none
 * of those files are left out.
 */
export const cycleViolations = (all: ImportGraph, only?: ReadonlySet<string>): GraphViolation[] => {
	// Type-only imports are erased at runtime: they count for layers, not for cycles.
	const graph: ImportGraph = new Map([...all].map(([from, edges]) => [from, edges.filter((e) => !e.typeOnly)]));
	return cyclesOf(graph)
		.filter((members) => !only || members.some((m) => only.has(m)))
		.map((members) => {
			const start = members[0] as string;
			const path = cyclePath(graph, start, new Set(members));
			const next = path[1] ?? start;
			const line = (graph.get(start) ?? []).find((e) => e.to === next)?.line ?? 1;
			const more = members.length > path.length - 1 ? ` (${members.length} files in the cycle)` : '';
			return {
				rule: DEP_CYCLE,
				path: start,
				line,
				message: `Import cycle: ${path.join(' → ')}${more}.`,
			};
		});
};
