/**
 * knowledge-lib.mjs — scan .harness/ SoT into a knowledge index.
 *
 * Produces a flat, regenerable projection:
 *   - nodes:  slices, spec docs, requirements (EARS), features, files, sessions
 *   - edges:  traceability + ownership + dependency relationships
 *   - chunks: embeddable text units (one per REQ / spec section / session /
 *             log entry) for lexical or vector search
 *
 * The files under .harness/ remain the source of truth. The knowledge index
 * is GENERATED output — delete .harness/knowledge/ and re-run
 * sync-knowledge.mjs to rebuild from scratch.
 *
 * Dependency-free: no graph DB, no vector DB required. Storage is JSONL so it
 * can be grepped, diffed, or loaded into Kuzu/Neo4j/pgvector later.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export const KNOWLEDGE_DIR = '.harness/knowledge';

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readJson(path) {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path, filter));
    else if (entry.isFile() && filter(entry.name)) out.push(path);
  }
  return out;
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function slugSliceId(specsDirName) {
  return specsDirName;
}

// ------------------------------------------------------------------
// Parsers
// ------------------------------------------------------------------

// Real-world specs vary: REQ-001, REQ-B03-001, REQ-RTD-021, REQ-USM-012 —
// heading levels ##-#### and separators " — ", " – ", " - ", ":" or none.
const REQ_HEADING = /^#{2,4}\s+(REQ-[A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*)$/;
const AC_HEADING = /^#{2,4}\s+(AC-[A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*)$/;
const cleanTitle = (t) => String(t ?? '').replace(/^[—–\-:.\s]+/, '').trim();

/**
 * Split a markdown doc into sections by `## ` headings, preserving the
 * `### REQ-xxx` / `### AC-xxx` blocks as their own chunks.
 */
