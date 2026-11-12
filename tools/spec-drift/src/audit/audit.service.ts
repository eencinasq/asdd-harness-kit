import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { AnalysisService } from '../analysis/analysis.service.ts';
import type { AuditFinding, AuditPayload, NoData, Trace } from './audit.types.ts';
import { type ArchitectureSource, type HarnessLibs, harnessLibs, type SemgrepScan } from './harness-libs.ts';

export const AUDIT_OPTIONS = Symbol('AUDIT_OPTIONS');

export type AuditOptions = {
	/** Repo with the harness installed (`.harness/`), where checks and the Gate command run. */
	readonly root: string;
	/** Semgrep binary for verify_architecture_rules. */
	readonly semgrepBin: string;
	readonly gateTimeoutMs: number;
};

type SpecAdapter = {
	readonly id: string;
	run(context: {
		root: string;
		sliceId: string;
		readBinding: HarnessLibs['drift']['readBinding'];
	}): AuditPayload | Promise<AuditPayload>;
};

const LOCATION_RE = /([\w./@-]+\.[A-Za-z0-9]+):(\d+)(?::\d+)?\s*[-:]?\s*(.*)$/;

const driftLevel = (findings: readonly AuditFinding[]): 'blocking' | 'warning' | 'clean' =>
	findings.some((f) => f.severity === 'fail') ? 'blocking' : findings.length ? 'warning' : 'clean';

const sliceIdOf = (s: unknown): string =>
	typeof s === 'string' ? s : String((s as { slice_id?: string } | null)?.slice_id ?? '');

const sourcesNote = (sources: readonly ArchitectureSource[]): string => {
	const filled = sources.filter((s) => s.filled).map((s) => s.path);
	const open = sources.filter((s) => !s.filled).map((s) => s.path);
	const loaded = filled.length ? ` Loaded rules from ${filled.join(', ')}.` : '';
	const pending = open.length ? ` Still unfilled: ${open.join(', ')}.` : '';
	return `${loaded}${pending}`;
};

const publishSemgrep = (semgrep: SemgrepScan, includeText: boolean) => ({
	status: semgrep.status,
	source: semgrep.source,
	...(semgrep.path ? { path: semgrep.path } : {}),
	...(semgrep.message ? { message: semgrep.message } : {}),
	...(includeText && semgrep.yaml ? { yaml: semgrep.yaml } : {}),
});

const architectureStatus = (gateStatus: string, semgrepStatus: string, findings: readonly AuditFinding[]): string => {
	if (findings.some((f) => f.severity === 'fail') || gateStatus === 'fail' || semgrepStatus === 'fail') return 'fail';
	if (gateStatus === 'error' || semgrepStatus === 'error' || semgrepStatus === 'unavailable') return 'error';
	if (gateStatus === 'pass' || semgrepStatus === 'pass') return 'pass';
	return 'unconfigured';
};

const NO_REPORT: NoData = {
	reason: 'No audit report in .harness/audits/ yet.',
	next: 'Run asdd audit (or schedule it in CI with generate_ci_gate).',
};

const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export type AuditDiffInput = {
	readonly base_branch?: string;
	readonly target_branch?: string;
	readonly mode?: 'author' | 'review';
	readonly pr_body?: string;
};

/**
 * Governance view over the harness: spec drift, architecture rules, spec compliance, and audit reports. A thin
 * projection of the vendored harness checks (`src/harness/`); read-only — it never writes files in the harness root.
 */
@Injectable()
export class AuditService {
	private readonly logger = new Logger('Audit');
	/** Latest audit_diff result of this server process (resource spec://drift/latest-report, audit_finding). */
	private lastDiffReport: AuditPayload | null = null;

	constructor(
		@Inject(AUDIT_OPTIONS) private readonly options: AuditOptions,
		@Inject(AnalysisService) private readonly analysis: AnalysisService,
	) {}

	get root(): string {
		return this.options.root;
	}

	/** The kit's data lives in `.harness/`; without it there is nothing to audit (spec-drift-empty REQ-004). */
	private get installed(): boolean {
		return existsSync(path.join(this.root, '.harness'));
	}

	private get notInstalled(): NoData {
		return {
			reason: `The asdd harness is not installed in ${path.basename(this.root)} (no .harness/): there is no spec data to audit.`,
			next: 'To audit specs, install asdd-harness-kit in the project (asdd install). To review architecture without it, use analyze_architecture with the project rules.',
		};
	}

