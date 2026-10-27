import { useEffect, useMemo, useRef, useState } from 'react';
import { PROTOCOL_VERSION, applyHostContext, createBridge } from './bridge.js';
import { SEVERITIES, actionsFor, mergePage, messageFor, nextOffset, payloadOf, percent, resolveMode, traceSummary, viewModel } from './model.js';

const MAX_PATHS = 6;

const TITLES = {
  diff: 'Spec drift',
  compliance: 'Spec compliance',
  audit: 'Codebase audit',
  architecture: 'Architecture',
  finding: 'Finding',
  ci: 'CI gate',
};

function useHost() {
  const [state, setState] = useState({ status: 'connecting', args: {}, toolName: null, payload: null, paging: null });
  const bridgeRef = useRef(null);

  useEffect(() => {
    const bridge = createBridge();
    bridgeRef.current = bridge;
    bridge.on('ui/notifications/tool-input', (p) => setState((s) => ({ ...s, args: p.arguments ?? {} })));
    bridge.on('ui/notifications/tool-result', (result) => setState((s) => ({ ...s, status: 'ready', payload: payloadOf(result), paging: null })));
    bridge.on('ui/notifications/tool-cancelled', (p) => setState((s) => ({ ...s, status: 'cancelled', error: p.reason })));
    bridge.on('ui/notifications/host-context-changed', applyHostContext);
    bridge.onRequest('ui/resource-teardown', () => ({}));
    bridge.onRequest('ping', () => ({}));

    bridge
      .request('ui/initialize', {
        appInfo: { name: 'spec-drift-dashboard', version: '1.0.0' },
        appCapabilities: { availableDisplayModes: ['inline'] },
        protocolVersion: PROTOCOL_VERSION,
      })
      .then((result) => {
        applyHostContext(result?.hostContext);
        const toolName = result?.hostContext?.toolInfo?.tool?.name ?? null;
        setState((s) => ({ ...s, toolName, status: s.payload ? 'ready' : 'waiting' }));
        bridge.notify('ui/notifications/initialized');
      })
      .catch((error) => setState((s) => ({ ...s, status: 'error', error: error.message })));

    const observer = new ResizeObserver(() => {
      const el = document.documentElement;
      bridge.notify('ui/notifications/size-changed', { width: el.scrollWidth, height: el.scrollHeight });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const refresh = async () => {
    if (!state.toolName) return;
    setState((s) => ({ ...s, status: 'refreshing' }));
    try {
      const result = await bridgeRef.current.request('tools/call', { name: state.toolName, arguments: state.args });
      setState((s) => ({ ...s, status: 'ready', payload: payloadOf(result), paging: null }));
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error: error.message }));
    }
  };

  const sendMessage = (text) =>
    bridgeRef.current.request('ui/message', { role: 'user', content: { type: 'text', text } });

  const callTool = async (name, args) => payloadOf(await bridgeRef.current.request('tools/call', { name, arguments: args }));

  // The server cuts large results to fit the host's inline size; page in the rest.
  const offset = nextOffset(state.payload);
  const token = state.payload?.page?.token;
  const pageTool = state.payload?.page?.tool ?? state.toolName;
  useEffect(() => {
    if (offset === null || !token || !pageTool || state.paging?.error) return undefined;
    let stale = false;
    setState((s) => ({ ...s, paging: { loading: true } }));
    callTool(pageTool, { page_token: token, offset })
      .then((page) => {
        if (stale) return;
        if (page?.error || !page?.findings?.length) {
          setState((s) => ({ ...s, paging: { error: page?.error ?? 'no findings returned' } }));
        } else {
          setState((s) => ({ ...s, payload: mergePage(s.payload, page), paging: null }));
        }
      })
      .catch((error) => !stale && setState((s) => ({ ...s, paging: { error: error.message } })));
    return () => {
      stale = true;
    };
  }, [offset, token, pageTool, state.paging?.error]);

  const retryPaging = () => setState((s) => ({ ...s, paging: null }));

  return { ...state, refresh, sendMessage, callTool, retryPaging };
}

function Meta({ details }) {
  if (!details.meta.length) return null;
  return (
    <div className="meta muted">
      {details.meta.map(([k, v]) => (
        <span key={k}>{k}: <span className="mono">{v}</span></span>
      ))}
    </div>
  );
}

function Loadable({ label, load }) {
  const [state, setState] = useState(null);
  const toggle = async () => {
    if (state) return setState(null);
    setState({ loading: true });
    try {
      const res = await load();
      setState(res?.error ? { error: res.error } : { text: res?.text ?? '(empty)', note: res?.message });
    } catch (error) {
      setState({ error: error.message });
    }
  };
  return (
    <>
      <button onClick={toggle}>{state ? `Hide ${label}` : `Show ${label}`}</button>
      {state?.loading && <span className="muted"> Loading…</span>}
      {state?.error && <span className="muted"> {state.error}</span>}
      {state?.text && (
        <>
          {state.note && <p className="muted">{state.note}</p>}
          <pre className="block mono">{state.text}</pre>
        </>
      )}
    </>
  );
}

function ArchitecturePanel({ arch, semgrep, callTool }) {
  return (
    <section className="panel">
      <h2>Architecture rules <span className={`adapter status-${arch.status}`}>{arch.status}</span></h2>
      <dl>
        <dt>Gate command</dt>
        <dd className="mono">{arch.command ?? `not bound (${arch.binding ?? 'Gate command'})`}</dd>
        {arch.exit_code !== undefined && (<><dt>Exit code</dt><dd className="mono">{arch.exit_code}</dd></>)}
        {arch.message && (<><dt>Message</dt><dd>{arch.message}</dd></>)}
      </dl>
      {arch.output && (
        <details>
          <summary>Gate output{arch.output_truncated ? ' (last 1,500 characters)' : ''}</summary>
          <pre className="block mono">{arch.output}</pre>
        </details>
      )}
      {arch.sources.length > 0 && (
        <table>
          <thead>
            <tr><th>Source</th><th>Path</th><th>State</th><th /></tr>
          </thead>
          <tbody>
            {arch.sources.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.id}</td>
                <td className="mono">{s.path}</td>
                <td>{s.filled ? 'filled' : <span className="muted">unfilled stub (not product truth)</span>}</td>
                <td>{s.filled && (s.text
                  ? <details><summary>text</summary><pre className="block mono">{s.text}</pre></details>
                  : <Loadable label="text" load={() => callTool('verify_architecture_rules', { source: s.id })} />)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {semgrep && semgrep.source !== 'none' && !semgrep.yaml && (
        <div className="rules">
          <Loadable label="Semgrep rules" load={() => callTool('verify_architecture_rules', { source: 'semgrep' })} />
        </div>
      )}
    </section>
  );
}

function AuditDetails({ details }) {
  const { commands, notes, reports, recurring, suppressed } = details;
  if (!commands.length && !notes.length && !reports.length && !recurring && !suppressed.length) return null;
  return (
    <section className="panel">
      {commands.length > 0 && (
        <table>
          <thead>
            <tr><th>Command</th><th>Run</th><th>Status</th><th>Exit</th></tr>
          </thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.name}>
                <td className="mono">{c.name}</td>
                <td className="mono">{c.command}</td>
                <td><span className={`adapter status-${c.status}`}>{c.status}</span></td>
                <td className="mono">{c.exit_code ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {commands.filter((c) => c.output).map((c) => (
        <details key={`${c.name}-out`}>
          <summary>{c.name} output</summary>
          <pre className="block mono">{c.output}</pre>
        </details>
      ))}
      {recurring > 0 && <p>{recurring} recurring finding{recurring === 1 ? '' : 's'} (QG-DEB-06), tagged below.</p>}
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {suppressed.length > 0 && (
        <details>
          <summary>Dismissed by triage ({suppressed.length})</summary>
          <ul className="notes mono">{suppressed.map((f) => <li key={f.id}>{f.id} {f.check}</li>)}</ul>
        </details>
      )}
      {reports.length > 0 && (
        <details>
          <summary>Reports ({reports.length})</summary>
          <ul className="notes mono">{reports.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function CiView({ ci }) {
  return (
    <main>
      <header><h1>{TITLES.ci}</h1><span className="mode">{ci.provider}</span></header>
      <p>Suggested path: <span className="mono">{ci.path}</span></p>
      {ci.note && <p className="notice">{ci.note}</p>}
      <pre className="block mono">{ci.content}</pre>
    </main>
  );
}

function Summary({ vm }) {
  const s = vm.summary;
  return (
    <div className="summary">
      <span className={`level level-${vm.level}`}>{vm.level}</span>
      {s.files_analyzed !== undefined && <span>{s.files_analyzed} files analyzed</span>}
      {vm.showCompliance && <span>spec compliance {percent(s.spec_compliance)}</span>}
      {s.base && <span className="mono">{s.base.ref ?? s.base}…{s.target ?? 'HEAD'}</span>}
      {s.linked_slices?.length > 0 && <span>slices: {s.linked_slices.join(', ')}</span>}
      {vm.suppressed > 0 && <span>{vm.suppressed} dismissed by triage</span>}
    </div>
  );
}

function TracePaths({ paths }) {
  if (!(paths?.length > MAX_PATHS)) return null;
  return (
    <details className="trace">
      <summary>All files ({paths.length})</summary>
      <ul>{paths.map((p) => <li key={p} className="mono">{p}</li>)}</ul>
    </details>
  );
}

function Trace({ trace }) {
  if (trace.loading) return <div className="trace muted">Tracing…</div>;
  if (trace.error) return <div className="trace muted">{trace.error}</div>;
  if (!trace.nodes?.length) {
    return (
      <>
        <TracePaths paths={trace.paths} />
        <div className="trace muted">{traceSummary(trace)}</div>
      </>
    );
  }
  return (
    <div className="trace">
      <TracePaths paths={trace.paths} />
      <ul>
        {trace.nodes.map((n) => (
          <li key={n.id} className="mono">{n.id}{n.title ? ` — ${n.title}` : ''}</li>
        ))}
      </ul>
      {trace.edges?.length > 0 && (
        <details>
          <summary>Edges ({trace.edges.length})</summary>
          <ul>
            {trace.edges.map((e) => (
              <li key={`${e.from}|${e.rel}|${e.to}`} className="mono">{e.from} —{e.rel}→ {e.to}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FindingRow({ finding, mode, onAction, onTrace, sent }) {
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [trace, setTrace] = useState(null);
  const toggleTrace = async () => {
    if (trace) return setTrace(null);
    setTrace({ loading: true });
    setTrace(await onTrace(finding));
  };
  // No <form>: host sandboxes usually omit allow-forms, which blocks submission.
  const submit = (a) => reason.trim() && onAction(a, finding, { reason: reason.trim() });
  return (
    <li className={`finding sev-${finding.severity}${finding.check === 'SEMGREP' ? ' semgrep-hit' : ''}`}>
      <div className="finding-head">
        <span className="badge">{finding.severity}</span>
        <span className="mono">{finding.check}</span>
        {finding.verdict && <span className={`verdict verdict-${finding.verdict}`}>{finding.verdict}</span>}
        {finding.source === 'inferential' && <span className="tag">inferential</span>}
        {finding.recurring && <span className="tag">recurring{finding.occurrences ? ` ×${finding.occurrences}` : ''}</span>}
        {finding.slice_id && <span className="tag">{finding.slice_id}</span>}
        {finding.rule && <span className="mono">{finding.rule}</span>}
        {finding.adapter && <span className="muted">{finding.adapter}</span>}
        <span className="muted mono">{finding.id}</span>
      </div>
      <div className="message">{finding.message}</div>
      {finding.paths?.length > 0 && (
        <div className="paths mono" title={finding.paths.join('\n')}>
          {finding.paths.slice(0, MAX_PATHS).map((p, i) => (
            <span key={p}>{i ? ', ' : ''}{p}{i === 0 && finding.line ? `:${finding.line}` : ''}</span>
          ))}
          {(finding.paths_total ?? finding.paths.length) > MAX_PATHS && ` +${(finding.paths_total ?? finding.paths.length) - Math.min(MAX_PATHS, finding.paths.length)} more (Trace lists them)`}
        </div>
      )}
      {(finding.first_seen || finding.node) && (
        <div className="muted small">
          {finding.node && <span className="mono">{finding.node} </span>}
          {finding.first_seen && <span>first seen {finding.first_seen.slice(0, 10)}, last {String(finding.last_seen ?? '').slice(0, 10)}</span>}
        </div>
      )}
      {finding.code && <pre className="code mono">{finding.code}</pre>}
      {finding.fix && <pre className="fix mono">{finding.fix}</pre>}
      {finding.remediation && <p className="remediation">{finding.remediation}</p>}
      {trace && <Trace trace={trace} />}
      <div className="actions">
        <button onClick={toggleTrace}>{trace ? 'Hide trace' : 'Trace'}</button>
        {sent ? (
          <span className="muted">Sent: {sent}</span>
        ) : (
          actionsFor(mode).map((a) =>
            a.needsReason && asking ? (
              <div key={a.id} className="reason">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit(a)}
                  placeholder="Reason (cite an ADR if there is one)"
                />
                <button onClick={() => submit(a)} disabled={!reason.trim()}>Send</button>
              </div>
            ) : (
              <button key={a.id} onClick={() => (a.needsReason ? setAsking(true) : onAction(a, finding))}>
                {a.label}
              </button>
            ),
          )
        )}
      </div>
    </li>
  );
}

export default function App() {
  const host = useHost();
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState('all');
  const [sent, setSent] = useState({});
  const vm = useMemo(() => viewModel(host.payload), [host.payload]);
  const mode = resolveMode(host.toolName, host.args, host.payload);

  if (!vm) {
    const text = { connecting: 'Connecting to host…', waiting: 'Waiting for the tool result…', cancelled: `Cancelled ${host.error ?? ''}`, error: `Error: ${host.error}` };
    return <main className="empty">{text[host.status] ?? 'No result'}</main>;
  }
  if (vm.error) return <main className="empty">Error: {vm.error}</main>;
  if (vm.kind === 'ci') return <CiView ci={vm.ci} />;

  const visible = vm.findings.filter((f) =>
    (filter === 'all' || f.severity === filter) &&
    (source === 'all' || (f.source === 'inferential') === (source === 'inferential')));
  const onAction = async (action, finding, opts) => {
    try {
      await host.sendMessage(messageFor(action.id, finding, opts));
      setSent((s) => ({ ...s, [finding.id]: action.label.replace('…', '') }));
    } catch (error) {
      setSent((s) => ({ ...s, [finding.id]: `failed (${error.message})` }));
    }
  };
  const onTrace = async (finding) => {
    try {
      const res = await host.callTool('audit_finding', { id: finding.id });
      return res?.error
        ? { error: res.error }
        : { nodes: res?.trace?.nodes ?? [], edges: res?.trace?.edges ?? [], indexed: Boolean(res?.trace), paths: res?.finding?.paths ?? [] };
    } catch (error) {
      return { error: error.message };
    }
  };

  if (vm.kind === 'finding') {
    const [f] = vm.findings;
    return (
      <main>
        <header><h1>{TITLES.finding}</h1><span className="mode">{mode === 'review' ? 'Tech Lead review' : 'Author'}</span></header>
        <ul className="findings">
          <FindingRow finding={f} mode={mode} onAction={onAction} onTrace={onTrace} sent={sent[f.id]} />
        </ul>
        {vm.trace ? <Trace trace={{ ...vm.trace, indexed: true, paths: f.paths }} /> : <div className="trace muted">{traceSummary({ indexed: false })}</div>}
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>{TITLES[vm.kind]}</h1>
        <span className="mode">{mode === 'review' ? 'Tech Lead review' : 'Author'}</span>
        {host.toolName && (
          <button className="refresh" onClick={host.refresh} disabled={host.status === 'refreshing'}>
            {host.status === 'refreshing' ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </header>
      <Summary vm={vm} />
      <Meta details={vm.details} />
      {vm.checks.length > 0 && (
        <div className="adapters">
          {vm.checks.map((c) => (
            <span key={c.id} className={`adapter status-${c.status}`} title={c.message ?? ''}>
              {c.label ?? `${c.id}: ${c.status}`}
            </span>
          ))}
        </div>
      )}
      {vm.unconfigured.length > 0 && (
        <p className="notice">Not checked (unconfigured, not a pass): {vm.unconfigured.join(', ')}</p>
      )}
      {vm.semgrep && (
        <p className={`notice semgrep status-${vm.semgrep.status}`}>
          Semgrep {vm.semgrep.status}
          {vm.semgrep.source ? ` · ${vm.semgrep.source}` : ''}
          {vm.semgrep.path ? ` · ${vm.semgrep.path}` : ''}
          {vm.semgrep.message ? ` — ${vm.semgrep.message}` : ''}
        </p>
      )}
      {vm.semgrep?.yaml && (
        <details className="rules">
          <summary>Generated Semgrep rules</summary>
          <pre className="mono">{vm.semgrep.yaml}</pre>
        </details>
      )}
      {vm.details.architecture && <ArchitecturePanel arch={vm.details.architecture} semgrep={vm.semgrep} callTool={host.callTool} />}
      <AuditDetails details={vm.details} />
      {vm.hotspots.length > 0 && (
        <details className="hotspots">
          <summary>Hotspots ({vm.hotspots.length})</summary>
          <table>
            <thead>
              <tr><th>File</th><th>Score</th><th>Churn</th><th>REQ links</th><th>Findings</th></tr>
            </thead>
            <tbody>
              {vm.hotspots.map((h) => (
                <tr key={h.path}>
                  <td className="mono">{h.path}</td><td>{h.score}</td><td>{h.churn}</td><td>{h.req_links}</td><td>{h.findings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {vm.sources && (
        <nav className="filters">
          {[['all', vm.total], ['computational', vm.sources.computational], ['inferential', vm.sources.inferential]].map(([s, n]) => (
            <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>
              {s} {n}
            </button>
          ))}
        </nav>
      )}
      <nav className="filters">
        {['all', ...SEVERITIES].map((s) => (
          <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
            {s} {s === 'all' ? vm.total : vm.counts[s]}
          </button>
        ))}
      </nav>
      {vm.loaded < vm.total && (
        <p className="notice">
          Showing {vm.loaded} of {vm.total} findings.{' '}
          {host.paging?.error ? (
            <>Loading the rest failed ({host.paging.error}). <button onClick={host.retryPaging}>Retry</button></>
          ) : (
            'Loading the rest…'
          )}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="empty">No findings.</p>
      ) : (
        <ul className="findings">
          {visible.map((f) => (
            <FindingRow key={f.id} finding={f} mode={mode} onAction={onAction} onTrace={onTrace} sent={sent[f.id]} />
          ))}
        </ul>
      )}
    </main>
  );
}
