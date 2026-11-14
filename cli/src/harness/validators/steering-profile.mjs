#!/usr/bin/env node
/**
 * steering-profile.mjs — kit_steering_rule slot conformance (R-002/R-006/R-007/R-009).
 *
 * Required slots per registry class:
 *   portable / module   → INVARIANTS, NEGATIVE_SPACE, ENFORCEMENT, ESCALATION
 *   hybrid-index        → ENFORCEMENT (other slots optional)
 *   binding / index / contract-doc / artifact_template → exempt (template files
 *                         are skipped by class, per D-9)
 *
 * INVARIANTS is satisfied by a heading naming it (`## Rules (invariants)`,
 * `## Acceptance criteria`, …) or by numbered rule ids (`**QG-DEC-01.**`).
 * A file carrying the declared `**Protocol file**` marker is its own normative
 * lifecycle — the whole body counts as the invariants slot (D-6).
 *
 * Severity: kit-block entries fail (the fleet is retrofitted); project-block
 * (consumer .local registry) entries warn — consumer steering is the drift
 * vector (AR-2) but must not be locked out.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSteeringRegistry } from './steering-tags.mjs';

const HEAD = {
  invariants: /^##+ .*(invariant|rules|principles|criteria|non-negotiable|disclosure|checklist|pattern)/im,
  negative_space: /^##+ .*(negative space|dropped|gold-plating|out of scope|when to load)/im,
  enforcement: /^##+ .*enforcement/im,
  escalation: /^##+ .*escalation/im,
};
const RULE_ID = /\*\*[A-Z]{2,}(?:-[A-Z0-9]+)*-\d+\.\*\*/;
const PROTOCOL_MARK = /\*\*Protocol file\*\*/;

const REQUIRED = {
  portable: ['invariants', 'negative_space', 'enforcement', 'escalation'],
  module: ['invariants', 'negative_space', 'enforcement', 'escalation'],
  'hybrid-index': ['enforcement'],
};

function hasSlot(text, slot) {
  if (slot === 'invariants') return HEAD.invariants.test(text) || RULE_ID.test(text);
  return HEAD[slot].test(text);
}

export default function validate(ctx) {
  const { root, fail, warn } = ctx;
  const reg = loadSteeringRegistry(root);
  if (!reg?.entries) return;
  const projectEntries = new Set();
  const local = join(root, '.harness/config/steering.registry.local.json');
  if (existsSync(local)) {
    try {
      const parsed = JSON.parse(readFileSync(local, 'utf8'));
      for (const p of Object.keys(parsed.project ?? parsed.kit ?? {})) projectEntries.add(p);
    } catch { /* malformed local registry is steering-tags' finding */ }
  }

  for (const [path, entry] of Object.entries(reg.entries)) {
    const required = REQUIRED[entry.class];
    if (!required || !path.startsWith('.harness/steering/')) continue;
    const abs = join(root, path);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    const slots = PROTOCOL_MARK.test(text)
      ? required.filter((s) => s !== 'invariants')
      : required;
    const missing = slots.filter((s) => !hasSlot(text, s));
    if (!missing.length) continue;
    const msg = `${path}: missing ${entry.class} slot(s): ${missing.join(', ')} (kit_steering_rule profile)`;
    if (projectEntries.has(path)) warn(msg);
    else fail(msg);
  }
}
