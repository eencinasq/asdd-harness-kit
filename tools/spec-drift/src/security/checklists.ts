/**
 * The vendored cloudflare/security-audit-skill methodology (security-review REQ-001, REQ-003): checklist ids, titles and
 * paged text. Files live in `methodology/` next to this module; the build copies them to `dist/server/methodology/`,
 * where the bundled module resolves the same relative path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const METHODOLOGY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'methodology');

/** Characters per checklist page: keeps one page well under a host's tool-result limits. */
export const CHECKLIST_PAGE_CHARS = 6000;

/** The skill's own SKILL.md: principles, execution safety, workflow. Always part of a run. */
export const CORE_ID = 'core';

export type Checklist = {
	readonly id: string;
	readonly title: string;
	readonly file: string;
};

export const CHECKLISTS: readonly Checklist[] = [
	{ id: CORE_ID, title: 'Core principles and workflow', file: 'SKILL.md' },
	{ id: 'reconnaissance', title: 'Reconnaissance', file: 'RECONNAISSANCE.md' },
	{ id: 'attack-classes', title: 'Attack classes', file: 'ATTACK-CLASSES.md' },
	{ id: 'hunting', title: 'Hunting', file: 'HUNTING.md' },
	{ id: 'validation-and-reporting', title: 'Validation and reporting', file: 'VALIDATION-AND-REPORTING.md' },
	{ id: 'web-protocol-and-auth', title: 'Web, protocol and auth', file: 'WEB-PROTOCOL-AND-AUTH.md' },
	{ id: 'client-side', title: 'Client side', file: 'CLIENT-SIDE.md' },
	{ id: 'protocols-rpc-and-messaging', title: 'Protocols, RPC and messaging', file: 'PROTOCOLS-RPC-AND-MESSAGING.md' },
	{
		id: 'data-isolation-and-lifecycle',
		title: 'Data isolation and lifecycle',
		file: 'DATA-ISOLATION-AND-LIFECYCLE.md',
	},
	{ id: 'supply-chain-and-release', title: 'Supply chain and release', file: 'SUPPLY-CHAIN-AND-RELEASE.md' },
	{ id: 'cloud-and-deployment', title: 'Cloud and deployment', file: 'CLOUD-AND-DEPLOYMENT.md' },
	{ id: 'ai-and-llm', title: 'AI and LLM', file: 'AI-AND-LLM.md' },
	{
		id: 'resource-exhaustion-and-availability',
		title: 'Resource exhaustion and availability',
		file: 'RESOURCE-EXHAUSTION-AND-AVAILABILITY.md',
	},
	{
		id: 'desktop-mobile-and-local-ipc',
		title: 'Desktop, mobile and local IPC',
		file: 'DESKTOP-MOBILE-AND-LOCAL-IPC.md',
	},
	{ id: 'memory-safety-and-binary', title: 'Memory safety and binary', file: 'MEMORY-SAFETY-AND-BINARY.md' },
];

/** Absolute path of a vendored methodology file (checklist, schema, validator). */
export const methodologyFile = (name: string): string => path.join(METHODOLOGY_DIR, name);

export const checklistById = (id: string): Checklist | undefined => CHECKLISTS.find((c) => c.id === id);

/** Split text into pages of at most `size` characters, on line boundaries when possible. */
const paginate = (text: string, size: number): string[] => {
	const pages: string[] = [];
	let current = '';
	for (const line of text.split('\n')) {
		const piece = `${line}\n`;
		if (current.length + piece.length > size && current) {
			pages.push(current);
			current = '';
		}
		if (piece.length > size) {
			for (let i = 0; i < piece.length; i += size) pages.push(piece.slice(i, i + size));
			continue;
		}
		current += piece;
	}
	if (current) pages.push(current);
	return pages.length ? pages : [''];
};

const cache = new Map<string, string[]>();

/** One page (1-based) of a checklist; throws with the valid ids when the id is unknown. */
export const checklistPage = (
	id: string,
	page = 1,
): {
	readonly id: string;
	readonly title: string;
	readonly page: number;
	readonly pages: number;
	readonly text: string;
} => {
	const checklist = checklistById(id);
	if (!checklist) {
		throw new Error(`Unknown checklist '${id}'. Valid ids: ${CHECKLISTS.map((c) => c.id).join(', ')}.`);
	}
	let pages = cache.get(id);
	if (!pages) {
		pages = paginate(readFileSync(methodologyFile(checklist.file), 'utf8'), CHECKLIST_PAGE_CHARS);
		cache.set(id, pages);
	}
	const index = Math.min(Math.max(1, Math.trunc(page)), pages.length);
	return { id, title: checklist.title, page: index, pages: pages.length, text: pages[index - 1] ?? '' };
};