	private async libs(): Promise<HarnessLibs> {
		return harnessLibs;
	}

	private readText(rel: string): string | null {
		try {
			return readFileSync(path.join(this.root, rel), 'utf8');
		} catch {
			return null;
		}
	}

	private readJson<T = Record<string, unknown>>(rel: string): T | null {
		const text = this.readText(rel);
		if (text === null) return null;
		try {
			return JSON.parse(text) as T;
		} catch {
			return null;
		}
	}

	private git(args: string[]): string | null {
		const r = spawnSync('git', args, { cwd: this.root, encoding: 'utf8' });
		return r.status === 0 ? r.stdout.trim() : null;
	}

	private activeSlices(): string[] {
		const manifest = this.readJson<{ active_slices?: unknown[] }>('.harness/state/manifest.json');
		return (manifest?.active_slices ?? []).map(sliceIdOf).filter(Boolean);
	}

	// ── architecture rules ────────────────────────────────────────────────────

	async verifyArchitectureRules(paths: readonly string[] = [], { includeText = true } = {}): Promise<AuditPayload> {
		if (!this.installed) return { status: 'no-data', no_data: this.notInstalled, findings: [] };
		const { drift, semgrep: semgrepLib } = await this.libs();
		const root = this.root;
		const sources = semgrepLib.loadArchitectureSources(root, { includeText: true });
		const domainProject =
			sources.find((s) => s.id === 'domain-layer.project')?.path ?? '.harness/steering/domain-layer.project.md';
		const [command] = drift.readBinding(root, domainProject, 'Gate command');
		const semgrep = semgrepLib.runSemgrepScan({ root, sources, paths: [...paths], bin: this.options.semgrepBin });

		let gateStatus = 'unconfigured';
		let gateFindings: AuditFinding[] = [];
		let exitCode: number | undefined;
		let output: string | undefined;
		let gateMessage: string | undefined = `No Gate command bound in ${domainProject}.`;
		if (command) {
			const r = spawnSync(command, {
				cwd: root,
				shell: true,
				encoding: 'utf8',
				timeout: this.options.gateTimeoutMs,
				env: { ...process.env, HARNESS_AUDIT_PATHS: paths.join(' ') },
				maxBuffer: 16 * 1024 * 1024,
			});
			if (r.error || r.status === null) {
				gateStatus = 'error';
				gateMessage = r.error?.message ?? 'gate command timed out';
			} else {
				exitCode = r.status;
				gateStatus = r.status === 0 ? 'pass' : 'fail';
				output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
				gateFindings = output
					.split('\n')
					.map((line) => line.match(LOCATION_RE))
					.filter((m): m is RegExpMatchArray => m !== null)
					// Gate output lines carry no stable id (as in the former server).
					.map(
						(m) =>
							({
								check: 'ARCH',
								severity: r.status === 0 ? 'warn' : 'fail',
								paths: [m[1] ?? ''],
								line: Number(m[2]),
								message: m[3]?.trim() || 'architecture rule violation',
							}) as unknown as AuditFinding,
					);
				if (paths.length && gateFindings.length) {
					gateFindings = gateFindings.filter((f) => paths.includes(f.paths?.[0] ?? ''));
				}
				gateMessage = undefined;
			}
		}

		const findings = [...gateFindings, ...semgrep.findings];
		const status = architectureStatus(gateStatus, semgrep.status, findings);
		let message: string | undefined;
		if (status === 'unconfigured') {
			message = `${gateMessage ?? ''} ${semgrep.message ?? ''}`.replace(/\s+/g, ' ').trim();
			message = `${message}${sourcesNote(sources)} This is not a pass.`;
		} else if (status === 'error') {
			message = [
				gateStatus === 'error' ? gateMessage : null,
				semgrep.status === 'error' || semgrep.status === 'unavailable' ? semgrep.message : null,
			]
				.filter(Boolean)
				.join(' ');
		}

		return {
			status,
			...(command ? { command } : { binding: `${domainProject} → Gate command` }),
			...(exitCode !== undefined ? { exit_code: exitCode } : {}),
			findings,
			sources: includeText ? sources : sources.map(({ text: _text, ...rest }) => rest),
			semgrep: publishSemgrep(semgrep, includeText),
			...(message ? { message } : {}),
			// No rules at all: offer the agent prompt that writes them from the codebase (spec-drift-empty REQ-003).
			...(semgrep.status === 'unconfigured' ? { generate_prompt: this.analysis.rulesPrompt(root) } : {}),
			...(output && gateStatus !== 'pass' ? { output: output.trim().slice(-4000) } : {}),
		};
	}

