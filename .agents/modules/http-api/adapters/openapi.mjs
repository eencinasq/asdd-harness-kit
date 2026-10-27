/**
 * Spec compliance adapter `openapi` (http-api module) for the spec-drift-auditor MCP server.
 *
 * Adapter contract: default export { id, description, run({ root, sliceId, readBinding }) }
 * returning { status: 'pass' | 'fail' | 'unconfigured' | 'error', findings, message? }.
 *
 * 1. `Contract command` bound in quality-gates.project.md → run it; non-zero exit = contract drift.
 * 2. Else `OpenAPI spec` (JSON) bound → every endpoint a requirement cites must exist in the spec.
 * 3. Else `unconfigured` (never a pass).
 *
 * Self-contained: the installer copies this file to .agents/mcp/adapters/.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BINDINGS = '.harness/steering/quality-gates.project.md';
const TIMEOUT_MS = 300000;
const ENDPOINT_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/(?:[^\s`'",;):]|:(?=[A-Za-z_]))*)/g;
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function finding(sliceId, fields) {
  const f = { check: 'CONTRACT', severity: 'fail', slice_id: sliceId, node: null, paths: [], ...fields };
  const key = [f.check, f.slice_id ?? '', f.node ?? '', ...f.paths].join('|');
  return { id: `AUD-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`, ...f };
}

/** Normalize `/users/{id}`, `/users/:id`, and trailing slashes to one shape. */
export function normalizePath(path) {
  const p = path.replace(/\{[^}]+\}|:[A-Za-z_]\w*/g, '{}').replace(/\/+$/, '');
  return p || '/';
}

/** Endpoints cited by each requirement line of a slice: [{ req, method, path }]. */
export function citedEndpoints(root, sliceId) {
  const dir = join(root, '.harness/specs', sliceId);
  const file = ['requirements.md', 'spec.md'].map((n) => join(dir, n)).find((p) => existsSync(p));
  if (!file) return { file: null, endpoints: [] };
  const endpoints = [];
  let current = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const req = line.match(/\b(REQ-[A-Za-z0-9-]*\d)\b/);
    if (req) current = req[1];
    for (const m of line.matchAll(ENDPOINT_RE)) {
      endpoints.push({ req: current, method: m[1], path: m[2] });
    }
  }
  return { file: file.slice(root.length + 1), endpoints };
}

function runContractCommand(root, sliceId, command) {
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status === null) {
    return { status: 'error', source: 'contract-command', command, findings: [], message: r.error?.message ?? 'timed out' };
  }
  if (r.status === 0) return { status: 'pass', source: 'contract-command', command, findings: [] };
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const { endpoints } = citedEndpoints(root, sliceId);
  const findings = [];
  for (const line of output.split('\n')) {
    for (const m of line.matchAll(ENDPOINT_RE)) {
      const key = `${m[1]} ${normalizePath(m[2])}`;
      const cited = endpoints.find((e) => `${e.method} ${normalizePath(e.path)}` === key);
      findings.push(finding(sliceId, {
        node: cited?.req ? `req:${sliceId}:${cited.req}` : `endpoint:${key}`,
        message: `${line.trim()}${cited?.req ? ` (cited by ${cited.req})` : ''}`,
      }));
    }
  }
  if (!findings.length) {
    findings.push(finding(sliceId, { node: 'contract-command', message: `contract command failed (exit ${r.status}): ${output.trim().slice(-400)}` }));
  }
  return { status: 'fail', source: 'contract-command', command, exit_code: r.status, findings };
}

function compareSpec(root, sliceId, specRel) {
  if (!/\.json$/i.test(specRel)) {
    return { status: 'error', source: 'openapi-spec', spec: specRel, findings: [], message: 'OpenAPI spec binding must point to a JSON file (or set a Contract command)' };
  }
  let spec;
  try {
    spec = JSON.parse(readFileSync(join(root, specRel), 'utf8'));
  } catch (error) {
    return { status: 'error', source: 'openapi-spec', spec: specRel, findings: [], message: `cannot read ${specRel}: ${error.message}` };
  }
  const operations = new Set();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) if (item?.[method]) operations.add(`${method.toUpperCase()} ${normalizePath(path)}`);
  }
  const { file, endpoints } = citedEndpoints(root, sliceId);
  const findings = endpoints
    .filter((e) => !operations.has(`${e.method} ${normalizePath(e.path)}`))
    .map((e) => finding(sliceId, {
      node: e.req ? `req:${sliceId}:${e.req}` : `endpoint:${e.method} ${normalizePath(e.path)}`,
      paths: [specRel],
      message: `${e.req ?? file} cites ${e.method} ${e.path}, which ${specRel} does not define`,
    }));
  return { status: findings.length ? 'fail' : 'pass', source: 'openapi-spec', spec: specRel, endpoints_checked: endpoints.length, findings };
}

export default {
  id: 'openapi',
  description: 'HTTP contract: bound Contract command, or OpenAPI JSON vs endpoints cited in requirements',
  run({ root, sliceId, readBinding }) {
    const [command] = readBinding(root, BINDINGS, 'Contract command');
    if (command) return runContractCommand(root, sliceId, command);
    const [specRel] = readBinding(root, BINDINGS, 'OpenAPI spec');
    if (specRel) return compareSpec(root, sliceId, specRel);
    return {
      status: 'unconfigured',
      findings: [],
      message: `Bind "Contract command" or "OpenAPI spec" in ${BINDINGS}; not checked, which is not a pass.`,
    };
  },
};
