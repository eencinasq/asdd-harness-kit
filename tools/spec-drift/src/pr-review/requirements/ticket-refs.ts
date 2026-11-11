/** Spot ticket references in a PR, and read the facts the diff alone can tell about "done". Pure. */
import type { DoneSignals, TicketRef } from './requirements.types.ts';

/** `MLC-123`, `ENG-7` (Jira and Linear share the shape). Excludes things like `UTF-8`, `ISO-8601`. */
const KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;
const NOT_TICKETS = new Set(['UTF', 'ISO', 'SHA', 'RFC', 'ES', 'TLS', 'HTTP', 'CVE', 'GPT']);
/** `Closes #45`, `fixes acme/api#45`, `resuelve #45`. */
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|cierra|resuelve|soluciona)\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/gi;

export const detectTicketRefs = (pr: {
	readonly title: string;
	readonly headRefName: string;
	readonly body?: string;
}): TicketRef[] => {
	const refs: TicketRef[] = [];
	const add = (ref: TicketRef) => {
		if (!refs.some((r) => r.ref.toUpperCase() === ref.ref.toUpperCase())) refs.push(ref);
	};
	const sources = [
		['title', pr.title],
		['branch', pr.headRefName.toUpperCase()],
		['body', pr.body ?? ''],
	] as const;
	for (const [foundIn, text] of sources) {
		for (const match of text.matchAll(CLOSING)) add({ source: 'github', ref: match[1] ?? '', foundIn });
		for (const match of text.matchAll(KEY)) {
			const key = match[1] ?? '';
			if (!NOT_TICKETS.has(key.split('-')[0] ?? '')) add({ source: 'jira-or-linear', ref: key, foundIn });
		}
	}
	return refs;
};

const TEST_FILE =
	/(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec|e2e-spec|test-d)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt|cs)$/i;
const DOC_FILE = /\.(md|mdx|rst|adoc)$|(^|\/)docs?\//i;
const MIGRATION_FILE = /(^|\/)(migrations?|migrate|db\/migrate|flyway|liquibase)\//i;
const CONFIG_FILE = /(^|\/)(\.env[^/]*|[^/]+\.(ya?ml|toml|ini)|Dockerfile|docker-compose[^/]*|[^/]*\.tf)$/i;

export const doneSignals = (files: readonly string[]): DoneSignals => ({
	testFiles: files.filter((f) => TEST_FILE.test(f)),
	docFiles: files.filter((f) => DOC_FILE.test(f)),
	migrationFiles: files.filter((f) => MIGRATION_FILE.test(f)),
	configFiles: files.filter((f) => CONFIG_FILE.test(f) && !DOC_FILE.test(f)),
});
