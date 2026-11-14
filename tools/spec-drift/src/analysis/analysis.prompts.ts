import { Inject, Injectable } from '@nestjs/common';
import { Prompt } from '@nestjs/mcp';
import * as z from 'zod';

import { AnalysisService } from './analysis.service.ts';
import { buildFixPrompt, FIX_MAX } from './domain/fix-prompt.ts';

const SpecDriftArgs = z.object({
	paths: z
		.string()
		.optional()
		.describe('Comma-separated repo-relative paths to limit the scan, e.g. "packages/domains/shared"'),
	severity: z.enum(['ERROR', 'WARNING', 'INFO']).optional().describe('Minimum severity'),
});

const NoArgs = z.object({});
const FixArgs = z.object({
	rule_id: z.string().describe('The drifting rule to fix (an id from the scan, e.g. arch.no-infra-in-domain)'),
	max: z.string().optional().describe(`Violations to fix in this round (default ${FIX_MAX})`),
});
const AdrArgs = z.object({ adr_id: z.string().describe('The ADR to encode, e.g. ADR-0010 (see adr_coverage)') });

@Injectable()
export class AnalysisPrompts {
	constructor(@Inject(AnalysisService) private readonly analysis: AnalysisService) {}

	@Prompt({
		name: 'generate-architecture-rules',
		title: 'Generate architecture rules',
		description:
			'Have the agent write the project’s architecture and coding-standard rules (e.g. .semgrep/architecture/, .semgrep/standards/) from the existing codebase, for the analyze tools and the audit.',
		argsSchema: NoArgs,
	})
	generateArchitectureRules(): string {
		return this.analysis.rulesPrompt();
	}

	@Prompt({
		name: 'write-adr-rule',
		title: 'Write the rule for an ADR',
		description: 'Have the agent encode one ADR that no rule enforces yet as a rule with a test (see adr_coverage).',
		argsSchema: AdrArgs,
	})
	async writeAdrRule({ adr_id }: z.infer<typeof AdrArgs>): Promise<string> {
		const coverage = await this.analysis.adrCoverage();
		const n = /(\d+)/.exec(adr_id)?.[1];
		const adr = coverage.adrs.find((a) => a.number !== null && n !== undefined && a.number === Number(n));
		if (!adr?.id) {
			const known = coverage.adrs.map((a) => a.id).filter(Boolean);
			return `No ADR ${adr_id} in ${coverage.dir ?? 'this repository (no ADR folder found)'}. Known: ${known.join(', ') || 'none'}.`;
		}
		return this.analysis.adrRulePrompt({ id: adr.id, title: adr.title, path: adr.path });
	}

	@Prompt({
		name: 'fix-rule-violations',
		title: 'Fix the violations of a rule',
		description:
			'Have the agent fix the current violations of one rule (after the user confirms the plan) and rescan the changed files. Runs a scan to list them; the server writes nothing.',
		argsSchema: FixArgs,
	})
	async fixRuleViolations({ rule_id, max }: z.infer<typeof FixArgs>): Promise<string> {
		const { summary, findings } = await this.analysis.scanAll();
		const rule = summary.rules.find((r) => r.id === rule_id);
		if (!rule) {
			const drifting = summary.drift.items.filter((i) => i.status === 'drifting').map((i) => i.ruleId);
			return `No rule ${rule_id} in this repository's rules. Drifting rules: ${drifting.join(', ') || 'none'}.`;
		}
		const limit = Number(max);
		return buildFixPrompt({ rule, findings, ...(Number.isInteger(limit) && limit > 0 ? { max: limit } : {}) });
	}

	@Prompt({
		name: 'spec-drift-report',
		title: 'Architecture spec drift report',
		description: 'Scan with the architecture/standards rule packs and explain which ADR-backed rules are drifting.',
		argsSchema: SpecDriftArgs,
	})
	specDriftReport({ paths, severity }: z.infer<typeof SpecDriftArgs>): string {
		const list = paths
			?.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		const args = [list?.length ? `paths: ${JSON.stringify(list)}` : '', severity ? `severity: "${severity}"` : '']
			.filter(Boolean)
			.join(', ');
		return [
			`Call analyze_spec_drift${args ? ` with { ${args} }` : ''}.`,
			'Then report: the drifting rules grouped by ADR (most severe first), 2–3 representative locations each,',
			'and a short, concrete fix per rule. Mention rules that are clean only as a count.',
		].join('\n');
	}
}
