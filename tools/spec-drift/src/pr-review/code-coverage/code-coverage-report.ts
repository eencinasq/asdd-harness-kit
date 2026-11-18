/** Prompt for the host agent when the reviewed repo has no JS/TS test+coverage setup. */
export const buildCodeCoverageGeneratePrompt = (options: {
	readonly repoRoot: string;
	readonly project: string;
	readonly pr?: number;
}): string => {
	const done =
		options.pr !== undefined
			? `After tests and coverage work, call \`pr_review_architecture_rescan\` with pr=${options.pr} so the Code coverage tab re-runs.`
			: 'After tests and coverage work, tell the user to re-run the PR review or architecture rescan.';
	return [
		`# Add JS/TS unit tests and Istanbul-style coverage for ${options.project}`,
		'',
		`Repo root: \`${options.repoRoot}\``,
		'This project has no usable JS/TS unit-test + coverage setup yet (Jest, Vitest, c8, or nyc).',
		'',
		'## Goal',
		'Add a minimal unit-test runner and coverage reporting so PR Review can run tests with coverage and show an Istanbul-style summary.',
		'',
		'## How',
		'1. Detect the package manager (pnpm / npm / yarn) and existing scripts.',
		'2. Prefer **Vitest** or **Jest** with the json-summary coverage reporter (Istanbul-compatible `coverage/coverage-summary.json`).',
		'3. Alternatively wire **c8** or **nyc** around the existing `test` script with `--reporter=json-summary`.',
		'4. Add at least one real unit test for a small module; do not invent a fake green suite that asserts nothing.',
		'5. Document the script name (`test` or `test:coverage`) in package.json.',
		'6. Before writing files, list the plan so the user can confirm.',
		'',
		'## Done',
		done,
	].join('\n');
};