	/** Architecture sources for the view: the list without `id`; one source's text, or the Semgrep rules ("semgrep"). */
	async architectureSources(id?: string): Promise<AuditPayload> {
		const { semgrep } = await this.libs();
		const sources = semgrep.loadArchitectureSources(this.root, { includeText: true });
		if (!id) return { sources: sources.map(({ text, ...s }) => ({ ...s, bytes: text?.length ?? 0 })) };
		if (id === 'semgrep') {
			const config = semgrep.resolveSemgrepConfig(this.root, sources);
			const text = config.yaml ?? (config.path ? this.readText(config.path) : null);
			return {
				id,
				source: config.source,
				...(config.path ? { path: config.path } : {}),
				message: config.message,
				text,
			};
		}
		const src = sources.find((s) => s.id === id);
		if (!src) return { error: `unknown source "${id}"`, available: ['semgrep', ...sources.map((s) => s.id)] };
		return { id, path: src.path, filled: src.filled, text: src.text ?? null };
	}

	// ── spec compliance ───────────────────────────────────────────────────────

	/** Adapters of `.agents/mcp/adapters` and of every enabled module (`cli/modules/<name>/adapters`, kit repo). */
	private async loadAdapters(): Promise<Map<string, SpecAdapter>> {
		const dirs = ['.agents/mcp/adapters'];
		const modules = this.readJson<{ modules?: Record<string, unknown> }>('.harness/config/project.json')?.modules ?? {};
		for (const [name, enabled] of Object.entries(modules)) {
			if (enabled === true) dirs.push(`cli/modules/${name}/adapters`);
		}
		const adapters = new Map<string, SpecAdapter>();
		for (const dir of dirs) {
			const abs = path.join(this.root, dir);
			if (!existsSync(abs)) continue;
			for (const file of readdirSync(abs).sort()) {
				if (!file.endsWith('.mjs') || file.endsWith('.test.mjs')) continue;
				try {
					const mod = ((await import(pathToFileURL(path.join(abs, file)).href)) as { default?: SpecAdapter }).default;
					if (mod?.id && typeof mod.run === 'function' && !adapters.has(mod.id)) adapters.set(mod.id, mod);
				} catch (error) {
					this.logger.warn(`adapter ${dir}/${file} failed to load: ${(error as Error).message}`);
				}
			}
		}
		return adapters;
	}

	async verifySpecCompliance(sliceId: string, adapterId?: string): Promise<AuditPayload> {
		const empty = { slice_id: sliceId, adapters: {}, summary: {}, findings: [] };
		if (!this.installed) return { ...empty, no_data: this.notInstalled };
		const known = this.activeSlices();
		if (!known.length) {
			return {
				...empty,
				no_data: {
					reason: 'No slices in .harness/state/manifest.json yet: no specification to check.',
					next: 'Start one with asdd slice init <slice-id>.',
				},
			};
		}
		if (!known.includes(sliceId)) return { error: `unknown slice "${sliceId}"`, known };
		const libs = await this.libs();
		const adapters = await this.loadAdapters();
		const available = ['ears', ...adapters.keys()];
		if (adapterId && !available.includes(adapterId)) return { error: `unknown adapter "${adapterId}"`, available };

		const results: Record<string, AuditPayload> = {};
		if (!adapterId || adapterId === 'ears') {
			const res = libs.drift.runDrift({
				root: this.root,
				sliceIds: [sliceId],
				requirementChecks: true,
				includeContract: false,
			});
			const findings = res.findings.filter((f) => f.check === 'DRIFT-03' || f.check === 'DRIFT-04');
			results['ears'] = {
				status: findings.some((f) => f.severity === 'fail') ? 'fail' : 'pass',
				spec_compliance: res.summary.spec_compliance,
				must_requirements: res.summary.must_requirements,
				findings,
			};
		}
		for (const [id, adapter] of adapters) {
			if (adapterId && adapterId !== id) continue;
			try {
				results[id] = await adapter.run({ root: this.root, sliceId, readBinding: libs.drift.readBinding });
			} catch (error) {
				results[id] = { status: 'error', findings: [], message: (error as Error).message };
			}
		}
		const all = Object.values(results).flatMap((r) => r.findings ?? []);
		return {
			slice_id: sliceId,
			adapters: results,
			summary: {
				spec_compliance: results['ears']?.['spec_compliance'] ?? null,
				drift_level: driftLevel(all),
			},
		};
	}

