/**
 * Read-only reconnaissance for a security audit (security-review REQ-002): from the repository's tracked file list and a
 * reader for a few manifests, name the languages, the security-relevant surfaces (with the evidence for each), and the
 * methodology checklists that apply. Pure: the caller lists files and reads them; nothing here touches the disk.
 */
import path from 'node:path';

/** Always part of a run: the skill's principles, reconnaissance, attack classes, hunting, and validation. */
export const BASE_CHECKLISTS = [
	'core',
	'reconnaissance',
	'attack-classes',
	'hunting',
	'validation-and-reporting',
] as const;

export type Surface =
	| 'http-server'
	| 'frontend'
	| 'llm'
	| 'database'
	| 'messaging-rpc'
	| 'supply-chain'
	| 'deployment'
	| 'desktop-mobile'
	| 'native';

/** Which checklists a surface adds (order of the final list follows the methodology's order). */
const CHECKLISTS_FOR: Record<Surface, readonly string[]> = {
	'http-server': ['web-protocol-and-auth', 'resource-exhaustion-and-availability'],
	frontend: ['client-side'],
	llm: ['ai-and-llm'],
	database: ['data-isolation-and-lifecycle'],
	'messaging-rpc': ['protocols-rpc-and-messaging', 'resource-exhaustion-and-availability'],
	'supply-chain': ['supply-chain-and-release'],
	deployment: ['cloud-and-deployment'],
	'desktop-mobile': ['desktop-mobile-and-local-ipc'],
	native: ['memory-safety-and-binary'],
};

const ORDER = [
	...BASE_CHECKLISTS,
	'web-protocol-and-auth',
	'client-side',
	'protocols-rpc-and-messaging',
	'data-isolation-and-lifecycle',
	'supply-chain-and-release',
	'cloud-and-deployment',
	'ai-and-llm',
	'resource-exhaustion-and-availability',
	'desktop-mobile-and-local-ipc',
	'memory-safety-and-binary',
];

const LANGUAGE_BY_EXT: Record<string, string> = {
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.mts': 'typescript',
	'.cts': 'typescript',
	'.js': 'javascript',
	'.jsx': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.py': 'python',
	'.go': 'go',
	'.rs': 'rust',
	'.java': 'java',
	'.kt': 'kotlin',
	'.swift': 'swift',
	'.rb': 'ruby',
	'.php': 'php',
	'.cs': 'csharp',
	'.c': 'c',
	'.h': 'c',
	'.cc': 'cpp',
	'.cpp': 'cpp',
	'.hpp': 'cpp',
	'.zig': 'zig',
};

