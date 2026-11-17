/**
 * Security audit runs (security-review REQ-002…REQ-005, REQ-009, REQ-010). A run is guidance-mode use of the vendored
 * cloudflare/security-audit-skill: reconnaissance picks the checklists, the agent hunts read-only, submits findings that
 * the vendored validator accepts, and the ledger records which checklists were reviewed. Run state lives outside the
 * repository (design ADR-002): `$XDG_STATE_HOME/spec-drift/security/<project>/run-<N>/run.json`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { writeJsonAtomic } from '../common/fs/atomic-write.ts';
import { ProcessRunner } from '../common/process/process-runner.service.ts';
import { checklistById } from './checklists.ts';
import { type SecurityFinding, type SeverityLevel, severityOf, validateSecurityFindings } from './findings.ts';
import { type ReconResult, recon } from './recon.ts';

export const SECURITY_OPTIONS = Symbol('SECURITY_OPTIONS');

export type SecurityOptions = {
	/** Repository under audit (ANALYSIS_REPO_ROOT). */
	readonly repoRoot: string;
	/** Root for run state, outside the repository (`$XDG_STATE_HOME/spec-drift/security`). */
	readonly stateRoot: string;
};

export type LedgerEntry = {
	readonly id: string;
	readonly title: string;
	readonly status: 'pending' | 'reviewed';
};

export type SecurityRun = {
	readonly id: string;
	readonly repoRoot: string;
	readonly startedAt: string;
	readonly focus: readonly string[];
	readonly recon: ReconResult;
	readonly ledger: readonly LedgerEntry[];
	readonly findings: readonly SecurityFinding[];
};

export type SubmitInput = {
	readonly runId: string;
	readonly findings: readonly unknown[];
	readonly checklists_reviewed?: readonly string[];
};

export type SubmitResult = {
	readonly runId: string;
	readonly accepted: number;
	readonly total: number;
	readonly ledger: readonly LedgerEntry[];
	readonly warnings: readonly string[];
};

export type FindingRow = {
	readonly fingerprint: string;
	readonly title: string;
	readonly verdict: SecurityFinding['verdict'];
	readonly severity: SeverityLevel | null;
	readonly location: string;
};

export type SecurityStatus = {
	readonly run: { readonly id: string; readonly startedAt: string; readonly repo: string };
	readonly counts: {
		readonly total: number;
		readonly byVerdict: Readonly<Record<string, number>>;
		readonly bySeverity: Readonly<Record<string, number>>;
	};
	readonly coverage: { readonly reviewed: number; readonly total: number };
	readonly ledger: readonly LedgerEntry[];
	readonly needsValidation: readonly { readonly fingerprint: string; readonly title: string }[];
	readonly findings: {
		readonly page: number;
		readonly pages: number;
		readonly items: readonly FindingRow[];
	};
};

/** Findings per status page: keeps the structured result under the 8 KB view budget. */
const PAGE_SIZE = 10;
/** Tracked files read for reconnaissance; a larger repo is sampled in path order. */
const MAX_FILES = 20_000;
/** Errors returned for a rejected submission (the validator caps at 100). */
const MAX_ERRORS = 40;
const SEVERITY_ORDER: readonly SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'informational'];
const RUN_ID = /^run-(\d+)$/;

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The prompt of a run (REQ-002): methodology rules, recon, checklists, submit contract. At most 8 000 characters. */
export const buildAuditPrompt = (run: {
	readonly id: string;
	readonly repoName: string;
	readonly recon: ReconResult;
	readonly ledger: readonly LedgerEntry[];
}): string => {
	const langs = Object.entries(run.recon.languages)
		.sort((a, b) => b[1] - a[1])
		.map(([l, n]) => `${l} (${n})`)
		.join(', ');
	const surfaces = run.recon.surfaces
		.map((s) => {
			const why = (run.recon.evidence[s] ?? []).slice(0, 2).join(', ');
			return why ? `${s} (${why})` : s;
		})
		.join('; ');
	const lines = [
		`Security audit ${run.id} of ${run.repoName} — guidance mode of the cloudflare/security-audit-skill methodology.`,
		`Reconnaissance: ${run.recon.files} tracked file(s); languages: ${langs || 'none detected'}; surfaces: ${surfaces || 'none detected'}.`,
		'',
		'Rules:',
		'- Report a vulnerability only when it violates a real trust boundary: name the affected principal or resource and the security outcome. A candidate without them is not a finding.',
		'- Source inspection only. Never run project code, builds, tests or containers, never install dependencies, never use the network, and never probe deployed endpoints or shared services. When a fact needs execution, submit the finding as needs_validation with its blockers and a validation plan.',
		'- Use dummy principals, fixtures and secrets in any reproduction you describe. Do not write audit files into the repository.',
		'- Separate priority from certainty; recommend the smallest effective source fix.',
		'',
		'Steps:',
		'1. Read each checklist below with security_audit_checklist({ id, page }), starting with core; follow its pages.',
		'2. Hunt checklist by checklist in the source. For each candidate keep a trace entrypoint → propagation → sink with file and line, and evidence lines.',
		`3. Submit with security_audit_submit_findings({ runId: "${run.id}", findings, checklists_reviewed }). Findings follow the skill's report-schema.json:`,
		'   - needs_validation: fingerprint, title, description, claimed_root_cause, trace, evidence, blockers, validation_plan { local | deployment } — the usual verdict here;',
		'   - confirmed: only with a sandboxed reproduction (execution.observed_result), plus root_cause, intended_behavior, conditions, remediation, severity, confidence;',
		'   - rejected: a candidate you disproved, with its reason.',
		'   Every trace/evidence file must exist in the repository and every line must be inside it; the server rejects the submission otherwise and lists each error.',
		'4. When every checklist is reviewed, call security_audit_status (dashboard). analyze_security adds a deterministic static baseline.',
		'',
		'Coverage ledger:',
		...run.ledger.map((e) => `- [${e.status === 'reviewed' ? 'x' : ' '}] ${e.id} — ${e.title}`),
	];
	return clip(lines.join('\n'), 8000);
};

