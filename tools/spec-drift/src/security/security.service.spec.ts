import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import { ProcessRunner } from '../common/process/process-runner.service.ts';
import type { Env } from '../config/env.schema.ts';
import { buildAuditPrompt, SecurityAuditService } from './security.service.ts';

let repo: string;
let state: string;
let service: SecurityAuditService;

const finding = (fingerprint: string, line = 4) => ({
	verdict: 'needs_validation',
	fingerprint,
	title: 'Request body reaches a shell command',
	description: 'An unauthenticated caller can run commands on the server.',
	claimed_root_cause: 'exec() receives a string built from req.body.cmd.',
	trace: [
		{ kind: 'entrypoint', file: 'src/server.js', line: 2, scope: 'POST /run', description: 'req.body.cmd enters.' },
		{ kind: 'sink', file: 'src/server.js', line, scope: 'exec', description: 'string reaches exec().' },
	],
	evidence: [{ file: 'src/server.js', line, description: 'exec(`run ${req.body.cmd}`)' }],
	blockers: ['No sandbox to demonstrate execution.'],
	validation_plan: { local: 'Run the handler in a sandbox with a harmless payload and observe the spawned process.' },
});

before(() => {
	repo = mkdtempSync(path.join(tmpdir(), 'sec-svc-repo-'));
	state = mkdtempSync(path.join(tmpdir(), 'sec-svc-state-'));
	mkdirSync(path.join(repo, 'src'));
	writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { express: '^5' } }));
	writeFileSync(
		path.join(repo, 'src/server.js'),
		"const app = require('express')();\napp.post('/run', (req) => {\n  const { exec } = require('node:child_process');\n  exec(`run ${req.body.cmd}`);\n});\n",
	);
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['add', '-A'], { cwd: repo });
	const config = { get: () => 30 } as unknown as ConfigService<Env, true>;
	service = new SecurityAuditService(new ProcessRunner(config), { repoRoot: repo, stateRoot: state });
});

after(() => {
	rmSync(repo, { recursive: true, force: true });
	rmSync(state, { recursive: true, force: true });
});

test('security-review REQ-002: start runs reconnaissance, stores the run outside the repo, and bounds the prompt', async () => {
	const { run, prompt } = await service.start({});
	assert.equal(run.id, 'run-1');
	assert.ok(run.recon.surfaces.includes('http-server'));
	assert.ok(run.ledger.some((e) => e.id === 'web-protocol-and-auth' && e.status === 'pending'));
	assert.ok(prompt.length <= 8000, `prompt is ${prompt.length} chars`);
	assert.match(prompt, /do not run|never run/i);
	assert.match(prompt, /security_audit_submit_findings/);
	assert.ok(!readdirSync(repo).some((n) => n.includes('security')), 'nothing written into the repo');
	assert.ok(existsSync(path.join(service.runDir('run-1'), 'run.json')));
	assert.equal((await service.start({})).run.id, 'run-2', 'runs are numbered');
});

test('security-review REQ-004 REQ-005: a valid submission is stored and marks the reviewed checklists', async () => {
	const res = await service.submit({
		runId: 'run-1',
		findings: [finding('cmd/exec-body')],
		checklists_reviewed: ['web-protocol-and-auth', 'not-a-checklist'],
	});
	assert.equal(res.accepted, 1);
	assert.equal(res.ledger.find((e) => e.id === 'web-protocol-and-auth')?.status, 'reviewed');
	assert.ok(res.warnings.some((w) => /not-a-checklist/.test(w)));
	// The same fingerprint replaces, a new one adds.
	const again = await service.submit({
		runId: 'run-1',
		findings: [finding('cmd/exec-body', 4), finding('cmd/other', 4)],
	});
	assert.equal(again.total, 2);
});

test('security-review REQ-004: an invalid submission is rejected with every error and stores nothing', async () => {
	await assert.rejects(
		service.submit({ runId: 'run-2', findings: [finding('bad/line', 99)] }),
		/line 99 is past the end of src\/server\.js/,
	);
	const status = await service.status({ runId: 'run-2' });
	assert.equal(status.counts.total, 0);
});

test('security-review REQ-009: status summarises verdicts, severity, ledger coverage and a page of findings', async () => {
	const s = await service.status({ runId: 'run-1' });
	assert.equal(s.counts.byVerdict['needs_validation'], 2);
	assert.equal(s.coverage.reviewed, 1);
	assert.ok(s.coverage.total >= 6);
	assert.equal(s.needsValidation.length, 2);
	assert.equal(s.findings.items[0]?.location, 'src/server.js:4');
	assert.ok(JSON.stringify(s).length < 8 * 1024, 'stays under the 8 KB view budget');
	const latest = await service.status({});
	assert.equal(latest.run.id, 'run-2', 'latest run when none is named');
});

test('security-review REQ-002: the prompt builder names checklists, rules and the submit contract', () => {
	const prompt = buildAuditPrompt({
		id: 'run-9',
		repoName: 'demo',
		recon: { files: 3, languages: { javascript: 1 }, surfaces: ['http-server'], evidence: {}, checklists: ['core'] },
		ledger: [{ id: 'core', title: 'Core principles and workflow', status: 'pending' }],
	});
	assert.match(prompt, /security_audit_checklist/);
	assert.match(prompt, /needs_validation/);
	assert.match(prompt, /core — Core principles and workflow/);
});