	// ── audit_diff ────────────────────────────────────────────────────────────

	async auditDiff({
		base_branch,
		target_branch,
		mode = 'author',
		pr_body,
	}: AuditDiffInput = {}): Promise<AuditPayload> {
		if (!this.installed) return { mode, no_data: this.notInstalled, findings: [], suppressed: [] };
		const { drift, audit, learning } = await this.libs();
		const root = this.root;
		const review = mode === 'review';
		const base = nonEmpty(base_branch);
		const target = nonEmpty(target_branch);
		const prBranch = review ? (target ?? this.git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '') : undefined;
		const probe = review ? drift.runDrift({ root, base, target, prBranch, prBody: pr_body }) : null;
		const linked = probe?.summary.linked_slices ?? [];
		const res =
			review && linked.length
				? drift.runDrift({ root, base, target, sliceIds: linked, prBranch, prBody: pr_body })
				: (probe ?? drift.runDrift({ root, base, target }));

		let findings = res.findings;
		let suppressed: AuditFinding[] = [];
		if (review) ({ kept: findings, suppressed } = audit.applyTriage(root, findings));

		const targetRef = target ?? 'HEAD';
		const managed = drift.harnessManaged(root);
		const changed = drift.isGitRepo(root)
			? drift
					.changedFiles(root, drift.resolveBase(root, base, targetRef), targetRef)
					.filter((f) => !drift.isExempt(f, managed))
			: [];
		const architecture = await this.verifyArchitectureRules(changed, { includeText: false });
		const archFindings = (architecture.findings ?? []) as AuditFinding[];
		const all = [...findings, ...archFindings];
		const archSources = (architecture['sources'] ?? []) as ArchitectureSource[];
		const report: AuditPayload = {
			mode,
			findings: all,
			suppressed,
			architecture: {
				status: architecture['status'],
				command: architecture['command'],
				message: architecture['message'],
				sources: archSources.map(({ id, path: p, filled }) => ({ id, path: p, filled })),
				semgrep: architecture['semgrep'],
				...(architecture['generate_prompt'] ? { generate_prompt: architecture['generate_prompt'] } : {}),
			},
			summary: { ...res.summary, drift_level: driftLevel(all) },
			notes: res.notes,
			// Self-improving harness: patterns this change touches (advisory, never a finding).
			learning: learning.learningForReview(root, { changed, slices: linked }),
			generated_at: new Date().toISOString(),
		};
		this.lastDiffReport = report;
		return report;
	}

	// ── insight (read-only) ───────────────────────────────────────────────────

	/**
	 * Findings to query (audit_query): the latest audit_diff of this process, the latest audit report, or a fresh drift
	 * check over all slices; `auto` takes the first that exists. Reads only.
	 */
	async findingsFrom(
		from: 'auto' | 'diff' | 'report' | 'drift',
	): Promise<{ from: string; findings: AuditFinding[] } | { from: string; no_data: NoData }> {
		if (!this.installed) return { from, no_data: this.notInstalled };
		const { audit, drift } = await this.libs();
		const diff = this.lastDiffReport?.['no_data'] ? undefined : this.lastDiffReport?.findings;
		if (from === 'diff' || (from === 'auto' && diff)) {
			return diff
				? { from: 'diff', findings: diff }
				: {
						from,
						no_data: {
							reason: 'No audit_diff has run in this server process yet.',
							next: 'Call audit_diff first, or query from "report" or "drift".',
						},
					};
		}
		const latest = audit.latestReport(this.root);
		if (from === 'report' || (from === 'auto' && latest)) {
			return latest
				? { from: `report ${latest.path}`, findings: (latest.report.findings ?? []) as AuditFinding[] }
				: { from, no_data: NO_REPORT };
		}
		return { from: 'drift', findings: drift.runDrift({ root: this.root, requirementChecks: true }).findings };
	}