function parseSpecDoc(root, filePath, sliceId) {
  const text = readText(filePath);
  if (text === null) return { requirements: [], acs: [], sections: [] };

  const rel = relative(root, filePath).replaceAll('\\', '/');
  const lines = text.split('\n');
  const requirements = [];
  const acs = [];
  const sections = [];
  let current = null; // {kind:'section'|'req'|'ac', id, title, lines}
  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (!body) {
      current = null;
      return;
    }
    if (current.kind === 'req') {
      requirements.push({ id: current.id, title: current.title, body });
    } else if (current.kind === 'ac') {
      acs.push({ id: current.id, title: current.title, body });
    } else {
      sections.push({ title: current.title, body });
    }
    current = null;
  };

  for (const line of lines) {
    const reqMatch = line.match(REQ_HEADING);
    const acMatch = line.match(AC_HEADING);
    if (reqMatch) {
      flush();
      current = { kind: 'req', id: reqMatch[1], title: cleanTitle(reqMatch[2]), lines: [] };
      continue;
    }
    if (acMatch) {
      flush();
      current = { kind: 'ac', id: acMatch[1], title: cleanTitle(acMatch[2]), lines: [] };
      continue;
    }
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      flush();
      current = { kind: 'section', title: line.replace(/^##\s+/, '').trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return { requirements, acs, sections, rel };
}

// ------------------------------------------------------------------
// Scan
// ------------------------------------------------------------------

export function scanKnowledge(root = process.cwd()) {
  const nodes = [];
  const edges = [];
  const chunks = [];

  const node = (id, type, props = {}) => nodes.push({ id, type, ...props });
  const edge = (from, to, rel, props = {}) => edges.push({ from, to, rel, ...props });
  const chunk = (id, nodeId, sliceId, text, props = {}) =>
    chunks.push({ id, node: nodeId, slice_id: sliceId ?? null, text, hash: sha(text), ...props });

  const slices = new Map(); // slice_id -> {hasSpec, hasState}

  // ---- Specs: .harness/specs/<slice>/*.md ------------------------------
  const specsRoot = join(root, '.harness/specs');
  if (existsSync(specsRoot)) {
    for (const entry of readdirSync(specsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sliceId = slugSliceId(entry.name);
      const sliceDir = join(specsRoot, entry.name);
      slices.set(sliceId, { ...(slices.get(sliceId) || {}), hasSpec: true });

      for (const file of walk(sliceDir, (n) => n.endsWith('.md'))) {
        const docType = file.replace(/\.md$/, '').split('/').pop();
        const specNodeId = `spec:${sliceId}:${docType}`;
        const doc = parseSpecDoc(root, file, sliceId);
        node(specNodeId, 'spec_doc', {
          slice_id: sliceId,
          doc_type: docType,
          path: doc.rel,
          mtime: statSync(file).mtime.toISOString(),
        });
        edge(`slice:${sliceId}`, specNodeId, 'HAS_SPEC');

        for (const sec of doc.sections) {
          chunk(
            `chunk:${specNodeId}#${sha(sec.title).slice(0, 8)}`,
            specNodeId,
            sliceId,
            `[${sliceId} / ${docType} / ${sec.title}]\n${sec.body}`,
            { doc_type: docType, section: sec.title }
          );
        }

        for (const req of doc.requirements) {
          const reqId = `req:${sliceId}:${req.id}`;
          node(reqId, 'requirement', {
            slice_id: sliceId,
            req_id: req.id,
            title: req.title,
            spec_doc: specNodeId,
          });
          edge(specNodeId, reqId, 'DEFINES_REQ');
          chunk(`chunk:${reqId}`, reqId, sliceId, `[${sliceId} / ${req.id} — ${req.title}]\n${req.body}`, {
            doc_type: docType,
            req_id: req.id,
          });
        }

        for (const ac of doc.acs) {
          const acId = `ac:${sliceId}:${ac.id}`;
          node(acId, 'acceptance_criterion', {
            slice_id: sliceId,
            ac_id: ac.id,
            title: ac.title,
            spec_doc: specNodeId,
          });
          edge(specNodeId, acId, 'DEFINES_AC');
          chunk(`chunk:${acId}`, acId, sliceId, `[${sliceId} / ${ac.id} — ${ac.title}]\n${ac.body}`, {
            doc_type: docType,
            ac_id: ac.id,
          });
        }
      }
    }
  }

  // ---- Features: .harness/features/*.features.json ----------------------
  const featuresRoot = join(root, '.harness/features');
  if (existsSync(featuresRoot)) {
    for (const name of readdirSync(featuresRoot)) {
      if (!name.endsWith('.features.json')) continue;
      const doc = readJson(join(featuresRoot, name));
      if (!doc || !Array.isArray(doc.features)) continue;
      const sliceId = doc.slice_id || name.replace(/\.features\.json$/, '');
      slices.set(sliceId, { ...(slices.get(sliceId) || {}), hasSpec: true });

      for (const f of doc.features) {
        const featId = `feature:${sliceId}:${f.id}`;
        node(featId, 'feature', {
          slice_id: sliceId,
          feature_id: f.id,
          title: f.title,
          status: f.status,
          priority: f.priority,
          owner: f.owner ?? null,
        });
        edge(`slice:${sliceId}`, featId, 'HAS_FEATURE');
        chunk(
          `chunk:${featId}`,
          featId,
          sliceId,
          `[${sliceId} / feature ${f.id} — ${f.title} (${f.status})]\n${f.user_visible_behavior ?? ''}\nverification: ${(f.verification ?? []).join('; ')}\nevidence: ${f.evidence ?? ''}`,
          { feature_id: f.id, status: f.status }
        );

        for (const reqId of f.req_ids ?? []) {
          edge(featId, `req:${sliceId}:${reqId}`, 'IMPLEMENTS_REQ');
        }
        for (const dep of f.depends_on ?? []) {
          edge(featId, `feature:${sliceId}:${dep}`, 'DEPENDS_ON');
        }
        for (const p of f.scope_paths ?? []) {
          const fileNodeId = `file:${p}`;
          node(fileNodeId, 'file', { path: p });
          edge(featId, fileNodeId, 'OWNS');
        }
      }
    }
  }

  // ---- State: .harness/state/slices/<id>/ -------------------------------
  const stateRoot = join(root, '.harness/state/slices');
  if (existsSync(stateRoot)) {
    for (const entry of readdirSync(stateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sliceId = entry.name;
      const sliceDir = join(stateRoot, entry.name);
      slices.set(sliceId, { ...(slices.get(sliceId) || {}), hasState: true });

      const manifest = readJson(join(sliceDir, 'manifest.json'));
      node(`slice:${sliceId}`, 'slice', {
        slice_id: sliceId,
        phase: manifest?.phase ?? null,
        status: manifest?.status ?? null,
        mode: manifest?.mode ?? null,
        manifest_path: `.harness/state/slices/${sliceId}/manifest.json`,
      });

      const sessionsDir = join(sliceDir, 'sessions');
      for (const file of walk(sessionsDir, (n) => n.endsWith('.json'))) {
        const s = readJson(file);
        if (!s) continue;
        const sessNodeId = `session:${sliceId}:${s.session_id ?? file.split('/').pop()}`;
        node(sessNodeId, 'session', {
          slice_id: sliceId,
          session_id: s.session_id ?? null,
          event_type: s.event_type ?? null,
          phase: s.phase ?? null,
          agent: s.agent ?? s.agent_id ?? null,
          timestamp: s.timestamp ?? null,
        });
        edge(`slice:${sliceId}`, sessNodeId, 'HAS_SESSION');

        const summary = [
          `[${sliceId} / session ${s.session_id ?? ''} / ${s.event_type ?? 'event'} / ${s.phase ?? ''}]`,
          s.summary ?? s.note ?? s.evidence ?? '',
          Array.isArray(s.scope_paths) && s.scope_paths.length ? `scope: ${s.scope_paths.join(', ')}` : '',
          Array.isArray(s.new_domain_terms) && s.new_domain_terms.length ? `domain terms: ${s.new_domain_terms.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        chunk(`chunk:${sessNodeId}`, sessNodeId, sliceId, summary, {
          event_type: s.event_type ?? null,
          phase: s.phase ?? null,
        });

        if (s.event_type === 'dissent') {
          edge(sessNodeId, `slice:${sliceId}`, 'DISSENT_ON');
        }
        for (const p of s.scope_paths ?? []) {
          const fileNodeId = `file:${p}`;
          node(fileNodeId, 'file', { path: p });
          edge(sessNodeId, fileNodeId, 'TOUCHED');
        }
      }
    }
  }

  // ---- Slices that only exist in specs/features ------------------------
  for (const [sliceId] of slices) {
    if (!nodes.some((n) => n.id === `slice:${sliceId}`)) {
      node(`slice:${sliceId}`, 'slice', { slice_id: sliceId, phase: null, status: null, mode: null });
    }
  }

  // ---- Knowledge logs: docs/{agent-failure-log,dissent-log}.md ----------
  for (const [logFile, logType] of [
    ['docs/agent-failure-log.md', 'failure_log'],
    ['docs/dissent-log.md', 'dissent_log'],
  ]) {
    const path = join(root, logFile);
    const text = readText(path);
    if (text === null) continue;
    const nodeId = `log:${logType}`;
    node(nodeId, 'knowledge_log', { path: logFile, log_type: logType });

    // Entries start with "- **Date:**" bullets under the Incidents/Entries section
    let entryIdx = 0;
    for (const match of text.matchAll(/^- \*\*Date:\*\*[^\n]*(?:\n(?!- \*\*Date:)[^\n]*)*/gm)) {
      const body = match[0].trim();
      if (!body) continue;
      entryIdx += 1;
      const sliceMatch = body.match(/\*\*Slice:\*\*\s*`?([^\s`<]+)/);
      const sliceId = sliceMatch?.[1] ?? null;
      const entryId = `${nodeId}:${entryIdx}`;
      node(entryId, 'log_entry', { log_type: logType, index: entryIdx, slice_id: sliceId });
      edge(nodeId, entryId, 'HAS_ENTRY');
      if (sliceId) edge(entryId, `slice:${sliceId}`, 'ABOUT_SLICE');
      chunk(`chunk:${entryId}`, entryId, sliceId, `[${logType} entry ${entryIdx}]\n${body}`, {
        log_type: logType,
      });
    }
  }

  // Deduplicate nodes/edges (multiple producers can emit the same id)
  const seenNodes = new Map();
  for (const n of nodes) if (!seenNodes.has(n.id)) seenNodes.set(n.id, n);
  const edgeKey = (e) => `${e.from}|${e.rel}|${e.to}`;
  const seenEdges = new Map();
  for (const e of edges) if (!seenEdges.has(edgeKey(e))) seenEdges.set(edgeKey(e), e);

  return {
    nodes: [...seenNodes.values()],
    edges: [...seenEdges.values()],
    chunks,
    stats: {
      slices: [...seenNodes.values()].filter((n) => n.type === 'slice').length,
      nodes: seenNodes.size,
      edges: seenEdges.size,
      chunks: chunks.length,
    },
  };
}
