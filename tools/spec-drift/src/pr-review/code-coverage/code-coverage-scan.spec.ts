import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCodeCoverageGeneratePrompt } from './code-coverage-report.ts';
import { coverageCommand, detectJsCoverageSetup, detectPackageManager } from './detect-js-coverage.ts';
import { parseCoverageSummary } from './parse-coverage-summary.ts';

describe('code coverage detection + parse (pr-review-dashboard-ux REQ-014…016)', () => {
	it('detects pnpm + vitest from lockfile and deps', () => {
		assert.equal(detectPackageManager({ pnpm: true, yarn: false, npm: true }), 'pnpm');
		const setup = detectJsCoverageSetup({
			pkg: {
				scripts: { test: 'vitest run' },
				devDependencies: { vitest: '3.0.0', '@vitest/coverage-v8': '3.0.0' },
			},
			files: new Set(['vitest.config.ts']),
			packageManager: 'pnpm',
		});
		assert.deepEqual(setup, { tool: 'vitest', packageManager: 'pnpm', testScript: 'test' });
		const cmd = coverageCommand(setup!, '/tmp/cov');
		assert.equal(cmd.command, 'pnpm');
		assert.ok(cmd.args.includes('vitest'));
		assert.ok(cmd.args.some((a) => a.includes('reportsDirectory=/tmp/cov')));
	});

	it('detects jest and builds jest coverage argv', () => {
		const setup = detectJsCoverageSetup({
			pkg: { scripts: { test: 'jest' }, devDependencies: { jest: '29.0.0' } },
			files: new Set(['jest.config.js']),
			packageManager: 'npm',
		});
		assert.equal(setup?.tool, 'jest');
		const cmd = coverageCommand(setup!, '/tmp/cov');
		assert.equal(cmd.command, 'npx');
		assert.ok(cmd.args.includes('jest'));
		assert.ok(cmd.args.includes('--coverageDirectory=/tmp/cov'));
	});

	it('returns undefined when there is no test script or coverage tool', () => {
		assert.equal(
			detectJsCoverageSetup({
				pkg: { scripts: { build: 'tsc' }, dependencies: { express: '4' } },
				files: new Set(),
				packageManager: 'npm',
			}),
			undefined,
		);
		assert.equal(detectJsCoverageSetup({ pkg: undefined, files: new Set(), packageManager: 'npm' }), undefined);
	});

	it('parses Istanbul coverage-summary.json and filters PR paths', () => {
		const raw = JSON.stringify({
			total: {
				lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
				statements: { total: 100, covered: 80, skipped: 0, pct: 80 },
				functions: { total: 10, covered: 8, skipped: 0, pct: 80 },
				branches: { total: 20, covered: 10, skipped: 0, pct: 50 },
			},
			'/repo/src/app.ts': { lines: { total: 10, covered: 9, skipped: 0, pct: 90 } },
			'/repo/src/other.ts': { lines: { total: 10, covered: 1, skipped: 0, pct: 10 } },
		});
		const { totals, files } = parseCoverageSummary(raw, ['src/app.ts']);
		assert.equal(totals.linesPct, 80);
		assert.equal(totals.branchesPct, 50);
		assert.deepEqual(files, [{ path: 'src/app.ts', linesPct: 90, linesCovered: 9, linesTotal: 10 }]);
	});

	it('builds a generatePrompt that mentions rescan', () => {
		const prompt = buildCodeCoverageGeneratePrompt({
			repoRoot: '/repo',
			project: 'demo',
			pr: 42,
		});
		assert.match(prompt, /unit tests and Istanbul-style coverage/i);
		assert.match(prompt, /pr_review_architecture_rescan/);
		assert.match(prompt, /pr=42/);
	});
});
