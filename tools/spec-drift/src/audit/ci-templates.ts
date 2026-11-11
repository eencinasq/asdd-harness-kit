import type { AuditPayload } from './audit.types.ts';

export const CI_PROVIDERS = ['github', 'gitlab'] as const;
export type CiProvider = (typeof CI_PROVIDERS)[number];

const CI_TEMPLATES: Record<CiProvider, { path: string; content: string }> = {
	github: {
		path: '.github/workflows/harness-gates.yml',
		content: `name: harness-gates

on:
  push:
  pull_request:

jobs:
  harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Harness invariants and spec drift
        env:
          HARNESS_PR_BRANCH: \${{ github.head_ref }}
          HARNESS_PR_BODY: \${{ github.event.pull_request.body }}
          HARNESS_DRIFT_BASE: \${{ github.event.pull_request.base.sha }}
        run: |
          npm i -g "asdd-harness-kit@\$(node -p "require('./.harness/config/project.json').kit.version")"
          asdd sync
          asdd check
`,
	},
	gitlab: {
		path: '.gitlab-ci.yml (job harness-gates)',
		content: `harness-gates:
  image: node:22
  variables:
    GIT_DEPTH: "0"
    HARNESS_PR_BRANCH: $CI_MERGE_REQUEST_SOURCE_BRANCH_NAME
    HARNESS_PR_BODY: $CI_MERGE_REQUEST_DESCRIPTION
    HARNESS_DRIFT_BASE: $CI_MERGE_REQUEST_DIFF_BASE_SHA
  script:
    - npm i -g "asdd-harness-kit@\$(node -p "require('./.harness/config/project.json').kit.version")"
    - asdd sync
    - asdd check
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH
`,
	},
};

/** CI job text that runs check-invariants (spec drift included). Text only: thresholds live in quality-gates.md. */
export const generateCiGate = (provider: string): AuditPayload => {
	const template = CI_TEMPLATES[provider as CiProvider];
	if (!template) return { error: `unknown provider "${provider}"`, available: [...CI_PROVIDERS] };
	return {
		provider,
		suggested_path: template.path,
		content: template.content,
		note: 'Text only. The job fails when check-invariants exits non-zero; thresholds live in quality-gates.md, not here. Write the file only when a mapped task names this path.',
	};
};
