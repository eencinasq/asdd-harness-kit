/**
 * Pure view logic for the drift dashboard (no DOM, no React) so it can be unit-tested with node --test.
 */

export const SEVERITIES = ['fail', 'warn', 'advisory'];

/** Payload of a CallToolResult: structuredContent, else the JSON text fallback. */
export function payloadOf(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = result?.content?.find?.((c) => c.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Which tool produced the payload: audit_diff, verify_spec_compliance, audit_report, verify_architecture_rules, audit_finding, or generate_ci_gate. */
export function kindOf(payload) {
  if (!payload) return null;
  if (payload.finding) return 'finding';
  if (payload.provider && 'content' in payload) return 'ci';
  if (payload.adapters) return 'compliance';
  if (payload.hotspots || payload.reports) return 'audit';
  if (payload.semgrep && !payload.mode) return 'architecture';
  return 'diff';
}

/** author for engineers, review for the Tech Lead. */
export function resolveMode(toolName, args, payload) {
  const mode = args?.mode ?? payload?.mode;
  if (mode === 'author' || mode === 'review') return mode;
  return toolName === 'audit_report' ? 'review' : 'author';
}

function bySeverity(a, b) {
  return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || String(a.check).localeCompare(String(b.check));
}

const STATUS_LEVEL = { fail: 'blocking', error: 'warning', unconfigured: 'warning', pass: 'clean' };

function gateStatus(payload) {
  if (!payload.command) return 'unconfigured';
  if (payload.exit_code === 0) return 'pass';
  return typeof payload.exit_code === 'number' ? 'fail' : 'error';
}

/** One status pill per check that ran (or did not), as spec compliance does with its adapters. */
function checksOf(kind, payload, findings, semgrep) {
  const semgrepCheck = semgrep ? [{ id: 'semgrep', status: semgrep.status, message: semgrep.message }] : [];
  if (kind === 'compliance') {
    return Object.entries(payload.adapters).map(([id, r]) => ({ id, status: r.status, message: r.message }));
  }
  if (kind === 'architecture') {
    return [{ id: 'gate', status: gateStatus(payload), message: payload.command ?? payload.binding }, ...semgrepCheck];
  }
  if (kind === 'audit') {
    const verdicts = findings.filter((f) => f.source === 'inferential').length;
    return [
      ...(payload.commands ?? []).map((c) => ({ id: c.name, status: c.status, message: c.command })),
      ...semgrepCheck,
      {
        id: 'inferential',
        status: verdicts ? 'pass' : 'unconfigured',
        label: verdicts ? `inferential: ${verdicts} verdict${verdicts === 1 ? '' : 's'}` : 'inferential: not run',
        message: 'codebase-audit skill',
      },
    ];
  }
  return payload.architecture ? [{ id: 'architecture', status: payload.architecture.status, message: payload.architecture.message }, ...semgrepCheck] : semgrepCheck;
}

function levelOf(kind, payload, checks) {
  if (payload.summary?.drift_level) return payload.summary.drift_level;
  if (kind === 'architecture') return STATUS_LEVEL[payload.status] ?? 'unknown';
  if (checks.some((c) => c.status === 'fail')) return 'blocking';
  if (checks.some((c) => c.status === 'error')) return 'warning';
  return checks.length ? 'clean' : 'unknown';
}

/** Append a page result (tool called with page_token) to a payload that the server cut to fit the size budget. */
export function mergePage(payload, page) {
  if (!payload?.page || !Array.isArray(page?.findings)) return payload;
  const seen = new Set(payload.findings.map((f) => f.id));
  const more = page.findings.filter((f) => !seen.has(f.id));
  return { ...payload, findings: [...payload.findings, ...more], page: { ...payload.page, count: payload.findings.length + more.length } };
}

/** Next page offset, or null when every finding is loaded. */
export function nextOffset(payload) {
  const p = payload?.page;
  return p && p.count < p.total ? p.count : null;
}

function architectureOf(kind, payload) {
  const arch = kind === 'architecture' ? payload : payload.architecture;
  if (!arch) return null;
  return {
    status: arch.status,
    command: arch.command ?? null,
    binding: arch.binding ?? null,
    exit_code: arch.exit_code,
    output: arch.output ?? null,
    output_truncated: Boolean(arch.output_truncated ?? payload.output_truncated),
    message: arch.message ?? null,
    sources: arch.sources ?? [],
  };
}

/** Everything in the payload besides findings, checks, and summary, so the view can show it. */
function detailsOf(kind, payload) {
  const recurring = payload.recurring;
  return {
    meta: Object.entries({
      generated: payload.generated_at,
      commit: payload.commit,
      report: payload.path,
      mode: kind === 'diff' ? payload.mode : undefined,
      slice: payload.slice_id,
    }).filter(([, v]) => v),
    notes: payload.notes ?? [],
    commands: payload.commands ?? [],
    reports: payload.reports ?? [],
    recurring: Array.isArray(recurring) ? recurring.length : recurring ?? 0,
    suppressed: payload.suppressed ?? [],
    architecture: architectureOf(kind, payload),
  };
}

function totalsOf(payload, findings) {
  const bySeverity = payload.page?.by_severity;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, bySeverity ? bySeverity[s] ?? 0 : findings.filter((f) => f.severity === s).length]));
  return { counts, total: payload.page?.total ?? findings.length };
}

