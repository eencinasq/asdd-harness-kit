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
 * Every environment variable the server reads, validated once at startup.
 * `KNOWLEDGE_EMBEDDINGS_*` are not here: they are read on every search (env, then `.env` / `.env.local` in HARNESS_ROOT).
 */
export const EnvSchema = z
	.object({
		/** HTTP transport port. */
		PORT: z.coerce.number().int().min(0).max(65_535).default(3012),
		/** HTTP bind address. Loopback by default. */
		HOST: z.string().min(1).default('127.0.0.1'),
		/** Shared secret for the HTTP transport (`X-Api-Key` or `Authorization: Bearer`). Required off-loopback. */
		MCP_API_KEY: z.string().min(16, 'MCP_API_KEY must be at least 16 characters').optional(),
		/** Extra browser origins allowed to call /mcp (comma-separated hostnames). Localhost is always allowed. */
		MCP_ALLOWED_ORIGINS: commaList,

		/** Repo with the asdd-harness-kit installed. Defaults to the working directory. */
		HARNESS_ROOT: z
			.string()
			.min(1)
			.default(process.cwd())
			.transform((value) => path.resolve(value)),
	})
	.refine((env) => isLoopbackHost(env.HOST) || env.MCP_API_KEY !== undefined, {
		path: ['MCP_API_KEY'],
		message: 'required when HOST is not a loopback address',
	});

export type Env = z.infer<typeof EnvSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
	const result = EnvSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
	}
	return result.data;
};
