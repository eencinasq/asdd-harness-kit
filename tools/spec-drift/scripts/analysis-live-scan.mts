/**
 * Live analysis scan through the Nest container (needs the engine, e.g. `semgrep`, and
 * ANALYSIS_REPO_ROOT's rule packs).
 *   pnpm smoke:analysis [path ...]
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { McpStdioLogger } from '@nestjs/mcp';
import { AnalysisService } from '../src/analysis/analysis.service.ts';
import { AppModule } from '../src/app.module.ts';

const app = await NestFactory.createApplicationContext(AppModule, { logger: new McpStdioLogger() });
try {
	const analysis = app.get(AnalysisService);
	const packs = await analysis.listPacks();
	const paths = process.argv.slice(2);
	const summary = await analysis.scan({ mode: 'spec-drift', paths: paths.length ? paths : undefined });
	console.log(
		JSON.stringify(
			{
				engine: summary.engine.name,
				status: summary.status,
				repoRoot: analysis.repoRoot,
				packs: packs.map((p) => p.id),
				rulesInCatalog: summary.rules.length,
				findings: summary.findingCount,
				drifting: summary.drift.driftingRules,
				clean: summary.drift.cleanRules,
				bySeverity: summary.bySeverity,
				top: summary.drift.topDrifts.slice(0, 5).map((d) => ({ id: d.ruleId, n: d.violationCount, adr: d.adr })),
			},
			null,
			2,
		),
	);
	if (summary.rules.length === 0) {
		console.error(`warning: no rules under ${analysis.repoRoot}/${analysis.engine.rulesDir}`);
	}
} finally {
	await app.close();
}
