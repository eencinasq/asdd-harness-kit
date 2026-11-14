import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { checkAsserts, checkBudget, checkCutoffs, checkStale, alwaysLoadedBytes } from '../src/kit/guidance.mjs';
import { jitEntries, render } from '../src/kit/generate-runtime-steering.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function withDir(fn) {
  return () => {
    const root = mkdtempSync(join(tmpdir(), 'guidance-'));
    try {
      fn(root, (rel, text) => {
        mkdirSync(join(root, rel, '..'), { recursive: true });
        writeFileSync(join(root, rel), text);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

test('REQ-002 AC-001: a stale mechanism in shipped guidance fails with file and phrase', withDir((root, write) => {
  write('.agents/agents/asdd-implementation-agent.md', '# Impl\n\nThe coordinator holds the slice lock.\n');
  write('.harness/steering/session-loop.md', '---\ninclusion: always\n---\n# Loop\n');
  const findings = checkStale(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /\.agents\/agents\/asdd-implementation-agent\.md:3 .*slice lock/);

  write('.agents/agents/asdd-implementation-agent.md', '# Impl\n\nThe coordinator alone writes shared state.\n');
  assert.deepEqual(checkStale(root), []);
}));

test('REQ-001: every removed mechanism is caught; kit-only files are not scanned', withDir((root, write) => {
  const banned = [
    'Update `.harness/progress/<slice>.md`.',
    'Update the slice row in `PROGRESS.md`.',
    'Maintain `docs/knowledge-base/dependency-graph.json`.',
    'Write `docs/knowledge-base/spike-results/x.md`.',
    'Send a heartbeat every hour.',
    'Seed `.harness/state/locks/`.',
  ];
  write('AGENTS.md', banned.join('\n'));
  assert.equal(checkStale(root).length, banned.length);
  write('AGENTS.md', '# ok\n');
  write('README.md', 'The v2 slice lock was removed.\n');
  write('.harness/specs/s/intent.md', 'holds the slice lock\n');
  write('.harness/steering/product.md', 'heartbeat\n');
  assert.deepEqual(checkStale(root), [], 'README, specs, and kit bindings are kit-only');
}));

test('REQ-007 AC-005: agent cutoffs fail; ranges and latency targets do not', withDir((root, write) => {
  write('.agents/agents/asdd-refactor-agent.md', [
    '# Refactor',
    '- **Threshold:** If `score < 0.75`, TL review is mandatory.',
    'Design confidence score: [0.0–1.0]',
    'Measurable NFRs: p95 < 200ms.',
    'Your own confidence target is raised to **0.90**.',
    'Each CRITICAL finding reduces confidence by 0.10.',
    'MUST requirement coverage < 100% blocks.',
    'Apply `QG-DES-02`.',
    'Lite allows > 1 `in_progress` feature only after escalation; ≤1 new domain concept.',
    'A score >= 1.0 is perfect.',
  ].join('\n'));
  const findings = checkCutoffs(root);
  assert.deepEqual(findings.map((f) => f.match(/:(\d+) /)[1]), ['2', '5', '6', '7', '10'], 'counts like > 1 are not cutoffs; 1.0 is');
}));

test('REQ-010 AC-007: budget passes at or below the binding, fails above or when unfilled', withDir((root, write) => {
  write('AGENTS.md', 'x'.repeat(100));
  write('.harness/steering/a.md', `---\ninclusion: always\n---\n${'y'.repeat(50)}`);
  write('.harness/steering/b.md', '---\ninclusion: auto\ntags:\n  - qa\n---\nnot counted');
  const size = alwaysLoadedBytes(root);
  assert.equal(size, 100 + `---\ninclusion: always\n---\n${'y'.repeat(50)}`.length);

  const binding = (v) => write('.harness/steering/quality-gates.project.md', `- Always-loaded steering budget: \`${v}\` bytes\n`);
  binding(size);
  assert.deepEqual(checkBudget(root, root), []);
  binding(size - 1);
  assert.match(checkBudget(root, root)[0], new RegExp(`${size} bytes > budget ${size - 1}`));
  binding('…');
  assert.match(checkBudget(root, root)[0], /unconfigured/);
}));

test('TASK-001: a bare `!` assertion in a kit test script fails', withDir((root, write) => {
  write('cli/test/x.sh', '#!/usr/bin/env bash\nset -euo pipefail\n! grep -q x file\nif grep -q y file; then exit 1; fi\n');
  const findings = checkAsserts(root);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /cli\/test\/x\.sh:3/);
}));

test('skills-bloom REQ-008: a cutoff in a skill (SKILL.md or its references, core or module) fails', withDir((root, write) => {
  write('.agents/skills/anti-pattern-detection/SKILL.md', '# A\n- < 0.70: BLOCK capability\nMore than 10 FRs is a mega-capability.\n');
  write('.agents/skills/business-model-canvas/references/scoring.md', 'Each CRITICAL finding reduces agent confidence by 0.10.\n');
  write('cli/modules/web-ui/skills/frontend-ui-engineering/SKILL.md', 'Lighthouse score >= 0.9 passes.\n');
  write('.agents/skills/codegraph/SKILL.md', 'Run codegraph explore before > 1 grep.\n');
  const findings = checkCutoffs(root).map((f) => f.replace(/^cutoffs /, '').split(' ')[0]);
  assert.deepEqual(findings.sort(), [
    '.agents/skills/anti-pattern-detection/SKILL.md:2:',
    '.agents/skills/business-model-canvas/references/scoring.md:1',
    'cli/modules/web-ui/skills/frontend-ui-engineering/SKILL.md:1',
  ].map((f) => f.replace(/:$/, '')).sort());
}));

test('REQ-006, skills-bloom REQ-008: the agent prompts and skills the kit ships contain no cutoff of their own', () => {
  assert.deepEqual(checkCutoffs(KIT_ROOT), []);
});

test('REQ-013: always-loaded steering plus AGENTS.md is below the 36,627 bytes it had before kit-hygiene', () => {
  const size = alwaysLoadedBytes(KIT_ROOT);
  assert.ok(size < 36627, `${size} bytes`);
});

test('asserts: a kit test script with a bash syntax error fails (bash can exit 0 on it)', withDir((root, write) => {
  write('cli/test/broken.sh', "#!/usr/bin/env bash\nset -euo pipefail\nnode -e 'it's broken'\n");
  assert.match(checkAsserts(root).join('\n'), /cli\/test\/broken\.sh: bash syntax error/);
}));

test('D-12: committed asdd-steering.mdc equals the registry-derived projection', () => {
  const committed = readFileSync(join(KIT_ROOT, 'cli/runtimes/cursor/asdd-steering.mdc'), 'utf8');
  assert.equal(render(jitEntries(KIT_ROOT)), committed, 'run node cli/src/kit/generate-runtime-steering.mjs');
});
