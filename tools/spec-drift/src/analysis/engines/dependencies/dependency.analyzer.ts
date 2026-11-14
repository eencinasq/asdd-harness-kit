import fs from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { ProcessRunner } from '../../../common/process/process-runner.service.ts';
import type { EngineInfo, Finding, RuleMeta, RulePack } from '../../analysis.types.ts';
import type {
	AnalyzerRunRequest,
	AnalyzerRunResult,
	CodeAnalyzer,
	RulesLocation,
} from '../../ports/code-analyzer.port.ts';
import { cycleViolations, DEP_CYCLE, DEP_LAYER, type Edge, layerViolations } from './graph.ts';
import {
	buildIndexes,
	extractImports,
	goModuleOf,
	languageOf,
	type ResolveContext,
	resolveImport,
	tsPathsOf,
} from './imports.ts';
import { BINDING_FILE, type LayerConfig, parseLayers } from './layers.ts';

export const DEPENDENCIES_PACK = 'dependencies';
/** Source files read per scan, at most: a bigger repository is scanned partly and says so. */
export const MAX_SOURCE_FILES = 20_000;

const RULES: Record<string, Omit<RuleMeta, 'pack' | 'adr'>> = {
	[DEP_LAYER]: {
		id: DEP_LAYER,
		severity: 'ERROR',
		message: 'A file imports a layer its layer may not depend on (Dependency layers in domain-layer.project.md).',
		category: 'architecture',
		mode: 'graph',
	},
	[DEP_CYCLE]: {
		id: DEP_CYCLE,
		severity: 'WARNING',
		message: 'Files import each other in a cycle.',
		category: 'architecture',
		mode: 'graph',
	},
};

const readText = (file: string): Promise<string | null> => fs.readFile(file, 'utf8').catch(() => null);

