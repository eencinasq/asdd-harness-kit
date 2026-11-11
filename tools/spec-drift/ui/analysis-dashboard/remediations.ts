import type { Finding } from '../../src/analysis/analysis.types.ts';

export type Remediation = {
	readonly title: string;
	readonly steps: readonly string[];
	readonly references?: readonly string[];
};

type RemediationEntry = {
	readonly match: RegExp;
	readonly remediation: Remediation;
};

const CATALOG: readonly RemediationEntry[] = [
	{
		match: /arch\.taint\.request-to-raw-sql/,
		remediation: {
			title: 'Keep SQL parameterized',
			steps: [
				'Replace string-built SQL with Drizzle query builders (`eq`, `and`, `sql` with bound params).',
				'Never interpolate `@Body()` / `@Query()` / `@Param()` into `sql.raw()` or `.query(string)`.',
				'Validate inputs with Zod DTOs before they reach the repository.',
			],
			references: ['ADR-0013', 'infra-database AGENTS.md'],
		},
	},
	{
		match: /arch\.scaffold\.appid-not-from-route-or-body/,
		remediation: {
			title: 'Take appId from the JWT only',
			steps: [
				'Remove `appId` from route params and request bodies.',
				'Inject `@CurrentUser() caller: JwtPayload` and use `caller.client_id`.',
				'Protect the route with `@Authorize({ scope })` (or the correct Pattern D guards).',
			],
			references: ['AGENTS.md § Consumer SDK contract', 'privilege-escalation rule'],
		},
	},
	{
		match: /arch\.taint\.request-to-broker-publish/,
		remediation: {
			title: 'Publish only via the transactional outbox',
			steps: [
				'Stop calling Kafka/SNS/SQS clients from controllers or use cases.',
				'Persist the domain event with the mutation through the outbox port.',
				'Let the outbox relay publish asynchronously.',
			],
			references: ['ADR-0037'],
		},
	},
	{
		match: /arch\.taint\.request-to-logger|arch\.taint\.secret-to-logger/,
		remediation: {
			title: 'Keep logs allowlisted',
			steps: [
				'Log only request id, method and sanitized URL — never headers, body, IP or secrets.',
				'Pass explicit fields to PinoLogger; do not dump the whole request/config object.',
			],
			references: ['infra-logger AGENTS.md'],
		},
	},
	{
		match: /arch\.taint\.appid-from-client-to-tenant-key/,
		remediation: {
			title: 'Do not trust client-supplied appId as a tenant key',
			steps: [
				'Derive tenant/app identity from the verified JWT (`caller.client_id`).',
				'Reject or ignore `body.appId` / `params.appId` for authorization decisions.',
			],
			references: ['AGENTS.md § appId never in URL or body'],
		},
	},
	{
		match: /arch\.taint\.domain-nondeterminism/,
		remediation: {
			title: 'Inject time and ids through DomainDeps',
			steps: [
				'Replace `Date.now()` / `new Date()` / `Math.random()` / raw uuid calls in domain code.',
				'Use `deps.clock.now()` and `deps.idGenerator.next()` from domain-shared.',
				'In tests, pin with `FixedClock` / `SequentialIdGenerator`.',
			],
			references: ['ADR-0010', 'domain-shared'],
		},
	},
	{
		match: /arch\.scaffold\.no-raw-nest-factory/,
		remediation: {
			title: 'Boot through bootstrapApp',
			steps: [
				'Call `bootstrapApp` from `@core-domain-features/infra-http` in `main.ts`.',
				'Put shared Fastify/helmet/CORS/docs changes in `infra-http` bootstrap, not in one app.',
			],
			references: ['infra-http AGENTS.md'],
		},
	},
	{
		match: /arch\.scaffold\.zod-namespace-import/,
		remediation: {
			title: 'Namespace-import Zod',
			steps: [`Replace \`import { z } from 'zod'\` with \`import * as z from 'zod'\`.`],
			references: ['AGENTS.md § Zod'],
		},
	},
	{
		match: /arch\.scaffold\.http-handler-missing-auth/,
		remediation: {
			title: 'Declare auth on HTTP handlers',
			steps: [
				"Add `@Authorize({ scope: 'domain:resource:action' })` for app JWT endpoints.",
				'Or `@UseGuards(...)` explicitly for Pattern D / intentionally public routes.',
				'If public on purpose, document with a short `nosemgrep` reason.',
			],
			references: ['infra-auth-guard AGENTS.md'],
		},
	},
	{
		match:
			/arch\.boundary\.domain-no-infra|arch\.boundary\.domain-no-framework|arch\.boundary\.domain-no-relative-infra/,
		remediation: {
			title: 'Keep domain free of infrastructure',
			steps: [
				'Move Nest/Drizzle/HTTP imports out of domain/application into infrastructure adapters.',
				'Depend on ports (abstract classes) declared in domain; wire adapters in the app shell.',
			],
			references: ['ADR-0010'],
		},
	},
	{
		match: /arch\.netdb\.domain-no-|arch\.netdb\.require-create-http-client|arch\.netdb\.usecase-no-/,
		remediation: {
			title: 'Put I/O behind adapters / outbox',
			steps: [
				'Outbound HTTP: `createHttpClient` from infra-http-client inside infrastructure only.',
				'DB drivers stay in infrastructure repositories.',
				'Use cases write to outbox ports — never inject EventBus / Kafka clients.',
			],
			references: ['ADR-0010', 'ADR-0037', 'infra-http-client'],
		},
	},
	{
		match: /arch\.netdb\.notifications-no-kafka-consumer/,
		remediation: {
			title: 'Notifications stays HTTP-inbound',
			steps: [
				'Remove any Kafka consumer wiring from apps/notifications or context-notifications.',
				'Callers resolve domain events themselves and POST /api/v1/notifications.',
			],
			references: ['ADR-0039'],
		},
	},
	{
		match: /std\.no-try-catch/,
		remediation: {
			title: 'Prefer ResultAsync / tryit',
			steps: [
				'Use `ResultAsync.fromPromise(...)` for typed infrastructure failures.',
				'Use `tryit(...)()` from radashi for one-off side effects / bootstrap.',
			],
			references: ['AGENTS.md § Error handling'],
		},
	},
	{
		match: /std\.no-enum/,
		remediation: {
			title: 'Replace enum with as-const + Zod',
			steps: [
				'Define ` consT = [...] as const`, derive the type, and `z.enum(CONST)`.',
				'See FILE_STATUSES in context-storage.',
			],
		},
	},
	{
		match: /std\.no-non-null-assertion|std\.no-type-assertion|std\.no-any/,
		remediation: {
			title: 'Narrow instead of asserting',
			steps: [
				'Replace `!` / `as T` / `any` with Zod parse, type guards, or explicit throw guards.',
				'`as const` is fine; `unknown` + narrowing is preferred over `any`.',
			],
		},
	},
];

