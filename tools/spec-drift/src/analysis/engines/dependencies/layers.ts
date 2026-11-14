/**
 * The `Dependency layers` table of `domain-layer.project.md` (spec-drift-depth REQ-003):
 *
 * | Layer | Paths | May depend on |
 * |-------|-------|---------------|
 * | Domain | `src/domain/**` | — |
 * | Application | `src/application/**` | Domain |
 *
 * and an optional `**Dependency cycles:** allow` line. Pure.
 */

export const BINDING_FILE = '.harness/steering/domain-layer.project.md';

export type Layer = {
	readonly name: string;
	readonly paths: readonly string[];
	/** Layer names this layer may import, besides itself. */
	readonly mayDependOn: readonly string[];
};

export type LayerConfig = {
	readonly layers: readonly Layer[];
	readonly cycles: 'forbid' | 'allow';
	/** Layer names in "May depend on" that no row declares. */
	readonly unknownLayers: readonly string[];
};

const PLACEHOLDER = /^(…|\.\.\.|-|—|none|n\/a)?$/i;

const cells = (line: string): string[] =>
	line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((c) => c.trim());

const listOf = (cell: string): string[] =>
	cell
		.split(',')
		.map((s) => s.trim().replace(/^`|`$/g, '').trim())
		.filter((s) => !PLACEHOLDER.test(s));

/** The table under a `Dependency layers` heading; null when the binding has none (or only placeholder rows). */
export const parseLayers = (markdown: string): LayerConfig | null => {
	const lines = markdown.split('\n');
	const start = lines.findIndex((l) => /^#{2,4}\s+Dependency layers\s*$/i.test(l.trim()));
	if (start < 0) return null;
	const layers: Layer[] = [];
	let header: string[] | null = null;
	for (const line of lines.slice(start + 1)) {
		if (/^#{1,4}\s/.test(line.trim())) break;
		if (!line.trim().startsWith('|')) {
			if (header && layers.length) break;
			continue;
		}
		const row = cells(line);
		if (!header) {
			header = row.map((c) => c.toLowerCase());
			continue;
		}
		if (row.every((c) => /^:?-+:?$/.test(c))) continue;
		const at = (name: string) => row[header?.findIndex((h) => h.startsWith(name)) ?? -1] ?? '';
		const name = at('layer').replace(/`/g, '').trim();
		const paths = listOf(at('path'));
		if (PLACEHOLDER.test(name) || !paths.length) continue;
		layers.push({ name, paths, mayDependOn: listOf(at('may')) });
	}
	if (!layers.length) return null;
	const names = new Set(layers.map((l) => l.name.toLowerCase()));
	const unknownLayers = [...new Set(layers.flatMap((l) => l.mayDependOn.filter((d) => !names.has(d.toLowerCase()))))];
	const cycles = /\*\*Dependency cycles:\*\*\s*`?allow/i.test(markdown) ? 'allow' : 'forbid';
	return { layers, cycles, unknownLayers };
};