const underAny = (file: string, folders: readonly string[]): boolean =>
	folders.some((f) => {
		const d = f.replace(/^\.\//, '').replace(/\/+$/, '');
		return d && (file === d || file.startsWith(`${d}/`) || file.split('/').includes(d));
	});

/**
 * Dependency-graph rules (spec-drift-depth REQ-003) as a `CodeAnalyzer`: the `Dependency layers` table of
 * `.harness/steering/domain-layer.project.md` is its rule source, the repository's import graph its input. Combined with
 * Semgrep by `CompositeAnalyzer` (ADR-003). Reads only.
 */
@Injectable()
export class DependencyAnalyzer implements CodeAnalyzer {
	readonly engine: EngineInfo = { id: 'dependencies', name: 'Dependency graph', rulesDir: path.dirname(BINDING_FILE) };

	constructor(@Inject(ProcessRunner) private readonly process: ProcessRunner) {}

	private async config(repoRoot: string): Promise<LayerConfig | null> {
		const text = await readText(path.join(repoRoot, BINDING_FILE));
		return text ? parseLayers(text) : null;
	}

	/** Whether a pack is this engine's (its path is the binding file). */
	static owns(pack: RulePack): boolean {
		return pack.id === DEPENDENCIES_PACK && pack.path.endsWith(BINDING_FILE.split('/').join(path.sep));
	}

	async inspect(repoRoot: string): Promise<RulesLocation> {
		const rulesDir = path.join(repoRoot, this.engine.rulesDir);
		const config = await this.config(repoRoot);
		return { rulesDir, exists: Boolean(config), ruleFiles: config ? [path.basename(BINDING_FILE)] : [] };
	}

	async listPacks(repoRoot: string): Promise<RulePack[]> {
		if (!(await this.config(repoRoot))) return [];
		const file = path.join(repoRoot, BINDING_FILE);
		return [{ id: DEPENDENCIES_PACK, kind: 'set', path: file, set: DEPENDENCIES_PACK, files: [file] }];
	}

	async loadRules(packs: readonly RulePack[]): Promise<RuleMeta[]> {
		const pack = packs.find((p) => DependencyAnalyzer.owns(p));
		if (!pack) return [];
		const text = await readText(pack.path);
		const config = text ? parseLayers(text) : null;
		if (!config) return [];
		const ids = config.cycles === 'allow' ? [DEP_LAYER] : [DEP_LAYER, DEP_CYCLE];
		return ids.map((id) => ({ ...(RULES[id] as RuleMeta), pack: DEPENDENCIES_PACK, adr: null }));
	}

	private async trackedFiles(repoRoot: string): Promise<string[]> {
		const git = await this.process.run('git', ['ls-files', '-z'], { cwd: repoRoot }).catch(() => null);
		if (git?.code === 0) return git.stdout.split('\0').filter(Boolean);
		const out: string[] = [];
		const walk = async (dir: string): Promise<void> => {
			for (const entry of await fs.readdir(path.join(repoRoot, dir), { withFileTypes: true }).catch(() => [])) {
				if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
				const rel = dir ? `${dir}/${entry.name}` : entry.name;
				if (entry.isDirectory()) await walk(rel);
				else out.push(rel);
			}
		};
		await walk('');
		return out;
	}

	async run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult> {
		const pack = request.packs.find((p) => DependencyAnalyzer.owns(p));
		const text = pack ? await readText(pack.path) : null;
		const config = text ? parseLayers(text) : null;
		if (!pack || !config) return { status: 'ok', exitCode: 0, findings: [], stderrTail: '' };

		const exclude = request.exclude ?? [];
		const all = (await this.trackedFiles(request.repoRoot)).filter((f) => !underAny(f, exclude));
		const snapshot = request.targetRoot !== undefined;
		const scoped = request.paths?.filter((p) => p !== '.') ?? [];
		// A PR snapshot holds only the PR's files: check those files' layers against the repository's file set (ADR-003).
		const sources = (snapshot ? scoped : all).filter((f) => languageOf(f) !== null);
		const files = new Set([...all, ...scoped]);
		const notes: string[] = [];
		if (sources.length > MAX_SOURCE_FILES) {
			notes.push(`Read the first ${MAX_SOURCE_FILES} of ${sources.length} source files.`);
			sources.length = MAX_SOURCE_FILES;
		}
		const ctx: ResolveContext = {
			files,
			tsPaths: tsPathsOf(
				(await readText(path.join(request.repoRoot, 'tsconfig.base.json'))) ??
					(await readText(path.join(request.repoRoot, 'tsconfig.json'))),
			),
			goModule: goModuleOf(await readText(path.join(request.repoRoot, 'go.mod'))),
			...buildIndexes([...files]),
		};
		const graph = new Map<string, Edge[]>();
		const readRoot = request.targetRoot ?? request.repoRoot;
		for (const file of sources) {
			const language = languageOf(file);
			const source = language ? await readText(path.join(readRoot, file)) : null;
			if (!language || source === null) continue;
			const edges: Edge[] = [];
			for (const ref of extractImports(language, source)) {
				const to = resolveImport(language, file, ref.spec, ctx);
				if (to && !edges.some((e) => e.to === to && e.line === ref.line)) {
					edges.push({ to, line: ref.line, ...(ref.typeOnly ? { typeOnly: true } : {}) });
				}
			}
			graph.set(file, edges);
		}
		const only = scoped.length ? new Set(scoped) : undefined;
		const violations = [
			...layerViolations(config, graph, only),
			// Cycles need the whole graph: not in a PR snapshot.
			...(config.cycles === 'forbid' && !snapshot ? cycleViolations(graph, only) : []),
		];
		const findings: Finding[] = violations.map((v) => ({
			checkId: v.rule,
			path: v.path,
			startLine: v.line,
			endLine: v.line,
			severity: RULES[v.rule]?.severity ?? 'ERROR',
			message: v.message,
			category: 'architecture',
			adr: null,
			pack: DEPENDENCIES_PACK,
		}));
		if (config.unknownLayers.length) {
			notes.push(`"May depend on" names unknown layers: ${config.unknownLayers.join(', ')}.`);
		}
		return { status: 'ok', exitCode: findings.length ? 1 : 0, findings, stderrTail: notes.join(' ') };
	}

	authoringGuide(): readonly string[] {
		return [
			`For layer and cycle checks that resolve relative imports, add a \`## Dependency layers\` table to \`${BINDING_FILE}\`: \`| Layer | Paths | May depend on |\`, one row per layer (paths as globs in backticks, allowed layers by name, \`—\` for none). Import cycles are reported unless the file says \`**Dependency cycles:** allow\`.`,
		];
	}
}
