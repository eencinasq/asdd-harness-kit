/**
 * The optional `tracker` block of `.harness/config/project.json` (slice tracker-binding, REQ-001): which tracker holds
 * the PO/PM's pitches and Intent items (format: cli/skills/external-trackers/references/intent-format.md).
 *
 *   jira    project key (PROD) + site (acme.atlassian.net); pitch.issue_type; intent.issue_type and/or intent.label
 *   linear  team key (ENG); pitch.container project|issue (+ pitch.label for issue); intent.label
 *   github  owner/repo; pitch.label; intent.label
 *
 * Pure: returns error strings (relative to `tracker`), and check-project-config.mjs prefixes and FAILs them.
 */

export const TRACKER_TYPES = Object.freeze(['jira', 'linear', 'github']);

const PROJECT_FORMAT = {
  jira: [/^[A-Z][A-Z0-9_]+$/, 'a jira project key (e.g. PROD)'],
  linear: [/^[A-Z][A-Z0-9]*$/, 'a linear team key (e.g. ENG)'],
  github: [/^[\w.-]+\/[\w.-]+$/, 'owner/repo (e.g. acme/shop)'],
};

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @returns {string[]} errors, empty when the block is valid */
export function validateTrackerConfig(tracker) {
  if (!isObject(tracker)) return ['tracker must be an object'];
  if (!TRACKER_TYPES.includes(tracker.type)) {
    return [`tracker.type must be one of ${TRACKER_TYPES.join(', ')} (got ${JSON.stringify(tracker.type)})`];
  }
  const errors = [];
  const text = (obj, key, at) => {
    if (!isText(obj?.[key])) errors.push(`${at}.${key} must be a non-empty string`);
  };
  const object = (key) => {
    if (isObject(tracker[key])) return true;
    errors.push(`tracker.${key} must be an object`);
    return false;
  };

  const { type, pitch, intent } = tracker;
  text(tracker, 'project', 'tracker');
  if (isText(tracker.project)) {
    const [re, what] = PROJECT_FORMAT[type];
    if (!re.test(tracker.project)) errors.push(`tracker.project must be ${what} (got ${JSON.stringify(tracker.project)})`);
  }

  if (type === 'jira') {
    text(tracker, 'site', 'tracker');
    if (object('pitch')) text(pitch, 'issue_type', 'tracker.pitch');
    if (object('intent') && !isText(intent.issue_type) && !isText(intent.label)) {
      errors.push('tracker.intent needs issue_type or label');
    }
  }
  if (type === 'linear') {
    if (object('pitch')) {
      if (!['project', 'issue'].includes(pitch.container)) errors.push('tracker.pitch.container must be "project" or "issue"');
      else if (pitch.container === 'issue') text(pitch, 'label', 'tracker.pitch');
    }
    if (object('intent')) text(intent, 'label', 'tracker.intent');
  }
  if (type === 'github') {
    if (object('pitch')) text(pitch, 'label', 'tracker.pitch');
    if (object('intent')) text(intent, 'label', 'tracker.intent');
  }
  return errors;
}