const FALLBACK: Remediation = {
	title: 'General remediation',
	steps: [
		'Read the finding message and the cited ADR / AGENTS.md rule.',
		'Move the change to the correct layer (domain vs infrastructure vs app shell).',
		'Add or update a test that fails first, then apply the fix (test pyramid).',
	],
	references: ['AGENTS.md', 'docs/agents/testing-standard.md'],
};

export const remediationFor = (finding: Pick<Finding, 'checkId'>): Remediation => {
	for (const entry of CATALOG) {
		if (entry.match.test(finding.checkId)) return entry.remediation;
	}
	return FALLBACK;
};

export const formatAgentPrompt = (
	finding: Finding,
	remediation: Remediation,
	context: { readonly engine: string; readonly repo: string },
): string => {
	const steps = remediation.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
	const refs = remediation.references?.length ? `\nReferences: ${remediation.references.join(', ')}` : '';
	return [
		`Please fix this ${context.engine} architecture/standards finding in ${context.repo}.`,
		'',
		`Rule: ${finding.checkId}`,
		`Severity: ${finding.severity}`,
		`Pack: ${finding.pack}`,
		finding.adr ? `ADR: ${finding.adr}` : null,
		`Location: ${finding.path}:${finding.startLine}`,
		'',
		`Message: ${finding.message}`,
		'',
		`Suggested approach — ${remediation.title}:`,
		steps,
		refs,
		'',
		'Follow the repo conventions (AGENTS.md / CLAUDE.md) and its ADRs.',
		'Open the file, reproduce/confirm the violation, apply the smallest correct fix, and run the relevant tests.',
	]
		.filter((line) => line !== null)
		.join('\n');
};
