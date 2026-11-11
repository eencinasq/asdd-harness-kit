import fs from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { ProcessRunner } from '../../../common/process/process-runner.service.ts';
import type { EngineInfo, RuleMeta, RulePack } from '../../analysis.types.ts';
import { ruleFilesOf } from '../../domain/pack-selection.ts';
import type {
	AnalyzerRunRequest,
	AnalyzerRunResult,
	CodeAnalyzer,
	RulesLocation,
} from '../../ports/code-analyzer.port.ts';
import { parseFindings, parseSemgrepJson, semgrepErrors } from './semgrep-output.ts';
import { IGNORED_SETS, isRuleFile, packIdFromFile, parseRuleCatalog } from './semgrep-rules.ts';

const RULES_DIR = '.semgrep';

/** Per-file timeout Semgrep applies inside a run (the whole run is bounded by `timeoutMs`). */
const PER_FILE_TIMEOUT_SECONDS = 120;

/**
 * Semgrep adapter for the CodeAnalyzer port. Rules are Semgrep YAML under `<repo>/.semgrep/`; each
 * top-level folder is a set (`architecture`, `standards`, …) and each rule file a pack.
 */
@Injectable()
export class SemgrepAnalyzer implements CodeAnalyzer {
	readonly engine: EngineInfo = { id: 'semgrep', name: 'Semgrep', rulesDir: RULES_DIR };

	constructor(@Inject(ProcessRunner) private readonly process: ProcessRunner) {}

	async inspect(repoRoot: string): Promise<RulesLocation> {
		const rulesDir = path.join(repoRoot, RULES_DIR);
		const stat = await fs.stat(rulesDir).catch(() => null);
		if (!stat?.isDirectory()) return { rulesDir, exists: false, ruleFiles: [] };
		const files = await this.ruleFilesUnder(rulesDir);
		return { rulesDir, exists: true, ruleFiles: files.map((f) => path.relative(rulesDir, f)) };
	}

	async listPacks(repoRoot: string): Promise<RulePack[]> {
		const rulesDir = path.join(repoRoot, RULES_DIR);
		const entries = await fs.readdir(rulesDir, { withFileTypes: true }).catch(() => []);
		const packs: RulePack[] = [];
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(rulesDir, entry.name);
			if (entry.isDirectory() && this.isRuleFolder(entry.name)) {
				const files = await this.ruleFilesUnder(full);
				if (files.length === 0) continue;
				packs.push({ id: entry.name, kind: 'set', path: full, set: entry.name, files });
				for (const file of files) {
					packs.push({
						id: packIdFromFile(path.basename(file)),
						kind: 'file',
						path: file,
						set: entry.name,
						files: [file],
					});
				}
			} else if (entry.isFile() && isRuleFile(entry.name)) {
				packs.push({ id: packIdFromFile(entry.name), kind: 'file', path: full, set: '', files: [full] });
			}
		}
		return packs;
	}

	async loadRules(packs: readonly RulePack[]): Promise<RuleMeta[]> {
		// A file can be reached through its set and its own pack; attribute it to the file pack.
		const owner = new Map<string, RulePack>();
		for (const pack of packs)
			for (const file of pack.files) if (pack.kind === 'file' || !owner.has(file)) owner.set(file, pack);
		const rules: RuleMeta[] = [];
		for (const file of ruleFilesOf(packs)) {
			const pack = owner.get(file);
			const yaml = await fs.readFile(file, 'utf8').catch(() => '');
			rules.push(
				...parseRuleCatalog(yaml, {
					pack: pack?.kind === 'file' ? pack.id : packIdFromFile(path.basename(file)),
					set: pack?.set ?? '',
				}),
			);
		}
		return rules;
	}

	async run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult> {
		if (request.packs.length === 0) {
			return { status: 'ok', exitCode: 0, findings: [], stderrTail: `No Semgrep rules under ${RULES_DIR}/` };
		}
		const args = [
			...request.packs.flatMap((pack) => ['--config', pack.path]),
			'--json',
			'--quiet',
			'--metrics',
			'off',
			'--timeout',
			String(PER_FILE_TIMEOUT_SECONDS),
			...(request.exclude ?? []).flatMap((dir) => ['--exclude', dir]),
			// `--` ends option parsing: a target such as `--output=…` is treated as a path, never an option.
			'--',
			...(request.paths?.length ? request.paths : ['.']),
		];
		const cwd = request.targetRoot ?? request.repoRoot;
		if (cwd !== request.repoRoot) await this.copyIgnoreFile(request.repoRoot, cwd);
		// Semgrep may exit non-zero when it finds violations, so read the JSON regardless of the code.
		const { code, stdout, stderr } = await this.process.run('semgrep', args, { cwd, timeoutMs: request.timeoutMs });
		const raw = parseSemgrepJson(stdout);
		const findings = parseFindings(raw, request.rules);
		// Exit codes ≥ 2 are Semgrep errors (bad rule, missing target…); with no results it produced nothing usable.
		const failed = raw === undefined || (code >= 2 && findings.length === 0);
		// `--quiet` keeps stderr empty; the reasons are in the JSON `errors`.
		const errors = semgrepErrors(raw);
		return {
			status: failed ? 'failed' : 'ok',
			exitCode: code,
			findings,
			stderrTail: [errors, stderr].filter(Boolean).join('\n').slice(-2000),
		};
	}

	authoringGuide(): readonly string[] {
		return [
			`Create \`${RULES_DIR}/architecture/\` (boundary, layer, dependency and taint rules that match the real structure) and \`${RULES_DIR}/standards/\` (coding-standard rules that match how this repo writes code).`,
			'Write Semgrep YAML: `rules:` entries with `id`, `languages`, `severity` (ERROR / WARNING / INFO), `message`, and `pattern` / `patterns` / `mode: taint`.',
			'Put ADR links in `metadata.adr` and a `metadata.category`, so the dashboard can group drift by decision.',
			'Use `paths.include` / `paths.exclude` that match this repo (do not hardcode another monorepo’s layout).',
			'Check the rules with `semgrep --validate --config .semgrep` before finishing.',
		];
	}

	/** Keep the repo's `.semgrepignore` when scanning files copied elsewhere. */
	private async copyIgnoreFile(repoRoot: string, targetRoot: string): Promise<void> {
		const source = path.join(repoRoot, '.semgrepignore');
		const target = path.join(targetRoot, '.semgrepignore');
		await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL).catch(() => undefined);
	}

	private isRuleFolder(name: string): boolean {
		return !name.startsWith('.') && name !== 'node_modules' && !IGNORED_SETS.has(name);
	}

	private async ruleFilesUnder(dir: string): Promise<string[]> {
		const out: string[] = [];
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && this.isRuleFolder(entry.name)) {
				out.push(...(await this.ruleFilesUnder(full)));
			} else if (entry.isFile() && isRuleFile(entry.name)) {
				out.push(full);
			}
		}
		return out.sort();
	}
}
