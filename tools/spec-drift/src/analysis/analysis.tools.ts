import { Inject, Injectable } from '@nestjs/common';
import { Resource, Tool } from '@nestjs/mcp';

import { appToolMeta, RESOURCE_MIME_TYPE, readAppHtml } from '../common/mcp/mcp-app.util.ts';
import { presentPacks, presentScan } from './analysis.presenter.ts';
import {
	type AnalyzeInput,
	AnalyzeInputSchema,
	EmptyInputSchema,
	type ScopedAnalyzeInput,
	scopedAnalyzeSchema,
} from './analysis.schemas.ts';
import { AnalysisService } from './analysis.service.ts';
import type { ScanMode } from './analysis.types.ts';

/** Kept stable across the engine rename: hosts may have cached it. */
export const ANALYSIS_UI_URI = 'ui://spec-drift/dashboard.html';
const ANALYSIS_UI_FILE = 'analysis-dashboard.html';

/**
 * MCP entry points for static-analysis scans and the spec-drift dashboard. Engine-neutral: the
 * scan runs on whatever CODE_ANALYZER is configured (Semgrep by default).
 * Handlers stay thin: validate (schema) → AnalysisService → present.
 */
@Injectable()
export class AnalysisTools {
	constructor(@Inject(AnalysisService) private readonly analysis: AnalysisService) {}

	@Tool({
		name: 'analyze_architecture',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Analyze architecture',
		description:
			'Run the architecture rule set (boundaries, network/DB, scaffolding, taint) with the configured static analyzer and open an interactive dashboard for findings and ADR-backed spec drift.',
		inputSchema: scopedAnalyzeSchema('architecture'),
		_meta: appToolMeta(ANALYSIS_UI_URI),
	})
	analyzeArchitecture(args: ScopedAnalyzeInput) {
		return this.scan('architecture', args);
	}

	@Tool({
		name: 'analyze_standards',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Analyze coding standards',
		description:
			'Run the coding-standards rule set (try/catch, enum, any, assertions, process.env, naming) with the configured static analyzer and show an interactive dashboard.',
		inputSchema: scopedAnalyzeSchema('standards'),
		_meta: appToolMeta(ANALYSIS_UI_URI),
	})
	analyzeStandards(args: ScopedAnalyzeInput) {
		return this.scan('standards', args);
	}

	@Tool({
		name: 'analyze_spec_drift',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Analyze architecture & standards spec drift',
		description:
			'Compare the live codebase against the rule-encoded architectural/ADR specs (AGENTS.md / ADRs). Returns a drift report: which rules are clean vs violating, with samples — rendered in an interactive MCP App dashboard.',
		inputSchema: AnalyzeInputSchema,
		_meta: appToolMeta(ANALYSIS_UI_URI),
	})
	analyzeSpecDrift(args: AnalyzeInput) {
		return this.scan(args.mode, args);
	}

	@Tool({
		name: 'list_rule_packs',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'List rule packs',
		description:
			"List the rule packs of the analyzed repo (e.g. under .semgrep/): one per top-level folder (set) and one per rule file. Use their ids in the analyze tools' `packs` argument.",
		inputSchema: EmptyInputSchema,
	})
	async listPacks() {
		return presentPacks(this.analysis.engine.rulesDir, await this.analysis.listPacks());
	}

	/** Dashboard-only re-scan (hidden from the model on hosts that support visibility). */
	@Tool({
		name: 'rescan',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Re-run analysis',
		description: 'Re-run the analysis with the given options (used by the dashboard UI).',
		inputSchema: AnalyzeInputSchema,
		_meta: appToolMeta(ANALYSIS_UI_URI, ['app']),
	})
	rescan(args: AnalyzeInput) {
		return this.scan(args.mode, args);
	}

	@Resource({ uri: ANALYSIS_UI_URI, name: ANALYSIS_UI_URI, mimeType: RESOURCE_MIME_TYPE })
	dashboard() {
		return readAppHtml(ANALYSIS_UI_URI, ANALYSIS_UI_FILE);
	}

	private async scan(mode: ScanMode, args: ScopedAnalyzeInput) {
		return presentScan(
			await this.analysis.scan({
				mode,
				packs: args.packs,
				paths: args.paths,
				severity: args.severity,
			}),
		);
	}
}