	/** The learning loop, read-only (learning_report): decisions stay with the Tech Lead at the asdd CLI. */
	async learningReport(limit?: number): Promise<AuditPayload> {
		const commands_note =
			"This server writes nothing. Run the `next` commands in a terminal (asdd learn --propose, asdd triage); proposal decisions (status, decided_by) are the Tech Lead's, in the proposal file.";
		if (!this.installed) {
			const summary = { patterns: 0, open: 0, in_flight: 0, verified: 0, proposals: 0, unsigned_failures: 0 };
			return { summary, patterns: [], proposals: [], commands_note, no_data: this.notInstalled };
		}
		const { learning } = await this.libs();
		const report = learning.learningReport(this.root, { limit });
		const s = report['summary'] as Record<string, number> | undefined;
		const empty = !s?.['patterns'] && !s?.['proposals'] && !s?.['unsigned_failures'];
		return {
			...report,
			commands_note,
			...(empty
				? {
						no_data: {
							reason: 'No failure-log incidents and no steering proposals yet.',
							next: 'Agents log failures in docs/agent-failure-log.md; a signature seen often enough becomes a learning pattern here.',
						},
					}
				: {}),
		};
	}

	// ── audit reports ─────────────────────────────────────────────────────────

	async auditReport({ since, severity }: { since?: string; severity?: string } = {}): Promise<AuditPayload> {
		const { audit } = await this.libs();
		if (!this.installed) return { no_data: this.notInstalled, findings: [], reports: [] };
		const latest = audit.latestReport(this.root);
		if (!latest) return { no_data: NO_REPORT, findings: [], reports: [] };
		const sinceTime = since ? Date.parse(since) : Number.NaN;
		const findings = (latest.report.findings ?? []).filter(
			(f) =>
				(!severity || f.severity === severity) &&
				(Number.isNaN(sinceTime) || Date.parse(f.last_seen ?? f.first_seen ?? '0') >= sinceTime),
		);
		return { ...latest.report, path: latest.path, findings, reports: audit.listReports(this.root).slice(0, 10) };
	}

	private async traceNode(nodeId: string | null | undefined, depth = 2): Promise<Trace | null> {
		if (!nodeId) return null;
		const store = await (await this.libs()).openKnowledgeStore(this.root);
		if (!store) return null;
		const seen = new Set([nodeId]);
		const edgeKeys = new Set<string>();
		const edges: Trace['edges'] = [];
		let frontier = [nodeId];
		for (let d = 0; d < depth && frontier.length; d += 1) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const e of await store.edgesIncident(id)) {
					const key = `${e.from}|${e.rel}|${e.to}`;
					if (!edgeKeys.has(key)) {
						edgeKeys.add(key);
						edges.push(e);
					}
					const other = e.from === id ? e.to : e.from;
					if (!seen.has(other)) {
						seen.add(other);
						next.push(other);
					}
				}
			}
			frontier = next;
		}
		const nodes: Trace['nodes'] = [];
		for (const id of seen) {
			const n = await store.nodeById(id);
			if (n) nodes.push(n);
		}
		return { start: nodeId, nodes, edges };
	}

	async auditFinding(id: string): Promise<AuditPayload> {
		const { audit } = await this.libs();
		const pool = [...(this.lastDiffReport?.findings ?? []), ...(audit.latestReport(this.root)?.report.findings ?? [])];
		const finding = pool.find((f) => f.id === id);
		if (!finding) return { error: `finding ${id} not found in the latest audit_diff or audit report` };
		return { finding, trace: await this.traceNode(finding.node) };
	}

	// ── resources ─────────────────────────────────────────────────────────────

	manifestView(): AuditPayload {
		const registry = this.readJson('.harness/state/registry.json');
		const slices = Object.fromEntries(
			this.activeSlices().map((id) => [id, this.readJson(`.harness/state/slices/${id}/manifest.json`)]),
		);
		return { registry, slices };
	}

	async architectureRules(): Promise<string> {
		const { semgrep } = await this.libs();
		const parts = semgrep
			.loadArchitectureSources(this.root)
			.map((src) =>
				src.filled ? `<!-- ${src.path} -->\n${src.text}` : `<!-- ${src.path} (unfilled; not product truth) -->`,
			);
		const gates = (this.readText('.harness/steering/quality-gates.md') ?? '')
			.split('\n')
			.filter((l) => /^- \*\*QG-(DOM|DRIFT)-/.test(l));
		if (gates.length) parts.push(`<!-- .harness/steering/quality-gates.md (QG-DOM, QG-DRIFT) -->\n${gates.join('\n')}`);
		return parts.join('\n\n');
	}

	async latestDriftReport(): Promise<AuditPayload> {
		if (this.lastDiffReport) return { source: 'audit_diff (this session)', report: this.lastDiffReport };
		const { audit, drift } = await this.libs();
		const latest = audit.latestReport(this.root);
		if (latest) return { source: latest.path, report: latest.report };
		return { source: 'fresh check-spec-drift', report: drift.runDrift({ root: this.root }) };
	}
}
