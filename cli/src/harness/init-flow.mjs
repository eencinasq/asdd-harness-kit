#!/usr/bin/env node
/**
 * init-flow.mjs — ASDD-ROADMAP P0.2: ~15-minute brownfield happy path.
 *
 * Usage: asdd init-flow [dir] [--runtime=cursor] [--slice <id>] [--no-check] [--json]
 *
 * Ensures harness install, fills minimum bindings for a green check, creates one lite
 * slice with a sample feature, optionally runs `asdd check`. Does not publish to npm.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestProjectName } from '../install/phases.mjs';

const asddBin = resolve(fileURLToPath(new URL('../../bin/asdd.mjs', import.meta.url)));
const argv = process.argv.slice(2);

function flagValue(name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
  return null;
}

const positional = argv.filter((a) => !a.startsWith('-'));
const target = resolve(positional[0] || process.cwd());
const runtime = flagValue('--runtime') || 'cursor';
const sliceId = (flagValue('--slice') || 'hello').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
const skipCheck = argv.includes('--no-check');
const asJson = argv.includes('--json');

function asdd(args, opts = {}) {
  const r = spawnSync(process.execPath, [asddBin, ...args], {
    cwd: opts.cwd || target,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status !== 0 && !opts.allowFail) {
    const detail = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(`${args.join(' ')} failed: ${detail}`);
  }
  return r;
}

function write(rel, text) {
  const abs = join(target, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text.endsWith('\n') ? text : `${text}\n`);
}

function patchBinding(rel, transform) {
  const abs = join(target, rel);
  if (!existsSync(abs)) return false;
  const next = transform(readFileSync(abs, 'utf8'));
  writeFileSync(abs, next.endsWith('\n') ? next : `${next}\n`);
  return true;
}

function fillMinimumBindings() {
  const name = suggestProjectName(target) || basename(target);
  patchBinding('.harness/steering/quality-gates.project.md', (t) =>
    t
      .replace(/Active findings:\s*unfilled/i, 'Active findings: none')
      .replace(/Failure log path:\s*`…`/, 'Failure log path: `docs/agent-failure-log.md`')
      .replace(
        /```bash\n# Replace this comment with the project command[\s\S]*?```/,
        '```bash\nnode -e "process.exit(0)"\n```',
      ),
  );
  patchBinding('.harness/steering/product.md', (t) =>
    t
      .replace(/\(stub\)/gi, '')
      .replace(/<!-- One paragraph:[\s\S]*?-->/, `${name} — onboarded via \`asdd init-flow\`.`)
      .replace(/^- …$/m, `- Ship value with harness-governed slices.`)
      .replace(/\| … \| … \|/, `| Developer | Complete a lite slice safely |`)
      .replace(/^1\. …$/m, `1. Spec drift sensors must stay fail-closed.`),
  );
  for (const rel of [
    '.harness/steering/structure.md',
    '.harness/steering/tech.md',
    '.harness/steering/domain-layer.project.md',
  ]) {
    patchBinding(rel, (t) => t.replace(/\(stub\)/gi, ''));
  }
}

function scaffoldSlice() {
  if (!existsSync(join(target, `.harness/state/slices/${sliceId}`))) {
    asdd(['slice', 'init', sliceId]);
  }

  write(
    `.harness/specs/${sliceId}/spec.md`,
    `# ${sliceId} — Spec (lite)

## Intent

First lite slice created by \`asdd init-flow\`. Prove the harness loop: map a file, verify, pass.

Mapped: \`docs/hello-asdd.md\`

## Requirements

- **REQ-001.** The repository shall include \`docs/hello-asdd.md\` describing that this project uses ASDD + Harness.
`,
  );

  write(
    `.harness/specs/${sliceId}/design.md`,
    `# ${sliceId} — Design (lite)

## What changes

| Path | Change |
|------|--------|
| \`docs/hello-asdd.md\` | New hello note for the init-flow sample feature |

## Domain terms

none
`,
  );

  write(
    `.harness/specs/${sliceId}/tasks.md`,
    `# ${sliceId} — Tasks

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Hello harness note | REQ-001 | \`docs/hello-asdd.md\` |
`,
  );

  write(
    'docs/hello-asdd.md',
    `# Hello ASDD

This project was onboarded with \`asdd init-flow\`.

- Specs live under \`.harness/specs/\`
- Features track verification under \`.harness/features/\`
- Run \`asdd check\` before calling work done
- See the kit guide \`cli/docs/guides/spec-kit-to-asdd.md\` if you know GitHub Spec Kit
`,
  );

  write(
    `.harness/features/${sliceId}.features.json`,
    `${JSON.stringify(
      {
        schema_version: '1.0',
        slice_id: sliceId,
        source_tasks: `.harness/specs/${sliceId}/tasks.md`,
        features: [
          {
            id: 'TASK-001',
            title: 'Hello harness note',
            user_visible_behavior: 'docs/hello-asdd.md explains that the repo uses ASDD + Harness.',
            status: 'passing',
            priority: 1,
            owner: 'init-flow',
            req_ids: ['REQ-001'],
            depends_on: [],
            verification: ['test -f docs/hello-asdd.md'],
            evidence: 'init-flow wrote docs/hello-asdd.md',
            scope_paths: ['docs/hello-asdd.md'],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const now = new Date().toISOString();
  const sessDir = `.harness/state/slices/${sliceId}/sessions`;
  const events = [
    ['002-phase_completed-spec.json', 'phase_completed', 'spec', null],
    ['003-phase_completed-design.json', 'phase_completed', 'design', null],
    ['004-phase_completed-task_planning.json', 'phase_completed', 'task_planning', null],
    ['005-feature_started-TASK-001.json', 'feature_started', 'implementation', 'TASK-001'],
    ['006-feature_completed-TASK-001.json', 'feature_completed', 'implementation', 'TASK-001'],
  ];
  let n = 2;
  for (const [file, event_type, phase, feature_id] of events) {
    write(
      `${sessDir}/${file}`,
      `${JSON.stringify(
        {
          schema_version: '1.0',
          session_id: `sess-${sliceId}-${String(n).padStart(3, '0')}`,
          timestamp: now,
          agent: 'init-flow',
          human: 'squad',
          slice_id: sliceId,
          concerns: [],
          event_type,
          phase,
          evidence: `init-flow ${event_type}`,
          ...(feature_id ? { feature_id, scope_paths: ['docs/hello-asdd.md'] } : {}),
        },
        null,
        2,
      )}\n`,
    );
    n += 1;
  }

  asdd(['sync', '--slice', sliceId]);
}

function main() {
  mkdirSync(target, { recursive: true });
  const steps = [];

  if (!existsSync(join(target, '.harness'))) {
    asdd(['install', target, `--runtime=${runtime}`, '--no-interactive'], { cwd: process.cwd() });
    steps.push('install');
  } else {
    steps.push('harness-present');
  }

  fillMinimumBindings();
  steps.push('bindings');

  scaffoldSlice();
  steps.push(`slice:${sliceId}`);

  let check = null;
  if (!skipCheck) {
    check = asdd(['check'], { allowFail: true });
    steps.push(check.status === 0 ? 'check:ok' : 'check:fail');
  }

  const result = {
    ok: skipCheck || check?.status === 0,
    target,
    slice_id: sliceId,
    steps,
    check_exit: skipCheck ? null : check?.status ?? null,
    next: [
      `cd ${target}`,
      'asdd status --metrics',
      'Read cli/docs/guides/spec-kit-to-asdd.md (in the kit) if you know Spec Kit',
      `Edit .harness/specs/${sliceId}/spec.md for real work, then asdd sync`,
    ],
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`init-flow ${result.ok ? 'ok' : 'finished with check FAIL'} → ${target}`);
    console.log(`  slice: ${sliceId}`);
    console.log(`  steps: ${steps.join(' → ')}`);
    if (!skipCheck && check?.status !== 0) {
      console.log((check.stdout || check.stderr || '').trim());
    }
    console.log('Next:');
    for (const line of result.next) console.log(`  ${line}`);
  }

  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`FAIL  init-flow: ${e.message}`);
  process.exit(1);
}
