/**
 * Tracker Intent items (slice intent-intake, P6.4): parse and validate the format in
 * cli/skills/external-trackers/references/intent-format.md, resolve grounding refs against the repository, and render
 * `.harness/specs/<slice>/intent.md`. Pure functions over text and the file system; no network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const INTENT_FORMAT = '1';
export const REQUIRED_KEYS = Object.freeze([
  'intent_format', 'slice_id', 'mode', 'pitch', 'scope_id', 'betting_state', 'cycle', 'appetite', 'reference_slices', 'decided_by',
]);
export const OPTIONAL_KEYS = Object.freeze(['depends_on']);
export const REQUIRED_HEADINGS = Object.freeze([
  'Problem', 'Desired Outcome', 'Appetite', 'Must-have outcomes', 'No-gos', 'Grounding', 'Intent fitness',
]);
export const MODES = Object.freeze(['hotfix', 'lite', 'full']);
export const KINDS = Object.freeze(['Reuse', 'Extend', 'New']);
export const SLICE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const GROUNDING_HEADER = /^\|\s*Kind\s*\|\s*What\s*\|\s*Evidence\s*\|\s*$/;

/** One evidence token: `REQ:<slice>/REQ-NNN`, `slice:<id>`, `path:<repo-path>[#…]`, or `none`. */
export function parseRef(token) {
  const raw = token.trim();
  if (raw === 'none') return { kind: 'none', value: '', raw };
  const req = raw.match(/^REQ:([a-z0-9][a-z0-9_-]*)\/(REQ-\d+)$/);
  if (req) return { kind: 'REQ', value: `${req[1]}/${req[2]}`, slice: req[1], req: req[2], raw };
  const slice = raw.match(/^slice:([a-z0-9][a-z0-9_-]*)$/);
  if (slice) return { kind: 'slice', value: slice[1], raw };
  if (raw.startsWith('path:')) return { kind: 'path', value: raw.slice('path:'.length).split('#')[0], raw };
  return { kind: 'unknown', value: raw, raw };
}

/** A `path:` ref must stay inside the repository: relative, no `..` segment. */
const pathInside = (p) => p !== '' && !isAbsolute(p) && !p.split(/[\\/]/).includes('..');

function parseGrounding(body) {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (!lines.length) return { header: false, rows: [] };
  const header = GROUNDING_HEADER.test(lines[0]);
  const rows = lines
    .slice(1)
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .map((l) => {
      const cells = l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      return { kind: cells[0] ?? '', what: cells[1] ?? '', refs: (cells[2] ?? '').split(',').filter((t) => t.trim()).map(parseRef) };
    });
  return { header, rows };
}

/** Split an item body into the intent block, its level-2 sections (in order), and the grounding rows. */
export function parseIntentItem(text) {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const fence = src.match(/```asdd-intent[^\n]*\n([\s\S]*?)\n```/);
  let block = null;
  const order = [];
  if (fence) {
    block = {};
    for (const line of fence[1].split('\n')) {
      const m = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/);
      if (m) {
        block[m[1]] = m[2];
        order.push(m[1]);
      }
    }
  }
  const rest = fence ? src.slice(fence.index + fence[0].length) : src;
  const sections = [];
  let current = null;
  for (const line of rest.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = { heading: h[1], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  const sectionList = sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() }));
  const groundingSection = sectionList.find((s) => s.heading === 'Grounding');
  const grounding = groundingSection ? parseGrounding(groundingSection.body) : { header: false, rows: [] };
  return { block, keyOrder: order, sections: sectionList, groundingHeader: grounding.header, grounding: grounding.rows };
}

function groundingErrors(rows, header) {
  const errors = [];
  if (!header) errors.push('## Grounding: the table header must be exactly | Kind | What | Evidence |');
  if (!rows.length) errors.push('## Grounding: the table needs at least one row');
  rows.forEach((r, i) => {
    const at = `## Grounding row ${i + 1}`;
    if (!KINDS.includes(r.kind)) errors.push(`${at}: Kind must be ${KINDS.join(', ')} (got "${r.kind}")`);
    if (!r.refs.length) errors.push(`${at}: Evidence is empty (use none on New rows)`);
    for (const ref of r.refs) {
      if (ref.kind === 'unknown') errors.push(`${at}: unknown ref "${ref.raw}" (use REQ:<slice>/REQ-NNN, slice:<id>, path:<repo-path>, or none)`);
      if (ref.kind === 'path' && !pathInside(ref.value)) errors.push(`${at}: ${ref.raw} must stay inside the repository (relative, no ..)`);
      if (ref.kind === 'none' && r.kind !== 'New') errors.push(`${at}: none is allowed only on New rows`);
    }
    if ((r.kind === 'Reuse' || r.kind === 'Extend') && !r.refs.some((ref) => ref.kind !== 'none')) {
      errors.push(`${at}: a ${r.kind} row needs evidence (REQ:, slice:, or path:)`);
    }
  });
  return errors;
}

