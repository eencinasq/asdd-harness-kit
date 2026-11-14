import path from 'node:path';

import type { EngineInfo, RuleMeta, RulePack, RuleTestReport } from '../analysis.types.ts';
import type {
	AnalyzerRunRequest,
	AnalyzerRunResult,
	CodeAnalyzer,
	RulesLocation,
} from '../ports/code-analyzer.port.ts';

/**
 * One `CodeAnalyzer` over a primary engine (Semgrep) and extra engines (the dependency graph) — spec-drift-depth
 * ADR-003. Packs are routed to the engine that listed them; findings are merged. The engine identity, rule tests, and
 * rules folder stay the primary's.
 */
export class CompositeAnalyzer implements CodeAnalyzer {
	constructor(
		private readonly primary: CodeAnalyzer,
		private readonly extras: readonly { readonly analyzer: CodeAnalyzer; owns(pack: RulePack): boolean }[],
	) {}

	get engine(): EngineInfo {
		return this.primary.engine;
	}

	private ownerOf(pack: RulePack): CodeAnalyzer {
		return this.extras.find((e) => e.owns(pack))?.analyzer ?? this.primary;
	}

	private split(packs: readonly RulePack[]): Map<CodeAnalyzer, RulePack[]> {
		const byOwner = new Map<CodeAnalyzer, RulePack[]>();
		for (const pack of packs) {
			const owner = this.ownerOf(pack);
			byOwner.set(owner, [...(byOwner.get(owner) ?? []), pack]);
		}
		return byOwner;
	}

	async inspect(repoRoot: string): Promise<RulesLocation> {
		const main = await this.primary.inspect(repoRoot);
		const extra = await Promise.all(this.extras.map((e) => e.analyzer.inspect(repoRoot)));
		const found = extra.filter((l) => l.exists);
		return {
			rulesDir: main.rulesDir,
			exists: main.exists || found.length > 0,
			ruleFiles: [
				...main.ruleFiles,
				...found.flatMap((l) => l.ruleFiles.map((f) => path.relative(main.rulesDir, path.join(l.rulesDir, f)))),
			],
		};
	}

	async listPacks(repoRoot: string): Promise<RulePack[]> {
		const lists = await Promise.all(
			[this.primary, ...this.extras.map((e) => e.analyzer)].map((a) => a.listPacks(repoRoot)),
		);
		return lists.flat();
	}

	async loadRules(packs: readonly RulePack[]): Promise<RuleMeta[]> {
		const lists = await Promise.all([...this.split(packs)].map(([analyzer, own]) => analyzer.loadRules(own)));
		return lists.flat();
	}

	async run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult> {
		const groups = [...this.split(request.packs)];
		if (!groups.length) return this.primary.run(request);
		// Extra engines declare their rules under their own pack ids; every other rule is the primary's (a primary rule's
		// `pack` may be a file pack inside a selected set).
		const extraPackIds = new Set(
			groups.filter(([analyzer]) => analyzer !== this.primary).flatMap(([, packs]) => packs.map((p) => p.id)),
		);
		const rulesFor = (analyzer: CodeAnalyzer, packs: readonly RulePack[]) =>
			analyzer === this.primary
				? request.rules.filter((r) => !extraPackIds.has(r.pack))
				: request.rules.filter((r) => packs.some((p) => p.id === r.pack));
		const results = await Promise.all(
			groups.map(([analyzer, packs]) => analyzer.run({ ...request, packs, rules: rulesFor(analyzer, packs) })),
		);
		return {
			status: results.some((r) => r.status === 'failed') ? 'failed' : 'ok',
			exitCode: Math.max(...results.map((r) => r.exitCode)),
			findings: results.flatMap((r) => r.findings),
			stderrTail: results
				.map((r) => r.stderrTail)
				.filter(Boolean)
				.join('\n'),
		};
	}

	authoringGuide(): readonly string[] {
		return [...this.primary.authoringGuide(), ...this.extras.flatMap((e) => e.analyzer.authoringGuide())];
	}

	get testRules(): ((repoRoot: string, timeoutMs: number) => Promise<RuleTestReport>) | undefined {
		return this.primary.testRules?.bind(this.primary);
	}
}
