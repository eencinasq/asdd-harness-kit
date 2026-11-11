import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { awaitingRequirements, completeGroup, initProgress, withRequirementsStep } from '../coverage/coverage.ts';
import type { ReviewUnitsView } from '../pr-review.types.ts';
import {
	applyVerdicts,
	initRequirements,
	requirementsEvent,
	requirementsSummaryBlock,
	withRequirementsBlock,
	withRequirementsSection,
} from './requirements-report.ts';
import { extractCriteria } from './ticket-parser.ts';
import { detectTicketRefs, doneSignals } from './ticket-refs.ts';

const JIRA_ES = `h2. Contexto
Los operadores necesitan retirar productos vencidos.

h3. Criterios de aceptación
# El tipo de tarea EXPIRATION_WITHDRAWAL existe en el registro de workflows
# Crear una tarea sin sku devuelve 400
# La tarea se puede asignar, iniciar y completar

*Definición de terminado:*
- [ ] Tests unitarios del workflow
- [x] Colección Bruno actualizada
`;

const MARKDOWN_EN = `## Summary
Adds CSV export.

## Acceptance Criteria
- Users can export the current list as CSV
  including the filters applied
- Export is limited to 10k rows

## Definition of Done
1. Unit tests
2. README updated
`;

const GHERKIN = `Scenario: export works
Given a user with orders
When they click export
Then a CSV is downloaded

Escenario: límite
Dado más de 10000 filas
Entonces se muestra un aviso
`;

describe('extractCriteria', () => {
	test('Jira wiki markup in Spanish: numbered AC and a DoD checklist', () => {
		const criteria = extractCriteria(JIRA_ES);
		assert.deepEqual(
			criteria.map((c) => c.id),
			['AC-1', 'AC-2', 'AC-3', 'DOD-1', 'DOD-2'],
		);
		assert.equal(criteria[1]?.text, 'Crear una tarea sin sku devuelve 400');
		assert.equal(criteria[3]?.kind, 'done');
		assert.equal(criteria[4]?.text, 'Colección Bruno actualizada');
	});

	test('Markdown in English: wrapped list items are joined, the summary is ignored', () => {
		const criteria = extractCriteria(MARKDOWN_EN);
		assert.equal(criteria.length, 4);
		assert.equal(criteria[0]?.text, 'Users can export the current list as CSV including the filters applied');
		assert.deepEqual(
			criteria.filter((c) => c.kind === 'done').map((c) => c.text),
			['Unit tests', 'README updated'],
		);
	});

	test('Gherkin scenarios (English and Spanish) without headings become one criterion each', () => {
		const criteria = extractCriteria(GHERKIN);
		assert.equal(criteria.length, 2);
		assert.match(criteria[0]?.text ?? '', /^Scenario: export works · Given a user with orders · When .* · Then a CSV/);
		assert.match(criteria[1]?.text ?? '', /^Escenario: límite · Dado/);
	});

	test('a bare checklist counts; prose without criteria yields none', () => {
		assert.equal(extractCriteria('Please do it\n- [ ] first thing\n- [ ] second thing').length, 2);
		assert.deepEqual(extractCriteria('Just make it faster, thanks.'), []);
	});
});

describe('ticket references and done signals', () => {
	test('finds Jira / Linear keys and closing GitHub refs, ignoring look-alikes', () => {
		const refs = detectTicketRefs({
			title: 'MLC-828 expiration withdrawal (UTF-8 safe)',
			headRefName: 'feat/mlc-828-withdrawal',
			body: 'Closes #45 and fixes acme/api#7. See ISO-8601.',
		});
		assert.deepEqual(
			refs.map((r) => [r.source, r.ref]),
			[
				['jira-or-linear', 'MLC-828'],
				['github', '#45'],
				['github', 'acme/api#7'],
			],
		);
	});

	test('reads tests, docs, migrations and config from the changed files', () => {
		const signals = doneSignals([
			'src/a.ts',
			'src/a.spec.ts',
			'src/types.test-d.ts',
			'docs/api.md',
			'db/migrations/001_init.sql',
			'config/app.yml',
		]);
		assert.deepEqual(signals.testFiles, ['src/a.spec.ts', 'src/types.test-d.ts']);
		assert.deepEqual(signals.docFiles, ['docs/api.md']);
		assert.deepEqual(signals.migrationFiles, ['db/migrations/001_init.sql']);
		assert.deepEqual(signals.configFiles, ['config/app.yml']);
	});
});