/** Package names (any ecosystem) that reveal a surface; matched as whole names in manifests. */
const PACKAGES: Partial<Record<Surface, readonly string[]>> = {
	'http-server': [
		'express',
		'fastify',
		'koa',
		'@hapi/hapi',
		'@nestjs/core',
		'@nestjs/platform-express',
		'next',
		'hono',
		'flask',
		'django',
		'fastapi',
		'starlette',
		'github.com/gin-gonic/gin',
		'github.com/labstack/echo',
		'actix-web',
		'axum',
		'spring-boot-starter-web',
		'rails',
		'sinatra',
	],
	frontend: ['react', 'react-dom', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'],
	llm: [
		'openai',
		'@anthropic-ai/sdk',
		'anthropic',
		'langchain',
		'@langchain/core',
		'llamaindex',
		'@google/generative-ai',
		'@modelcontextprotocol/sdk',
		'@modelcontextprotocol/server',
		'transformers',
	],
	database: [
		'pg',
		'mysql',
		'mysql2',
		'sqlite3',
		'better-sqlite3',
		'prisma',
		'@prisma/client',
		'typeorm',
		'sequelize',
		'mongoose',
		'mongodb',
		'knex',
		'drizzle-orm',
		'redis',
		'ioredis',
		'sqlalchemy',
		'psycopg2',
		'psycopg',
		'pymongo',
		'gorm.io/gorm',
		'diesel',
		'sqlx',
	],
	'messaging-rpc': [
		'@grpc/grpc-js',
		'grpcio',
		'google.golang.org/grpc',
		'graphql',
		'@apollo/server',
		'kafkajs',
		'amqplib',
		'ws',
		'socket.io',
		'nats',
		'celery',
		'@modelcontextprotocol/sdk',
		'@modelcontextprotocol/server',
		'@nestjs/mcp',
	],
	'desktop-mobile': ['electron', '@tauri-apps/api', 'react-native', 'expo', '@capacitor/core', 'tauri'],
};

const MANIFEST_RE =
	/(?:^|\/)(?:package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|Gemfile|composer\.json)$/;
const LOCKFILE_RE =
	/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const DEPLOY_RE =
	/(?:^|\/)(?:Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Chart\.yaml|wrangler\.toml|serverless\.ya?ml|fly\.toml|vercel\.json|netlify\.toml|app\.yaml|[^/]+\.tf|kustomization\.ya?ml)$/;
const WORKFLOW_RE = /^\.github\/workflows\/[^/]+\.ya?ml$|(?:^|\/)\.gitlab-ci\.yml$|(?:^|\/)Jenkinsfile$/;
const HTTP_PATH_RE = /(?:^|\/)(?:routes?|controllers?|handlers?|api|endpoints?)\//;
const FRONTEND_FILE_RE = /\.(?:tsx|jsx|vue|svelte|html)$/;
const RPC_FILE_RE = /\.(?:proto|graphql|gql)$/;
const MIGRATION_RE = /(?:^|\/)migrations?\//;
const MOBILE_FILE_RE = /(?:^|\/)(?:AndroidManifest\.xml|Info\.plist)$|\.swift$/;
const NATIVE_EXT = new Set(['.c', '.h', '.cc', '.cpp', '.hpp', '.zig']);
/** Manifests read per run: enough to see a monorepo's packages without reading the whole tree. */
const MAX_MANIFESTS = 60;

export type ReconResult = {
	readonly files: number;
	readonly languages: Readonly<Record<string, number>>;
	readonly surfaces: readonly Surface[];
	/** Why each surface was detected (file or `manifest: package`), at most 5 per surface. */
	readonly evidence: Readonly<Partial<Record<Surface, readonly string[]>>>;
	readonly checklists: readonly string[];
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Package names a manifest declares (JSON dependency keys; other formats by whole-name text match). */
const declares = (manifestPath: string, text: string, name: string): boolean => {
	if (manifestPath.endsWith('package.json') || manifestPath.endsWith('composer.json')) {
		try {
			const json = JSON.parse(text) as Record<string, unknown>;
			return [
				'dependencies',
				'devDependencies',
				'peerDependencies',
				'optionalDependencies',
				'require',
				'require-dev',
			].some((k) => {
				const deps = json[k];
				return Boolean(deps && typeof deps === 'object' && name in (deps as Record<string, unknown>));
			});
		} catch {
			return false;
		}
	}
	const n = escapeRe(name);
	if (manifestPath.endsWith('pom.xml')) return new RegExp(`<artifactId>\\s*${n}\\s*</artifactId>`).test(text);
	if (/build\.gradle(?:\.kts)?$/.test(manifestPath)) return new RegExp(`["':]${n}(?::|["'])`).test(text);
	if (manifestPath.endsWith('Gemfile')) return new RegExp(`^\\s*gem\\s+["']${n}["']`, 'm').test(text);
	if (manifestPath.endsWith('go.mod')) return new RegExp(`^\\s*(?:require\\s+)?${n}\\s+v`, 'm').test(text);
	// requirements*.txt, Pipfile, pyproject.toml, Cargo.toml: the name opens a line or a quoted array entry.
	return new RegExp(`^\\s*["']?${n}(?:\\[[^\\]]*\\])?\\s*(?:[=<>~!;,"']|$)`, 'mi').test(text);
};

export const recon = (files: readonly string[], read: (rel: string) => string | null): ReconResult => {
	const languages: Record<string, number> = {};
	const evidence: Partial<Record<Surface, string[]>> = {};
	const note = (surface: Surface, why: string): void => {
		const list = evidence[surface] ?? [];
		if (list.length < 5 && !list.includes(why)) list.push(why);
		evidence[surface] = list;
	};

	const manifests: string[] = [];
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		const language = LANGUAGE_BY_EXT[ext];
		if (language) languages[language] = (languages[language] ?? 0) + 1;
		if (MANIFEST_RE.test(file)) {
			manifests.push(file);
			note('supply-chain', file);
		}
		if (LOCKFILE_RE.test(file)) note('supply-chain', file);
		if (WORKFLOW_RE.test(file)) {
			note('supply-chain', file);
			note('deployment', file);
		}
		if (DEPLOY_RE.test(file)) note('deployment', file);
		if (HTTP_PATH_RE.test(file) && language) note('http-server', file);
		if (FRONTEND_FILE_RE.test(file)) note('frontend', file);
		if (RPC_FILE_RE.test(file)) note('messaging-rpc', file);
		if (MIGRATION_RE.test(file)) note('database', file);
		if (MOBILE_FILE_RE.test(file)) note('desktop-mobile', file);
		if (NATIVE_EXT.has(ext)) note('native', file);
	}

	for (const manifest of manifests.slice(0, MAX_MANIFESTS)) {
		const text = read(manifest);
		if (!text) continue;
		for (const [surface, names] of Object.entries(PACKAGES) as [Surface, readonly string[]][]) {
			for (const name of names) {
				if (declares(manifest, text, name)) note(surface, `${manifest}: ${name}`);
			}
		}
	}

	const surfaces = (Object.keys(CHECKLISTS_FOR) as Surface[]).filter((s) => evidence[s]?.length);
	const selected = new Set<string>([...BASE_CHECKLISTS, ...surfaces.flatMap((s) => CHECKLISTS_FOR[s])]);
	return {
		files: files.length,
		languages,
		surfaces,
		evidence,
		checklists: ORDER.filter((id) => selected.has(id)),
	};
};
