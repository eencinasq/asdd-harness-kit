// Agent frontmatter (agents-spec REQ-004): parse the canonical `.agents/agents/<name>.md` header and render the agent
// file each runtime reads, with the tool envelope its `capabilities` and `limits` allow.
//
// Canonical subset: top-level scalars, a `>-` description block, and one-level maps (metadata, capabilities, limits)
// whose values are scalars or inline lists ([a, "b/*"]).

const scalar = (raw) => {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v.replace(/^(['"])(.*)\1$/, '$2');
};

const list = (raw) =>
  raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(scalar);

/** { data, body } — data holds name, description, model, mode, metadata, capabilities, limits; null without frontmatter. */
export function parseAgent(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const lines = text.slice(4, end).split('\n');
  const data = {};
  for (let i = 0; i < lines.length; i += 1) {
    const top = lines[i].match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!top) continue;
    const [, key, rest] = top;
    if (['>-', '>', '|-', '|'].includes(rest.trim())) {
      const parts = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1].trim() === '')) {
        i += 1;
        if (lines[i].trim()) parts.push(lines[i].trim());
      }
      data[key] = parts.join(' ');
    } else if (rest.trim() === '') {
      const map = {};
      while (i + 1 < lines.length && lines[i + 1].startsWith('  ')) {
        i += 1;
        const m = lines[i].match(/^\s+([A-Za-z_]+):\s*(.*)$/);
        if (m) map[m[1]] = m[2].trim().startsWith('[') ? list(m[2]) : scalar(m[2]);
      }
      data[key] = map;
    } else {
      data[key] = scalar(rest);
    }
  }
  const body = text.slice(end + 4).replace(/^\n+/, '');
  return { data, body };
}

/** What the agent may do, with the defaults agent.spec gives a leaf. */
export function envelope(data) {
  const caps = data.capabilities ?? {};
  const allow = new Set(caps.allow ?? ['read_file', 'run_command', 'write_file', 'edit_file']);
  for (const d of caps.deny ?? []) allow.delete(d);
  if (caps.write_tools === false) {
    allow.delete('write_file');
    allow.delete('edit_file');
  }
  return {
    allow,
    write: caps.write_tools !== false,
    mcp: caps.mcp_tools === true,
    subagents: caps.subagent_tools === true,
    writePaths: caps.write_paths ?? [],
    maxTurns: Number.isInteger(data.limits?.max_turns) ? data.limits.max_turns : null,
  };
}

const CLAUDE_TOOLS = { read_file: ['Read', 'Grep', 'Glob'], run_command: ['Bash'], write_file: ['Write'], edit_file: ['Edit'] };
const ALL_CLAUDE = ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'Agent'];

/** Claude Code tool names the agent may use (Agent only for an orchestrator). */
export function claudeTools(env) {
  const tools = [...env.allow].flatMap((a) => CLAUDE_TOOLS[a] ?? []);
  if (env.subagents) tools.push('Agent');
  return ALL_CLAUDE.filter((t) => tools.includes(t));
}

const quote = (s) => (/^[\w./-]+$/.test(s) ? s : JSON.stringify(s));

function header(source, runtime) {
  return `# Rendered by asdd install from ${source} for ${runtime}. Edit the source; this file is regenerated.`;
}

/** `.claude/agents/<name>.md`: an allowlist, or a denylist when the agent needs MCP tools (an allowlist would drop them). */
export function renderClaude({ data, body }, source) {
  const env = envelope(data);
  const tools = claudeTools(env);
  const lines = ['---', header(source, 'Claude Code'), `name: ${data.name}`, `description: ${JSON.stringify(data.description ?? '')}`];
  if (env.mcp) {
    const denied = ALL_CLAUDE.filter((t) => !tools.includes(t));
    if (denied.length) lines.push(`disallowedTools: ${denied.join(', ')}`);
  } else {
    lines.push(`tools: ${tools.join(', ')}`);
  }
  lines.push('model: inherit');
  if (env.maxTurns) lines.push(`maxTurns: ${env.maxTurns}`);
  return `${lines.join('\n')}\n---\n\n${body}`;
}

/** `.cursor/agents/<name>.md`: Cursor has one switch, `readonly` (no edits, no state-changing shell). */
export function renderCursor({ data, body }, source) {
  const env = envelope(data);
  const lines = ['---', header(source, 'Cursor'), `name: ${data.name}`, `description: ${JSON.stringify(data.description ?? '')}`, 'model: inherit'];
  if (!env.write) lines.push('readonly: true');
  return `${lines.join('\n')}\n---\n\n${body}`;
}

/**
 * `.opencode/agents/<name>.md`: ordered `permissions` (last match wins). Edits are denied outside `write_paths` when the
 * agent declares them (or entirely when it may not write); sub-agents are denied unless it is the orchestrator.
 */
export function renderOpenCode({ data, body }, source) {
  const env = envelope(data);
  const rules = [];
  const editAllowed = env.allow.has('write_file') || env.allow.has('edit_file');
  if (!editAllowed || env.writePaths.length) {
    rules.push(['edit', '*', 'deny']);
    if (editAllowed) for (const p of env.writePaths) rules.push(['edit', p, 'allow']);
  }
  if (!env.subagents) rules.push(['subagent', '*', 'deny']);
  const lines = ['---', header(source, 'OpenCode'), `description: ${JSON.stringify(data.description ?? '')}`, 'mode: subagent'];
  if (rules.length) {
    lines.push('permissions:');
    for (const [action, resource, effect] of rules) lines.push(`  - action: ${action}`, `    resource: ${quote(resource)}`, `    effect: ${effect}`);
  }
  if (env.maxTurns) lines.push(`steps: ${env.maxTurns}`);
  return `${lines.join('\n')}\n---\n\n${body}`;
}

export const RENDERERS = { claude: renderClaude, cursor: renderCursor, opencode: renderOpenCode };