const state = initRequirements({ source: 'jira', ref: 'MLC-1', text: JIRA_ES }, extractCriteria(JIRA_ES), [
	'a.spec.ts',
]);

describe('verdicts', () => {
	test('the agent must judge every criterion; unknown ids are reported', () => {
		const result = applyVerdicts(
			state,
			[
				{ id: 'ac-1', status: 'met' },
				{ id: 'AC-9', status: 'met' },
			],
			{
				by: 'agent',
				complete: true,
			},
		);
		assert.deepEqual(result.missing, ['AC-2', 'AC-3', 'DOD-1', 'DOD-2']);
		assert.deepEqual(result.unknown, ['AC-9']);
		assert.equal(result.state.status, 'pending');
	});

	test('all judged → done; an unmet criterion suggests REQUEST_CHANGES', () => {
		const verdicts = state.criteria.map((c) => ({ id: c.id, status: c.id === 'AC-2' ? 'unmet' : 'met' }) as const);
		const { state: done } = applyVerdicts(state, verdicts, { by: 'agent', complete: true });
		assert.equal(done.status, 'done');
		assert.equal(requirementsEvent(done), 'REQUEST_CHANGES');
		assert.equal(requirementsEvent(state), undefined);
		assert.match(requirementsSummaryBlock(done), /4\/5 criteria met/);
		assert.match(requirementsSummaryBlock(done), /❌ AC-2 Crear una tarea sin sku/);
	});

	test('the summary block is replaced in place, keeping the human text', () => {
		const { state: done } = applyVerdicts(
			state,
			state.criteria.map((c) => ({ id: c.id, status: 'met' as const })),
			{ by: 'agent', complete: true },
		);
		const once = withRequirementsBlock('Looks good.', done);
		const twice = withRequirementsBlock(`${once}\n\nHuman note after.`, done);
		assert.equal(twice.match(/<!-- requirements -->/g)?.length, 1);
		assert.match(twice, /^Looks good\.\n\nHuman note after\.\n\n<!-- requirements -->/);
		assert.equal(withRequirementsBlock(once, undefined), 'Looks good.');
	});

	test('the report section goes before the architecture section and is replaced on update', () => {
		const report = '# PR review #1\n\n## Verdict\nok\n\n## Architecture (project `.semgrep`)\n\nclean\n';
		const once = withRequirementsSection(report, state);
		assert.match(once, /## Requirements — MLC-1[\s\S]*## Architecture/);
		assert.equal(withRequirementsSection(once, state).match(/## Requirements/g)?.length, 1);
	});
});

describe('coverage with a requirements step', () => {
	const units = {
		groups: [{ label: 'g', files: ['a.ts'], ruleDocId: 'r', rulePattern: '*', ruleMarkdown: '' }],
	} as unknown as ReviewUnitsView;

	test('groups done is not complete until the criteria are verified', () => {
		const progress = initProgress(units, 'pending');
		const { progress: grouped } = completeGroup(progress, { groupIndex: 0, newFindings: [] });
		assert.equal(grouped.complete, false);
		assert.equal(awaitingRequirements(grouped), true);
		assert.equal(withRequirementsStep(grouped, 'done').complete, true);
		assert.equal(withRequirementsStep(grouped, undefined).complete, true, 'dropping the ticket unblocks');
	});

	test('a PR with no reviewable groups still waits for the criteria', () => {
		const empty = { groups: [] } as unknown as ReviewUnitsView;
		assert.equal(initProgress(empty).complete, true);
		assert.equal(initProgress(empty, 'pending').complete, false);
	});
});
