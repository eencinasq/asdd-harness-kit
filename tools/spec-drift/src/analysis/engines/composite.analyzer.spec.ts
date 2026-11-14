import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RuleMeta, RulePack } from '../analysis.types.ts';
import type { AnalyzerRunRequest, CodeAnalyzer } from '../ports/code-analyzer.port.ts';
import { CompositeAnalyzer } from './composite.analyzer.ts';

const pack = (id: string, path: string): RulePack => ({ id, kind: 'set', path, set: id, files: [path] });
const rule = (id: string, p: string): RuleMeta => ({
	id,
	pack: p,
	severity: 'ERROR',
	message: id,
	category: 'architecture',
	adr: null,
	mode: 'search',
});

const fake = (name: string, packs: RulePack[], calls: AnalyzerRunRequest[]): CodeAnalyzer => ({
	engine: { id: name, name, rulesDir: `/repo/.${name}` },
	inspect: async () => ({ rulesDir: `/repo/.${name}`, exists: true, ruleFiles: [`${name}.yml`] }),
	listPacks: async () => packs,
	loadRules: async (ps) => ps.map((p) => rule(`${name}-rule`, name === 'semgrep' ? 'rules' : p.id)),
	run: async (request) => {
		calls.push(request);
		return {
			status: 'ok',
			exitCode: 1,
			findings: request.rules.map((r) => ({
				checkId: r.id,
				path: 'a.ts',
				startLine: 1,
				endLine: 1,
				severity: 'ERROR',
				message: r.id,
				category: 'architecture',
				adr: null,
				pack: r.pack,
			})),
			stderrTail: name,
		};
	},
	authoringGuide: () => [`${name} guide`],
	testRules: async () => ({ status: 'ok', byRule: { [`${name}-rule`]: 'passed' }, invalidFiles: [] }),
});

test('spec-drift-depth REQ-003: the composite routes packs and rules to their engine and merges the results', async () => {
	const semgrepCalls: AnalyzerRunRequest[] = [];
	const depCalls: AnalyzerRunRequest[] = [];
	const deps = pack('dependencies', '/repo/.harness/steering/domain-layer.project.md');
	const arch = pack('architecture', '/repo/.semgrep/architecture');
	const composite = new CompositeAnalyzer(fake('semgrep', [arch], semgrepCalls), [
		{ analyzer: fake('deps', [deps], depCalls), owns: (p) => p.id === 'dependencies' },
	]);
	assert.equal(composite.engine.id, 'semgrep', 'the primary engine identity');
	const packs = await composite.listPacks('/repo');
	assert.deepEqual(
		packs.map((p) => p.id),
		['architecture', 'dependencies'],
	);
	const rules = await composite.loadRules(packs);
	assert.deepEqual(
		rules.map((r) => [r.id, r.pack]),
		[
			['semgrep-rule', 'rules'],
			['deps-rule', 'dependencies'],
		],
	);
	const run = await composite.run({ repoRoot: '/repo', packs, rules, timeoutMs: 1000 });
	assert.deepEqual(
		semgrepCalls[0]?.rules.map((r) => r.id),
		['semgrep-rule'],
		'a primary rule under a file pack still reaches the primary',
	);
	assert.deepEqual(
		depCalls[0]?.rules.map((r) => r.id),
		['deps-rule'],
	);
	assert.deepEqual(
		run.findings.map((f) => f.checkId),
		['semgrep-rule', 'deps-rule'],
	);
	assert.equal(run.stderrTail, 'semgrep\ndeps');
	assert.deepEqual(composite.authoringGuide(), ['semgrep guide', 'deps guide']);
	assert.equal((await composite.testRules?.('/repo', 1))?.byRule['semgrep-rule'], 'passed');
	const location = await composite.inspect('/repo');
	assert.deepEqual(location.ruleFiles, ['semgrep.yml', '../.deps/deps.yml']);
});
