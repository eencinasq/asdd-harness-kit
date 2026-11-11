import { Injectable } from '@nestjs/common';
import { Prompt } from '@nestjs/mcp';
import * as z from 'zod';

const SpecDriftArgs = z.object({
	paths: z
		.string()
		.optional()
		.describe('Comma-separated repo-relative paths to limit the scan, e.g. "packages/domains/shared"'),
	severity: z.enum(['ERROR', 'WARNING', 'INFO']).optional().describe('Minimum severity'),
});

@Injectable()
export class AnalysisPrompts {
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
