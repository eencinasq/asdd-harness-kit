/**
 * env-loader.mjs — zero-dep .env loader for harness integrations.
 *
 * Precedence (highest first): real process env > .env.local > .env.
 * Call at module top before reading integration env vars
 * (JEV_API_KEY, KNOWLEDGE_EMBEDDINGS_*). Never logs or exposes values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function parseEnvLine(line) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m || !m[2]) return null;
  let value = m[2].trim();
  const quoted = /^"(.*)"$/.test(value) || /^'(.*)'$/.test(value);
  if (quoted) {
    value = value.slice(1, -1);
  } else {
    value = value.split(/\s+#/)[0].trim(); // strip inline comments on bare values
  }
  return [m[1], value];
}

/**
 * Load KEY=VALUE lines from <root>/.env then <root>/.env.local.
 * Keys already set in process.env are never overwritten.
 */
export function loadEnv(root = process.cwd()) {
  const realEnv = new Set(Object.keys(process.env));
  for (const name of ['.env', '.env.local']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (!realEnv.has(key)) process.env[key] = value;
    }
  }
}
