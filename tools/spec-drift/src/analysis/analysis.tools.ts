import { Inject, Injectable } from '@nestjs/common';
import { Resource, Tool } from '@nestjs/mcp';
import { appToolMeta, RESOURCE_MIME_TYPE, readAppHtml } from '../common/mcp/mcp-app.util.ts';
import { mcpRequestContext } from '../common/mcp/mcp-request-context.ts';
import {
	AdrCoverageOutput,
	AnalysisJobOutput,
	AnalysisStartOutput,
	DriftOriginOutput,
	ReposOverviewOutput,
	RulePacksOutput,
	ScanSummaryOutput,
	TrendOutput,
	ValidateRulesOutput,
} from './analysis.output.ts';
import { presentAdrCoverage, presentPacks, presentReadiness, presentScan, presentTrend } from './analysis.presenter.ts';
import {
	type AnalysisJobInput,
	AnalysisJobInputSchema,
	type AnalyzeInput,
	AnalyzeInputSchema,
	type DriftOriginInput,
	DriftOriginInputSchema,
	EmptyInputSchema,
	type ScopedAnalyzeInput,
	scopedAnalyzeSchema,
	type TrendInput,
	TrendInputSchema,
} from './analysis.schemas.ts';
import { AnalysisService } from './analysis.service.ts';
import type { ScanMode, ScanSummary } from './analysis.types.ts';
import { overviewText } from './domain/repos-overview.ts';
import { AnalysisJobs, JobLimitError } from './jobs/analysis-jobs.ts';

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
	constructor(
		@Inject(AnalysisService) private readonly analysis: AnalysisService,
		@Inject(AnalysisJobs) private readonly jobs: AnalysisJobs<ScanSummary>,
	) {}

	@Tool({
		name: 'analyze_architecture',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Analyze architecture',
		description:
			'Run the architecture rule set (boundaries, network/DB, scaffolding, taint) with the configured static analyzer and open an interactive dashboard for findings and ADR-backed spec drift.',
		inputSchema: scopedAnalyzeSchema('architecture'),
		outputSchema: ScanSummaryOutput,
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
		outputSchema: ScanSummaryOutput,
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
		outputSchema: ScanSummaryOutput,
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
		outputSchema: RulePacksOutput,
	})
	async listPacks() {
		return presentPacks(this.analysis.engine.rulesDir, await this.analysis.listPacks());
	}

	@Tool({
		name: 'adr_coverage',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'ADR coverage',
		description:
			"Which of the project's ADRs (decision files in its ADR folder) a rule enforces via metadata.adr: coverage, the active ADRs no rule enforces (each with a prompt to have the agent write that rule), and rules citing a missing or superseded ADR. Reads only; runs no scan.",
		inputSchema: EmptyInputSchema,
		outputSchema: AdrCoverageOutput,
	})
	async adrCoverage() {
		return presentAdrCoverage(await this.analysis.adrCoverage());
	}

	@Tool({
		name: 'validate_rules',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Validate rules',
		description:
			'Before accepting rules (e.g. ones the agent generated): per rule, whether its test passes (semgrep --test), how many hits and files it has on the repo, and flags (no-test, test-failed, noisy). Reads only; a missing analyzer is never ready.',
		inputSchema: EmptyInputSchema,
		outputSchema: ValidateRulesOutput,
	})
	async validateRules() {
		return presentReadiness(await this.analysis.validateRules());
	}

	@Tool({
		name: 'drift_trend',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Drift trend',
		description:
			'Is drift going up or down? Over the analysis snapshots (`spec-drift record`, in .semgrep/history/) or the kit audit reports (.harness/audits/): the points oldest first, the direction (first vs last, new findings when there is a baseline), and the rules / ADRs / checks / slices that moved most. Reads only.',
		inputSchema: TrendInputSchema,
		outputSchema: TrendOutput,
	})
	driftTrend(args: TrendInput) {
		return presentTrend(this.analysis.trend({ source: args.source ?? 'analysis', by: args.by, limit: args.limit }));
	}

	@Tool({
		name: 'analysis_start',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Start analysis in the background',
		description:
			'Start a scan without waiting (same input as analyze_spec_drift: mode, packs, paths, severity): returns a job id at once. Poll analysis_job with the id; when done it returns the same result as the analyze tool. Use it on large repositories, where a scan takes minutes. Jobs live in this server process only.',
		inputSchema: AnalyzeInputSchema,
		outputSchema: AnalysisStartOutput,
	})
	analysisStart(args: AnalyzeInput) {
		const tool =
			args.mode === 'architecture'
				? 'analyze_architecture'
				: args.mode === 'standards'
					? 'analyze_standards'
					: 'analyze_spec_drift';
		try {
			const job = this.jobs.start(tool, (progress) =>
				// A context of its own: the start call has returned, so progress goes to the job, not to that call.
				mcpRequestContext.run(
					{
						reportProgress: async (_p: number, _t?: number, message?: string) => {
							if (message) progress(message);
						},
					},
					() => this.analysis.scan({ mode: args.mode, packs: args.packs, paths: args.paths, severity: args.severity }),
				),
			);
			return {
				content: [
					{
						type: 'text' as const,
						text: `Started ${tool} as job ${job.id}. Call analysis_job with { "id": "${job.id}" } until its status is done or failed.`,
					},
				],
				structuredContent: { job } as Record<string, unknown>,
			};
		} catch (error) {
			if (!(error instanceof JobLimitError)) throw error;
			return { content: [{ type: 'text' as const, text: error.message }], isError: true };
		}
	}

	@Tool({
		name: 'analysis_job',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Background analysis job',
		description:
			'Status of a scan started with analysis_start: running (with its last progress message), failed (with the error), or done (with the same result the analyze tool returns). Without an id, lists the jobs of this server process.',
		inputSchema: AnalysisJobInputSchema,
		outputSchema: AnalysisJobOutput,
	})
	analysisJob({ id }: AnalysisJobInput) {
		if (!id) {
			const jobs = this.jobs.list();
			const lines = jobs.map((j) => `${j.id} ${j.tool} ${j.status}${j.progress ? ` — ${j.progress}` : ''}`);
			return {
				content: [
					{ type: 'text' as const, text: lines.length ? lines.join('\n') : 'No analysis jobs in this server process.' },
				],
				structuredContent: { jobs } as Record<string, unknown>,
			};
		}
		const found = this.jobs.get(id);
		if (!found) {
			return {
				content: [
					{
						type: 'text' as const,
						text: `No analysis job ${id} in this server process (jobs end with the process and expire an hour after they finish).`,
					},
				],
				isError: true,
			};
		}
		const { result, ...job } = found;
		if (job.status === 'done' && result) {
			const scan = presentScan(result);
			return {
				content: [{ type: 'text' as const, text: `Job ${id}: done.\n${scan.content[0]?.text ?? ''}` }],
				structuredContent: { job, result } as Record<string, unknown>,
			};
		}
		const detail = job.error ?? job.progress;
		return {
			content: [{ type: 'text' as const, text: `Job ${id}: ${job.status}${detail ? ` — ${detail}` : ''}.` }],
			structuredContent: { job } as Record<string, unknown>,
		};
	}

	@Tool({
		name: 'drift_origin',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Drift origin',
		description:
			"Why is this finding here: for a finding's path and line, the commit that last changed the line (git blame) and the oldest commit that added its text (git log -S), each with author, date, subject and PR number. Reads only.",
		inputSchema: DriftOriginInputSchema,
		outputSchema: DriftOriginOutput,
	})
	async driftOrigin({ path: file, line }: DriftOriginInput) {
		const origin = await this.analysis.driftOrigin(file, line);
		return {
			content: [{ type: 'text' as const, text: origin.summary }],
			structuredContent: origin as Record<string, unknown>,
		};
	}

	@Tool({
		name: 'repos_overview',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Repositories overview',
		description:
			'Several repositories at a glance (SPEC_DRIFT_REPOS): per repository, the latest analysis snapshot (findings, new), the trend direction over its snapshots, and the latest audit drift level and spec compliance; "no data" when a repository has none. Reads files only; runs no scan.',
		inputSchema: EmptyInputSchema,
		outputSchema: ReposOverviewOutput,
	})
	reposOverview() {
		const overview = this.analysis.reposOverview();
		const note = overview.configured ? '' : '\nSPEC_DRIFT_REPOS is unset: only the analyzed repository is shown.';
		return {
			content: [{ type: 'text' as const, text: `${overviewText(overview.repos)}${note}` }],
			structuredContent: overview as unknown as Record<string, unknown>,
		};
	}

	/** Dashboard-only re-scan (hidden from the model on hosts that support visibility). */
	@Tool({
		name: 'rescan',
		annotations: { readOnlyHint: true, openWorldHint: false },
		title: 'Re-run analysis',
		description: 'Re-run the analysis with the given options (used by the dashboard UI).',
		inputSchema: AnalyzeInputSchema,
		outputSchema: ScanSummaryOutput,
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
