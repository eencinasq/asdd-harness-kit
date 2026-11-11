import os from 'node:os';
import path from 'node:path';
import * as z from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.has(host);

const commaList = z
	.string()
	.optional()
	.transform((value) =>
		value
			?.split(',')
			.map((item) => item.trim())
			.filter(Boolean),
	);

/**
 * Every environment variable the server reads, validated once at startup
 * (see `ConfigModule.forRoot({ validate })` in app.module.ts).
 * Read values through `ConfigService<Env, true>` instead of `process.env`.
 */
export const EnvSchema = z
	.object({
		/** HTTP transport port. */
		PORT: z.coerce.number().int().min(0).max(65_535).default(3010),
		/** HTTP bind address. Loopback by default: the tools run git/gh with your credentials. */
		HOST: z.string().min(1).default('127.0.0.1'),
		/** Shared secret for the HTTP transport (`X-Api-Key` or `Authorization: Bearer`). Required off-loopback. */
		MCP_API_KEY: z.string().min(16, 'MCP_API_KEY must be at least 16 characters').optional(),
		/** Extra browser origins allowed to call /mcp (comma-separated hostnames). Localhost is always allowed. */
		MCP_ALLOWED_ORIGINS: commaList,

		/** Repo whose rule packs (e.g. `.semgrep/`) the analysis dashboard tools run. Alias: SEMGREP_REPO_ROOT. */
		ANALYSIS_REPO_ROOT: z
			.string()
			.min(1)
			.default(process.cwd())
			.transform((value) => path.resolve(value)),

		/** Repo with the asdd-harness-kit installed (`.harness/`), for the audit tools. Defaults to the working directory. */
		HARNESS_ROOT: z
			.string()
			.min(1)
			.default(process.cwd())
			.transform((value) => path.resolve(value)),
		/** Semgrep binary for verify_architecture_rules. */
		HARNESS_SEMGREP: z.string().min(1).default('semgrep'),
		/** Timeout for the bound architecture Gate command, in seconds. */
		HARNESS_GATE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),

		/** Git repo to review when a tool call omits `repoPath` (defaults to the working directory). */
		PR_REVIEW_REPO: z.string().min(1).optional(),
		/** Where PR review artifacts go when the repo has no `.pr-review/` dir. */
		PR_REVIEW_ROOT: z.string().min(1).optional(),
		/** XDG state dir, used for the PR review fallback root when PR_REVIEW_ROOT is unset. */
		XDG_STATE_HOME: z.string().min(1).default(path.join(os.homedir(), '.local/state')),

		/** Default timeout for git / gh commands, in seconds. */
		COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
		/** Timeout for a whole analyzer run, in seconds. Alias: SEMGREP_TIMEOUT_SECONDS. */
		ANALYSIS_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),
	})
	.refine((env) => isLoopbackHost(env.HOST) || env.MCP_API_KEY !== undefined, {
		path: ['MCP_API_KEY'],
		message:
			'required when HOST is not a loopback address: anyone who can reach the port could run git/gh with your credentials',
	});

export type Env = z.infer<typeof EnvSchema>;

/** Old names still accepted (the new name wins when both are set). */
const ALIASES: Readonly<Record<string, string>> = {
	ANALYSIS_REPO_ROOT: 'SEMGREP_REPO_ROOT',
	ANALYSIS_TIMEOUT_SECONDS: 'SEMGREP_TIMEOUT_SECONDS',
};

export const validateEnv = (raw: Record<string, unknown>): Env => {
	const withAliases = { ...raw };
	for (const [name, alias] of Object.entries(ALIASES)) withAliases[name] ??= raw[alias];
	const result = EnvSchema.safeParse(withAliases);
	if (!result.success) {
		throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
	}
	return result.data;
};