/** REQ-001: every problem with the item, by name; unknown block keys are warnings. */
export function validateIntentItem(parsed) {
  const errors = [];
  const warnings = [];
  if (!parsed.block) {
    errors.push('missing the ```asdd-intent fenced block');
  } else {
    const b = parsed.block;
    for (const k of REQUIRED_KEYS) if (!b[k]) errors.push(`missing key: ${k}`);
    for (const k of Object.keys(b)) if (!REQUIRED_KEYS.includes(k) && !OPTIONAL_KEYS.includes(k)) warnings.push(`unknown key ignored: ${k}`);
    if (b.intent_format && b.intent_format !== INTENT_FORMAT) errors.push(`intent_format must be ${INTENT_FORMAT} (got ${b.intent_format})`);
    if (b.slice_id && !SLICE_ID_RE.test(b.slice_id)) errors.push(`slice_id "${b.slice_id}" must match ${SLICE_ID_RE}`);
    if (b.mode && !MODES.includes(b.mode)) errors.push(`mode must be ${MODES.join(', ')} (got ${b.mode})`);
    if (b.betting_state && b.betting_state !== 'bet') errors.push(`betting_state must be bet (got ${b.betting_state}); only a bet pitch enters ASDD`);
  }
  const headings = new Set(parsed.sections.map((s) => s.heading));
  for (const h of REQUIRED_HEADINGS) if (!headings.has(h)) errors.push(`missing heading: ## ${h}`);
  const fitness = parsed.sections.find((s) => s.heading === 'Intent fitness');
  if (fitness && !/^\s*-\s*\**status\**\s*:\s*`?fit`?\s*$/m.test(fitness.body)) {
    errors.push('## Intent fitness: status must be fit');
  }
  if (headings.has('Grounding')) errors.push(...groundingErrors(parsed.grounding, parsed.groundingHeader));
  return { errors, warnings };
}

/** Whether one ref exists in the repository now (`none` and malformed refs are not "stale"). */
export function resolveRef(root, ref) {
  if (ref.kind === 'REQ') {
    return ['requirements.md', 'spec.md'].some((f) => {
      const p = join(root, '.harness/specs', ref.slice, f);
      return existsSync(p) && new RegExp(`\\b${ref.req}\\b`).test(readFileSync(p, 'utf8'));
    });
  }
  if (ref.kind === 'slice') return existsSync(join(root, '.harness/state/slices', ref.value));
  if (ref.kind === 'path') return pathInside(ref.value) && existsSync(join(root, ref.value));
  return true;
}

/** REQ-003: refs that are well formed but no longer resolve, in table order. */
export function staleRefs(root, rows) {
  const out = [];
  rows.forEach((r, i) => {
    for (const ref of r.refs) {
      if (['REQ', 'slice', 'path'].includes(ref.kind) && !resolveRef(root, ref)) out.push({ row: i + 1, ref: ref.raw });
    }
  });
  return out;
}

/** The `source` block of the slice's `001` session (external-trackers Step 3). */
export function sessionSource(parsed, { ref, trackerType }) {
  const b = parsed.block;
  return {
    tracker_type: trackerType ?? 'unknown',
    tracker_url: ref,
    pitch_id: b.pitch,
    scope_id: b.scope_id,
    cycle: b.cycle,
    assigned_by: b.decided_by,
    appetite: b.appetite,
    reference_slices: b.reference_slices,
    intake: 'asdd intake',
  };
}

/** REQ-002: intent.md — a generated `## Source`, then the item's sections verbatim (the machine block is not copied). */
export function renderIntentMd(parsed, { ref, stale = [], now = new Date() }) {
  const b = parsed.block;
  const source = [
    '## Source',
    '',
    `- **Pitch ID:** ${b.pitch}`,
    `- **Scope ID:** ${b.scope_id}`,
    '- **Betting state:** `bet`',
    `- **Cycle:** ${b.cycle}`,
    `- **Tracker URL:** ${ref}`,
    `- **Decided by:** ${b.decided_by}`,
    `- **Reference slices:** ${b.reference_slices}`,
    ...(b.depends_on ? [`- **Depends on:** ${b.depends_on}`] : []),
    `- **Imported:** ${now.toISOString().slice(0, 10)} by \`asdd intake\``,
    ...(stale.length ? [`- **Stale at intake:** ${stale.map((s) => s.ref).join(', ')}`] : []),
    '',
    '**Rule:** Only a `bet` pitch enters ASDD. For any other state, stop and ask the human.',
  ];
  const body = parsed.sections.filter((s) => s.heading !== 'Source').map((s) => `## ${s.heading}\n\n${s.body}`.trimEnd());
  return `# Intent: ${b.slice_id}\n\n${source.join('\n')}\n\n---\n\n${body.join('\n\n')}\n`;
}

/**
 * REQ-004: problems with the `## Grounding` table of an intent.md — malformed or unresolvable refs. An intent without the
 * section (written before tracker intents existed) is not reported.
 */
export function groundingFindings(root, intentMd) {
  const parsed = parseIntentItem(intentMd);
  if (!parsed.sections.some((s) => s.heading === 'Grounding')) return [];
  const malformed = groundingErrors(parsed.grounding, parsed.groundingHeader);
  const stale = staleRefs(root, parsed.grounding).map((s) => `row ${s.row}: ${s.ref} does not resolve`);
  return [...malformed, ...stale];
}
