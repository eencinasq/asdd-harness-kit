/**
 * Security lens for PR review (security-review REQ-007, REQ-008). Pure: from a review group's files and diff, name the
 * security-relevant surfaces it touches and the methodology checklists that apply, render the `<security>` block the
 * next-group instruction carries, and decide whether a `category: security` finding has the evidence it needs.
 */
import { checklistById } from './checklists.ts';

type SurfaceRule = {
	readonly id: string;
	readonly label: string;
	readonly checklists: readonly string[];
	readonly path?: RegExp;
	readonly added?: RegExp;
};

const SURFACES: readonly SurfaceRule[] = [
	{
		id: 'auth',
		label: 'authentication / authorization',
		checklists: ['web-protocol-and-auth'],
		path: /(?:^|\/)(?:auth|login|logout|session|oauth|sso|jwt|passport|permissions?|acl|rbac|guards?)(?:[./_-]|\/)/i,
		added:
			/\b(?:jwt|bcrypt|argon2|passport|authenticate|authoriz(?:e|ation)|set-cookie|session(?:Id)?|password|csrf|isAdmin|role)\b/i,
	},
	{
		id: 'crypto',
		label: 'cryptography / randomness',
		checklists: ['attack-classes'],
		added:
			/\b(?:createHash|createHmac|createCipher(?:iv)?|createDecipher(?:iv)?|randomBytes|Math\.random|hashlib|Crypto\.|cipher|encrypt|decrypt|sign\(|verify\()\b/,
	},
	{
		id: 'deserialization',
		label: 'deserialization',
		checklists: ['attack-classes'],
		added: /\b(?:pickle\.loads?|yaml\.load|unserialize|ObjectInputStream|readObject|Marshal\.load|deserializ\w*)\b/,
	},
	{
		id: 'injection',
		label: 'SQL / command / path building',
		checklists: ['attack-classes', 'web-protocol-and-auth'],
		added:
			/(?:\.query\(|\.execute\(|\.raw\(|\bexec(?:Sync)?\(|\bspawn\(|child_process|subprocess|os\.system|path\.(?:join|resolve)\(|readFile(?:Sync)?\(|sendFile\(|\.download\(|eval\(|new Function\()/,
	},
	{
		id: 'http-handler',
		label: 'HTTP handlers / middleware',
		checklists: ['web-protocol-and-auth', 'resource-exhaustion-and-availability'],
		path: /(?:^|\/)(?:routes?|controllers?|handlers?|middlewares?|api|endpoints?)(?:\/|\.)/i,
		added:
			/(?:\b(?:app|router|server)\.(?:get|post|put|patch|delete|use|all)\(|@(?:Get|Post|Put|Patch|Delete|Controller)\(|@app\.route\(|fastify\.\w+\()/,
	},
	{
		id: 'client',
		label: 'browser-side rendering / messaging',
		checklists: ['client-side'],
		added:
			/\b(?:innerHTML|outerHTML|dangerouslySetInnerHTML|document\.write|postMessage|localStorage|sessionStorage|window\.open)\b/,
	},
	{
		id: 'secrets',
		label: 'secrets / credentials',
		checklists: ['cloud-and-deployment', 'supply-chain-and-release'],
		path: /(?:^|\/)(?:\.env(?:\.[\w-]+)?|credentials?(?:\.\w+)?|secrets?(?:\.\w+)?|[\w-]+\.pem|id_rsa)$/i,
		added: /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
	},
	{
		id: 'ci',
		label: 'CI / release workflows',
		checklists: ['supply-chain-and-release'],
		path: /^\.github\/workflows\/|(?:^|\/)\.gitlab-ci\.yml$|(?:^|\/)Jenkinsfile$/,
	},
	{
		id: 'dependencies',
		label: 'dependency manifests / lockfiles',
		checklists: ['supply-chain-and-release'],
		path: /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|go\.(?:mod|sum)|Cargo\.(?:toml|lock)|pom\.xml|build\.gradle(?:\.kts)?|Gemfile(?:\.lock)?|composer\.(?:json|lock))$/,
	},
	{
		id: 'llm',
		label: 'LLM / agent calls',
		checklists: ['ai-and-llm'],
		added:
			/(?:\bopenai\b|@anthropic-ai|\banthropic\b|messages\.create\(|chat\.completions|\bsystem_prompt\b|\bsystemPrompt\b|tool_choice|@modelcontextprotocol)/i,
	},
	{
		id: 'deployment',
		label: 'deployment / infrastructure',
		checklists: ['cloud-and-deployment'],
		path: /(?:^|\/)(?:Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|[^/]+\.tf|Chart\.yaml|wrangler\.toml|serverless\.ya?ml|fly\.toml|kustomization\.ya?ml)$/,
	},
];

export type LensSurface = {
	readonly id: string;
	readonly label: string;
	readonly checklists: readonly string[];
	readonly files: readonly string[];
};

export type SecurityLens = {
	readonly surfaces: readonly LensSurface[];
	readonly checklists: readonly string[];
};

/** Added lines of a unified diff, per file (`+++ b/<path>` headers). */
const addedLinesByFile = (diff: string): Map<string, string> => {
	const out = new Map<string, string>();
	let current: string | null = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) {
			const name = line.slice(4).trim();
			current = name === '/dev/null' ? null : name.replace(/^b\//, '');
			continue;
		}
		if (current && line.startsWith('+') && !line.startsWith('+++')) {
			out.set(current, `${out.get(current) ?? ''}${line.slice(1)}\n`);
		}
	}
	return out;
};

export const securityLens = (files: readonly string[], diff: string): SecurityLens => {
	const added = addedLinesByFile(diff);
	const surfaces: LensSurface[] = [];
	for (const rule of SURFACES) {
		const hit = files.filter(
			(file) => Boolean(rule.path?.test(file)) || Boolean(rule.added?.test(added.get(file) ?? '')),
		);
		if (hit.length) surfaces.push({ id: rule.id, label: rule.label, checklists: rule.checklists, files: hit });
	}
	const checklists = [...new Set(surfaces.flatMap((s) => s.checklists))];
	return { surfaces, checklists };
};

const MAX_FILES_SHOWN = 3;

/** The `<security>` block of a next-group instruction; empty when the group touches no security surface. */
export const securityBlock = (lens: SecurityLens): string => {
	if (!lens.surfaces.length) return '';
	const touched = lens.surfaces
		.map((s) => {
			const shown = s.files.slice(0, MAX_FILES_SHOWN).join(', ');
			const more = s.files.length > MAX_FILES_SHOWN ? ` +${s.files.length - MAX_FILES_SHOWN}` : '';
			return `${s.label} (${shown}${more})`;
		})
		.join('; ');
	const lists = lens.checklists.map((id) => `${id} — ${checklistById(id)?.title ?? id}`).join('; ');
	return [
		'<security>',
		`This group touches security-relevant code: ${touched}.`,
		`Review it with these checklists of the security methodology (cloudflare/security-audit-skill; read one with security_audit_checklist when that tool is available): ${lists}.`,
		'Report a vulnerability only when it crosses a real trust boundary: a security finding uses category "security", and its evidence must name the affected principal or trust boundary and the path from entrypoint to sink with file:line locations (read code with pr_review_read_file). A security finding without both is dropped.',
		'Source inspection only: do not run the code, call endpoints, or use the network.',
		'</security>',
	].join('\n');
};

const BOUNDARY_RE =
	/\b(?:principal|trust boundary|boundary|attacker|untrusted|unauthenticated|authenticated|anonymous|tenant|user-controlled|caller|privilege|role|cross-site|external input|request (?:body|param|query|header))\b/i;
const LOCATION_RE = /[\w./-]+\.[A-Za-z0-9]+:\d+/;

/** Why a PR finding cannot be kept as a security finding (REQ-008), or null when it can (or is not one). */
export const prSecurityFindingProblem = (finding: {
	readonly category?: string;
	readonly evidence?: string;
}): string | null => {
	if (finding.category !== 'security') return null;
	const evidence = finding.evidence?.trim() ?? '';
	if (!evidence) {
		return 'security finding with no evidence: name the affected principal or trust boundary and the entrypoint → sink with file:line';
	}
	if (!BOUNDARY_RE.test(evidence)) {
		return 'security finding evidence names no affected principal or trust boundary';
	}
	if (!LOCATION_RE.test(evidence)) {
		return 'security finding evidence has no file:line location for the entrypoint or sink';
	}
	return null;
};