export function viewModel(payload) {
  const kind = kindOf(payload);
  if (!kind) return null;
  if (payload.error) return { kind, error: payload.error, findings: [], summary: {}, checks: [] };
  if (kind === 'ci') {
    return { kind, ci: { provider: payload.provider, path: payload.suggested_path, content: payload.content, note: payload.note }, findings: [], summary: {}, checks: [] };
  }
  if (kind === 'finding') {
    return { kind, findings: [payload.finding], trace: payload.trace ?? null, summary: {}, checks: [] };
  }
  const findings = kind === 'compliance'
    ? Object.entries(payload.adapters).flatMap(([adapter, r]) => (r.findings ?? []).map((f) => ({ ...f, adapter })))
    : payload.findings ?? [];
  const { counts, total } = totalsOf(payload, findings);
  const recurringIds = new Set(Array.isArray(payload.recurring) ? payload.recurring : []);
  const semgrep = payload.semgrep ?? payload.architecture?.semgrep ?? null;
  const checks = checksOf(kind, payload, findings, semgrep);
  const summary = kind === 'compliance'
    ? { ...payload.summary, spec_compliance: payload.summary?.spec_compliance ?? payload.adapters.ears?.spec_compliance }
    : payload.summary ?? {};
  const inferential = payload.page?.by_source?.inferential ?? findings.filter((f) => f.source === 'inferential').length;
  return {
    kind,
    checks,
    level: levelOf(kind, payload, checks),
    showCompliance: kind !== 'architecture',
    sources: inferential ? { computational: total - inferential, inferential } : null,
    summary,
    findings: findings.map((f) => (recurringIds.has(f.id) ? { ...f, recurring: true } : f)).sort(bySeverity),
    counts,
    total,
    loaded: findings.length,
    details: detailsOf(kind, payload),
    suppressed: payload.suppressed?.length ?? 0,
    adapters: kind === 'compliance'
      ? Object.entries(payload.adapters).map(([id, r]) => ({ id, status: r.status, message: r.message }))
      : [],
    hotspots: payload.hotspots ?? [],
    unconfigured: [...new Set([
      ...(payload.unconfigured ?? []),
      ...(payload.architecture?.status === 'unconfigured' || (payload.status === 'unconfigured' && kind === 'architecture') ? ['architecture'] : []),
      ...(semgrep?.status === 'unconfigured' && kind === 'architecture' ? ['semgrep'] : []),
      ...(semgrep?.status === 'unavailable' ? ['semgrep'] : []),
    ])],
    architecture: payload.architecture ?? null,
    semgrep,
  };
}

export function actionsFor(mode) {
  return mode === 'review'
    ? [
        { id: 'comment', label: 'Draft comment' },
        { id: 'dismiss', label: 'Dismiss…', needsReason: true },
      ]
    : [{ id: 'task', label: 'Send to agent as task' }];
}

function describe(f) {
  const files = f.paths?.length ? `\nFiles: ${f.paths.join(', ')}${f.line ? `:${f.line}` : ''}` : '';
  const node = f.node ? `\nNode: ${f.node}` : '';
  const rule = f.rule ? `\nRule: ${f.rule}` : '';
  const fix = f.fix ? `\nFix:\n${f.fix}` : '';
  const remediation = f.remediation ? `\nRemediation: ${f.remediation}` : '';
  return `${f.id} (${f.check}, ${f.severity}): ${f.message}${files}${node}${rule}${fix}${remediation}`;
}

/** Text the view sends to the host chat (ui/message). The view never changes files itself. */
export function messageFor(actionId, finding, { reason } = {}) {
  switch (actionId) {
    case 'task':
      return `Fix spec drift finding ${describe(finding)}\n\nWork inside the active slice: change only files mapped by its intent, design, tasks, or spec, or by feature scope_paths. If the change is intended, map the file in the slice instead of reverting it. Run audit_diff again when done.`;
    case 'comment':
      return `Draft a pull request review comment for finding ${describe(finding)}\n\nCite the requirement or rule it breaks, with file and line. Do not post it; show me the draft.`;
    case 'dismiss':
      return `Record a Tech Lead dismissal for finding ${finding.id} (${finding.check}). Run:\nnode .harness/scripts/audit-triage.mjs ${finding.id} --dismiss --reason ${JSON.stringify(reason ?? '')}\n\nThe dismissal holds until the finding's files change.`;
    default:
      throw new Error(`unknown action ${actionId}`);
  }
}

/** Text for a trace with no nodes: no knowledge index, or a finding with no graph node. */
export function traceSummary(trace) {
  return trace.indexed
    ? 'No linked requirements or features in the knowledge graph.'
    : 'No knowledge index or no graph node for this finding (run node .harness/scripts/sync-knowledge.mjs).';
}

export function percent(value) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a';
}
