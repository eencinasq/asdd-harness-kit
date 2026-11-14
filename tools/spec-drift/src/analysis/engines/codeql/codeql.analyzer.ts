import fs from 'node:fs/promises';
import os from 'node:os';
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
import { detectLanguage, parseQuery, QUERY_EXT, sarifFindings } from './codeql-queries.ts';

const RULES_DIR = 'codeql';

/**
 * CodeQL adapter for the CodeAnalyzer port (spec-drift-demand REQ-005): queries under `<repo>/codeql/` — each top-level
 * folder a set, each `.ql` / `.qls` a pack — run with `codeql database create` and `codeql database analyze` to SARIF.
 * The language is `CODEQL_LANGUAGE`, else the repository's most common one. The database lives in a temporary folder.
 */
@Injectable()
export class CodeqlAnalyzer implements CodeAnalyzer {
	readonly engine: EngineInfo = { id: 'codeql', name: 'CodeQL', rulesDir: RULES_DIR };

	constructor(@Inject(ProcessRunner) private readonly process: ProcessRunner) {}

	private async queriesUnder(dir: string): Promise<string[]> {
		const out: string[] = [];
		for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && !entry.name.startsWith('.')) out.push(...(await this.queriesUnder(full)));
			else if (entry.isFile() && QUERY_EXT.test(entry.name)) out.push(full);
		}
		return out.sort();
	}

	async inspect(repoRoot: string): Promise<RulesLocation> {
		const rulesDir = path.join(repoRoot, RULES_DIR);
		const stat = await fs.stat(rulesDir).catch(() => null);
		if (!stat?.isDirectory()) return { rulesDir, exists: false, ruleFiles: [] };
		return {
			rulesDir,
			exists: true,
			ruleFiles: (await this.queriesUnder(rulesDir)).map((f) => path.relative(rulesDir, f)),
		};
	}

	async listPacks(repoRoot: string): Promise<RulePack[]> {
		const rulesDir = path.join(repoRoot, RULES_DIR);
		const packs: RulePack[] = [];
		const entries = await fs.readdir(rulesDir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(rulesDir, entry.name);
			if (entry.isDirectory() && !entry.name.startsWith('.')) {
				const files = await this.queriesUnder(full);
				if (!files.length) continue;
				packs.push({ id: entry.name, kind: 'set', path: full, set: entry.name, files });
				for (const file of files) {
					packs.push({
						id: path.basename(file).replace(QUERY_EXT, ''),
						kind: 'file',
						path: file,
						set: entry.name,
						files: [file],
					});
				}
			} else if (entry.isFile() && QUERY_EXT.test(entry.name)) {
				packs.push({ id: entry.name.replace(QUERY_EXT, ''), kind: 'file', path: full, set: '', files: [full] });
			}
		}
		return packs;
	}

	async loadRules(packs: readonly RulePack[]): Promise<RuleMeta[]> {
		const owner = new Map<string, RulePack>();
		for (const pack of packs)
			for (const file of pack.files) if (pack.kind === 'file' || !owner.has(file)) owner.set(file, pack);
		const rules: RuleMeta[] = [];
		for (const file of ruleFilesOf(packs)) {
			if (!file.endsWith('.ql')) continue;
			const pack = owner.get(file);
			const rule = parseQuery(await fs.readFile(file, 'utf8').catch(() => ''), pack?.id ?? '', pack?.set ?? '');
			if (rule) rules.push(rule);
		}
		return rules;
	}

	/** Builds the database and runs the queries; rejects when the `codeql` CLI cannot be started. */
	async run(request: AnalyzerRunRequest): Promise<AnalyzerRunResult> {
		const queries = ruleFilesOf(request.packs);
		if (!queries.length)
			return { status: 'ok', exitCode: 0, findings: [], stderrTail: `No CodeQL queries under ${RULES_DIR}/` };
		const source = request.targetRoot ?? request.repoRoot;
		const language = process.env['CODEQL_LANGUAGE'] || detectLanguage(await this.sourceFiles(request.repoRoot));
		if (!language) {
			return { status: 'failed', exitCode: 1, findings: [], stderrTail: 'No CodeQL language: set CODEQL_LANGUAGE.' };
		}
		const work = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-drift-codeql-'));
		const db = path.join(work, 'db');
		const sarif = path.join(work, 'results.sarif');
		try {
			const create = await this.exec(
				['database', 'create', db, `--language=${language}`, `--source-root=${source}`, '--overwrite'],
				request,
			);
			if (create.code !== 0)
				return { status: 'failed', exitCode: create.code ?? 1, findings: [], stderrTail: create.stderr.slice(-2000) };
			const analyze = await this.exec(
				['database', 'analyze', db, '--format=sarif-latest', `--output=${sarif}`, '--', ...queries],
				request,
			);
			const text = await fs.readFile(sarif, 'utf8').catch(() => null);
			if (analyze.code !== 0 || text === null) {
				return { status: 'failed', exitCode: analyze.code ?? 1, findings: [], stderrTail: analyze.stderr.slice(-2000) };
			}
			const exclude = (request.exclude ?? []).map((e) => e.replace(/\/+$/, ''));
			const wanted = request.paths?.filter((p) => p !== '.') ?? [];
			const findings = sarifFindings(JSON.parse(text), request.rules).filter(
				(f) =>
					!exclude.some((e) => f.path === e || f.path.startsWith(`${e}/`)) &&
					(!wanted.length || wanted.some((p) => f.path === p || f.path.startsWith(`${p.replace(/\/+$/, '')}/`))),
			);
			return { status: 'ok', exitCode: findings.length ? 1 : 0, findings, stderrTail: analyze.stderr.slice(-2000) };
		} finally {
			await fs.rm(work, { recursive: true, force: true });
		}
	}

	/** Tracked files, or (outside git) the files under the repository, for language detection. */
	private async sourceFiles(repoRoot: string): Promise<string[]> {
		const listed = await this.process.run('git', ['ls-files'], { cwd: repoRoot }).catch(() => null);
		if (listed?.code === 0) return listed.stdout.split('\n').filter(Boolean);
		const out: string[] = [];
		const walk = async (dir: string, depth: number): Promise<void> => {
			if (depth > 6 || out.length > 5000) return;
			for (const entry of await fs.readdir(path.join(repoRoot, dir), { withFileTypes: true }).catch(() => [])) {
				if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === RULES_DIR) continue;
				const rel = dir ? `${dir}/${entry.name}` : entry.name;
				if (entry.isDirectory()) await walk(rel, depth + 1);
				else out.push(rel);
			}
		};
		await walk('', 0);
		return out;
	}

	private async exec(args: string[], request: AnalyzerRunRequest) {
		try {
			return await this.process.run('codeql', args, { cwd: request.repoRoot, timeoutMs: request.timeoutMs });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(
					'The codeql CLI is not installed or not on PATH (https://github.com/github/codeql-cli-binaries).',
				);
			}
			throw error;
		}
	}

	authoringGuide(): readonly string[] {
		return [
			`Create \`${RULES_DIR}/architecture/\` and \`${RULES_DIR}/standards/\` with CodeQL queries (\`.ql\`) and a \`qlpack.yml\` that depends on the language pack (e.g. \`codeql/javascript-all\`).`,
			'Give each query a QLDoc header: `@name`, `@kind problem`, `@problem.severity error|warning|recommendation`, `@id <stable id>`, and `@tags` with `adr:ADR-0007` to link its ADR.',
			'Write `select <element>, "<message>"` so each result has a location and a message.',
		];
	}
}