@Injectable()
export class SecurityAuditService {
	constructor(
		@Inject(ProcessRunner) private readonly process: ProcessRunner,
		@Inject(SECURITY_OPTIONS) private readonly options: SecurityOptions,
	) {}

	get repoRoot(): string {
		return this.options.repoRoot;
	}

	/** Runs of this repository live under a folder named after it plus a hash of its path (no collisions). */
	private get projectDir(): string {
		const name = path.basename(this.repoRoot) || 'repo';
		const hash = createHash('sha256').update(this.repoRoot).digest('hex').slice(0, 8);
		return path.join(this.options.stateRoot, `${name}-${hash}`);
	}

	runDir(runId: string): string {
		if (!RUN_ID.test(runId)) throw new BadRequestException(`Invalid run id '${runId}' (expected run-<N>).`);
		return path.join(this.projectDir, runId);
	}

	private async runIds(): Promise<string[]> {
		const entries = await fs.readdir(this.projectDir).catch(() => [] as string[]);
		return entries.filter((e) => RUN_ID.test(e)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
	}

	private async load(runId: string): Promise<SecurityRun> {
		const file = path.join(this.runDir(runId), 'run.json');
		if (!existsSync(file)) {
			throw new NotFoundException(`No security audit ${runId} for this repository. Call security_audit_start first.`);
		}
		return JSON.parse(readFileSync(file, 'utf8')) as SecurityRun;
	}

	private async save(run: SecurityRun): Promise<void> {
		const dir = this.runDir(run.id);
		await fs.mkdir(dir, { recursive: true });
		await writeJsonAtomic(path.join(dir, 'run.json'), run);
	}

	/** Tracked files (git), else a bounded walk that skips VCS and dependency folders. */
	private async trackedFiles(): Promise<string[]> {
		const git = await this.process
			.run('git', ['ls-files', '-z'], { cwd: this.repoRoot, timeoutMs: 30_000 })
			.catch(() => null);
		if (git && git.code === 0) return git.stdout.split('\0').filter(Boolean).slice(0, MAX_FILES);
		const out: string[] = [];
		const walk = async (dir: string): Promise<void> => {
			if (out.length >= MAX_FILES) return;
			const entries = await fs.readdir(path.join(this.repoRoot, dir), { withFileTypes: true }).catch(() => []);
			for (const e of entries) {
				if (out.length >= MAX_FILES) return;
				const rel = dir ? `${dir}/${e.name}` : e.name;
				if (e.isDirectory()) {
					if (!['.git', 'node_modules', 'dist', 'build', '.venv', 'vendor'].includes(e.name)) await walk(rel);
				} else if (e.isFile()) out.push(rel);
			}
		};
		await walk('');
		return out;
	}

	private readRepoFile = (rel: string): string | null => {
		try {
			const file = path.resolve(this.repoRoot, rel);
			if (!file.startsWith(`${path.resolve(this.repoRoot)}${path.sep}`)) return null;
			return readFileSync(file, 'utf8').slice(0, 512 * 1024);
		} catch {
			return null;
		}
	};

	async start(input: { readonly paths?: readonly string[] }): Promise<{ run: SecurityRun; prompt: string }> {
		const focus = input.paths ?? [];
		const files = (await this.trackedFiles()).filter(
			(f) => !focus.length || focus.some((p) => f === p || f.startsWith(`${p.replace(/\/$/, '')}/`)),
		);
		const result = recon(files, this.readRepoFile);
		const ids = await this.runIds();
		const next = ids.length ? Number(ids.at(-1)?.slice(4)) + 1 : 1;
		const run: SecurityRun = {
			id: `run-${next}`,
			repoRoot: this.repoRoot,
			startedAt: new Date().toISOString(),
			focus,
			recon: result,
			ledger: result.checklists.map((id) => ({
				id,
				title: checklistById(id)?.title ?? id,
				status: 'pending' as const,
			})),
			findings: [],
		};
		await this.save(run);
		return {
			run,
			prompt: buildAuditPrompt({
				id: run.id,
				repoName: path.basename(this.repoRoot),
				recon: result,
				ledger: run.ledger,
			}),
		};
	}

	async submit(input: SubmitInput): Promise<SubmitResult> {
		const run = await this.load(input.runId);
		const validation = validateSecurityFindings(input.findings, this.repoRoot);
		if (!validation.ok) {
			const shown = validation.errors.slice(0, MAX_ERRORS);
			const more = validation.errors.length > shown.length ? `\n… ${validation.errors.length - shown.length} more` : '';
			throw new BadRequestException(
				`Rejected: ${validation.errors.length} error(s) against report-schema.json and the repository. Nothing was stored; fix them and resubmit.\n${shown.join('\n')}${more}`,
			);
		}
		const byFingerprint = new Map(run.findings.map((f) => [f.fingerprint, f]));
		for (const f of validation.findings) byFingerprint.set(f.fingerprint, f);
		const warnings: string[] = [];
		const reviewed = new Set<string>();
		for (const id of input.checklists_reviewed ?? []) {
			if (run.ledger.some((e) => e.id === id)) reviewed.add(id);
			else warnings.push(`'${id}' is not in this run's ledger (${run.ledger.map((e) => e.id).join(', ')}); ignored.`);
		}
		const ledger = run.ledger.map((e) => (reviewed.has(e.id) ? { ...e, status: 'reviewed' as const } : e));
		const findings = [...byFingerprint.values()].sort((a, b) =>
			a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0,
		);
		await this.save({ ...run, ledger, findings });
		return { runId: run.id, accepted: validation.findings.length, total: findings.length, ledger, warnings };
	}

	async status(input: { readonly runId?: string; readonly page?: number }): Promise<SecurityStatus> {
		const runId = input.runId ?? (await this.runIds()).at(-1);
		if (!runId)
			throw new NotFoundException('No security audit for this repository yet. Call security_audit_start first.');
		const run = await this.load(runId);
		const byVerdict: Record<string, number> = {};
		const bySeverity: Record<string, number> = {};
		for (const f of run.findings) {
			byVerdict[f.verdict] = (byVerdict[f.verdict] ?? 0) + 1;
			const sev = severityOf(f);
			if (sev) bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
		}
		const rank = (f: SecurityFinding): number => {
			const sev = severityOf(f);
			return sev ? SEVERITY_ORDER.indexOf(sev) : f.verdict === 'needs_validation' ? 5 : 6;
		};
		const ordered = [...run.findings].sort((a, b) => rank(a) - rank(b));
		const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
		const page = Math.min(Math.max(1, Math.trunc(input.page ?? 1)), pages);
		const items: FindingRow[] = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((f) => {
			const sink = [...f.trace].reverse().find((t) => t.kind === 'sink') ?? f.evidence[0];
			return {
				fingerprint: clip(f.fingerprint, 120),
				title: clip(f.title, 160),
				verdict: f.verdict,
				severity: severityOf(f) ?? null,
				location: sink ? `${sink.file}:${sink.line}` : '',
			};
		});
		return {
			run: { id: run.id, startedAt: run.startedAt, repo: path.basename(run.repoRoot) },
			counts: { total: run.findings.length, byVerdict, bySeverity },
			coverage: { reviewed: run.ledger.filter((e) => e.status === 'reviewed').length, total: run.ledger.length },
			ledger: run.ledger,
			needsValidation: run.findings
				.filter((f) => f.verdict === 'needs_validation')
				.slice(0, 20)
				.map((f) => ({ fingerprint: clip(f.fingerprint, 120), title: clip(f.title, 160) })),
			findings: { page, pages, items },
		};
	}
}
