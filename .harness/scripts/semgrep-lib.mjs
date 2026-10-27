/**
 * Architecture scan via Semgrep. Shared by the spec-drift-auditor MCP server.
 *
 * 1. Read the filled architecture specs (callers pass them in).
 * 2. Select a Semgrep YAML config, or generate one in a temp file.
 * 3. Run `semgrep scan --json` and normalize results to findings.
 *
 * Never writes `.semgrep.yml` into the repo. A missing binary or missing
 * rules is not a pass.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readBinding } from './drift-lib.mjs';

const CONFIG_CANDIDATES = ['.semgrep.yml', '.semgrep.yaml', 'semgrep.yml', '.semgrep/architecture.yml'];
const UNFILLED = new Set(['', '…', '...', 'unfilled', 'n/a', 'na']);
const LANGUAGE_PATTERNS = [
  ['typescript', /typescript|\bts\b/i],
  ['javascript', /javascript|\bjs\b|\bnode(?:\.?js)?\b/i],
  ['python', /python|\bpy\b/i],
  ['go', /\bgolang\b|\bgo\b/i],
  ['kotlin', /kotlin/i],
  ['java', /\bjava\b/i],
  ['ruby', /\bruby\b/i],
  ['rust', /\brust\b/i],
  ['php', /\bphp\b/i],
  ['csharp', /csharp|c#/i],
];

const ARCHITECTURE_SOURCES = [
  { id: 'domain-layer', fallback: '.harness/steering/domain-layer.md' },
  { id: 'domain-layer.project', fallback: '.harness/steering/domain-layer.project.md', bindingKey: 'domain_layer' },
  { id: 'product', fallback: '.harness/steering/product.md', bindingKey: 'product' },
  { id: 'structure', fallback: '.harness/steering/structure.md', bindingKey: 'structure' },
  { id: 'tech', fallback: '.harness/steering/tech.md', bindingKey: 'tech' },
];

function readText(root, rel) {
  try {
    return readFileSync(join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

function isStub(text) {
  return /\(stub\)/i.test(text.split('\n').slice(0, 30).join('\n'));
}

/** Filled architecture specs. Binding paths follow project.json; "(stub)" files are unfilled. */
export function loadArchitectureSources(root, { includeText = true } = {}) {
  let bindings = {};
  try {
    bindings = JSON.parse(readFileSync(join(root, '.harness/config/project.json'), 'utf8')).bindings ?? {};
  } catch {
    bindings = {};
  }
  return ARCHITECTURE_SOURCES.map((src) => {
    const configured = src.bindingKey && typeof bindings[src.bindingKey] === 'string'
      ? insideRoot(root, bindings[src.bindingKey])
      : null;
    const path = configured || src.fallback;
    const text = readText(root, path);
    const filled = text !== null && !isStub(text);
    return {
      id: src.id,
      path,
      filled,
      ...(includeText && filled ? { text: text.trim() } : {}),
    };
  });
}

function insideRoot(root, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const abs = resolve(root, rel.trim());
  const fromRoot = relative(root, abs);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
  return fromRoot.split(sep).join('/');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function parseTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|')) continue;
    const header = splitRow(lines[i]);
    const sepLine = lines[i + 1] ?? '';
    if (!/^\s*\|?[\s|:-]*-{3,}[\s|:-]*$/.test(sepLine)) continue;
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].trim().startsWith('|')) {
      rows.push(splitRow(lines[j]));
      j += 1;
    }
    tables.push({ header, rows });
    i = j - 1;
  }
  return tables;
}

function cellValues(cell) {
  const ticks = [...String(cell ?? '').matchAll(/`([^`]*)`/g)].map((m) => m[1].trim());
  const raw = ticks.length ? ticks : [String(cell ?? '').trim()];
  return raw.filter((v) => v && !UNFILLED.has(v.toLowerCase()));
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|mjs|cjs|py|go|java|kt|kts|cs|rb|rs|php|vue|svelte)$/i;

function includeGlob(value) {
  if (value.includes('*')) return value;
  if (SOURCE_FILE.test(value)) return value;
  return `${value.replace(/\/$/, '')}/**`;
}

function packageScope(sources) {
  for (const src of sources) {
    if (!src?.filled || !src.text) continue;
    const match = src.text.match(/`(@[\w.-]+)\/\*`/);
    if (match) return match[1];
  }
  return null;
}

function layerTable(src) {
  for (const table of parseTables(src.text)) {
    const tagIdx = table.header.findIndex((h) => /^tag$/i.test(h.trim()));
    const projIdx = table.header.findIndex((h) => /\bprojects?\b/i.test(h));
    const vendorIdx = table.header.findIndex((h) => /vendor imports/i.test(h));
    if (tagIdx < 0 || projIdx < 0 || vendorIdx < 0) continue;
    const dependIdx = table.header.findIndex((h) => /may depend/i.test(h));
    return { ...table, tagIdx, projIdx, vendorIdx, dependIdx };
  }
  return null;
}

/** Adapter packages and vendor-import bans from the layer table and "must not import" lines. */
function deriveLayerRows(sources) {
  const scope = packageScope(sources);
  if (!scope) return [];
  const rows = [];
  for (const src of sources) {
    if (!src?.filled || !src.text) continue;
    const table = layerTable(src);
    if (!table) continue;
    const adapters = [];
    for (const row of table.rows) {
      const tag = cellValues(row[table.tagIdx])[0] ?? '';
      if (/adapter/i.test(tag)) adapters.push(...cellValues(row[table.projIdx]));
    }
    const adapterMods = [...new Set(adapters.flatMap((name) => {
      const scoped = `${scope}/${name}`;
      return /^[a-z][\w-]*$/.test(name) ? [scoped, name] : [scoped];
    }))];
    if (!adapterMods.length) continue;
    for (const row of table.rows) {
      const projects = cellValues(row[table.projIdx]);
      const vendor = cellValues(row[table.vendorIdx]).map((v) => v.toLowerCase());
      if (vendor.includes('banned') && projects.length) {
        rows.push({ paths: projects.map((p) => includeGlob(`libs/${p}`)), mods: adapterMods, source: src.path });
      }
      const depend = table.dependIdx >= 0 ? String(row[table.dependIdx] ?? '').replace(/\*/g, '') : '';
      if (/not other adapters/i.test(depend)) {
        for (const project of projects) {
          const mods = adapterMods.filter((m) => m !== `${scope}/${project}` && m !== project);
          if (mods.length) rows.push({ paths: [includeGlob(`libs/${project}`)], mods, source: src.path });
        }
      }
    }
    const covered = new Set(rows.filter((row) => row.mods === adapterMods).flatMap((row) => row.paths));
    for (const line of src.text.split('\n')) {
      if (!/must not import/i.test(line) || !/adapter/i.test(line)) continue;
      const clause = line.split(/must not import/i)[0];
      const paths = [...new Set([...clause.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((p) => p.startsWith('libs/')))].map(includeGlob).filter((p) => !covered.has(p));
      if (paths.length) rows.push({ paths, mods: adapterMods, source: src.path });
    }
  }
  return rows;
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${[...row.paths].sort().join(',')}|${[...row.mods].sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rows of `{ paths, mods, source }` from steering tables and "must not import" lines. */
export function boundaryRows(sources) {
  const rows = [];
  for (const src of sources) {
    if (!src?.filled || !src.text) continue;
    for (const table of parseTables(src.text)) {
      const pathIdx = table.header.findIndex((h) => /\bpaths?\b|\binclude\b|\blayer path\b/i.test(h));
      const denyIdx = table.header.findIndex((h) => /must not import|forbidden|banned|\bdeny\b/i.test(h));
      if (pathIdx < 0 || denyIdx < 0) continue;
      for (const row of table.rows) {
        const paths = cellValues(row[pathIdx]).map(includeGlob);
        const mods = cellValues(row[denyIdx]);
        if (paths.length && mods.length) rows.push({ paths, mods, source: src.path });
      }
    }
  }
  return dedupeRows([...rows, ...deriveLayerRows(sources)]);
}

export function languagesFrom(text) {
  if (!text) return [];
  const found = [];
  const add = (cell) => {
    const value = cellValues(cell).join(' ');
    if (!value) return;
    for (const [language, re] of LANGUAGE_PATTERNS) {
      if (re.test(value) && !found.includes(language)) found.push(language);
    }
  };
  for (const table of parseTables(text)) {
    const langCol = table.header.findIndex((h) => /language/i.test(h));
    if (langCol >= 0) {
      for (const row of table.rows) add(row[langCol]);
    }
    for (const row of table.rows) {
      if (/language/i.test(row[0] ?? '')) add(row.slice(1).join(' '));
    }
  }
  return found;
}

function yamlQuote(value) {
  return JSON.stringify(value);
}

function importPatterns(language, mod) {
  const esc = mod.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (language === 'javascript' || language === 'typescript') {
    return [
      `import $X from "${esc}"`,
      `import $X from "${esc}/$REST"`,
      `require("${esc}")`,
      `import("${esc}")`,
    ];
  }
  if (!/^[A-Za-z_][\w./-]*$/.test(mod)) return [];
  if (language === 'python') return [`import ${mod}`, `import ${mod} as $X`, `from ${mod} import $X`];
  if (language === 'go') return [`import "${esc}"`];
  if (language === 'java' || language === 'kotlin' || language === 'csharp') return [`import ${mod}`, `import ${mod}.$X`];
  if (language === 'ruby') return [`require "${esc}"`];
  if (language === 'rust') return [`use ${mod}`, `use ${mod}::$X`];
  if (language === 'php') return [`use ${mod}`, `use ${mod}\\$X`];
  return [];
}

function findingId(rule, path, line) {
  const hex = createHash('sha256').update(`SEMGREP|${rule}|${path}|${line}`).digest('hex').slice(0, 8);
  return `AUD-${hex}`;
}

/** YAML text, or null when the specs name nothing Semgrep can scan. */
export function generateSemgrepYaml(sources) {
  const rows = boundaryRows(sources);
  const languages = languagesFrom(sources.find((s) => s.id === 'tech')?.text);
  if (!rows.length || !languages.length) return null;
  const rules = [];
  let n = 0;
  for (const row of rows) {
    for (const language of languages) {
      const patterns = [...new Set(row.mods.flatMap((mod) => importPatterns(language, mod)))];
      if (!patterns.length) continue;
      n += 1;
      const mods = row.mods.join(', ');
      const remediation = `Keep this dependency behind a port. ${row.paths.join(', ')} must not import ${mods}.`;
      const body = [
        `  - id: harness-arch-${language}-${n}`,
        `    languages: [${language}]`,
        `    severity: ERROR`,
        `    message: ${yamlQuote(`Architecture rule from ${row.source}: ${row.paths.join(', ')} must not import ${mods}.`)}`,
        `    metadata:`,
        `      harness: architecture`,
        `      source: ${yamlQuote(row.source)}`,
        `      remediation: ${yamlQuote(remediation)}`,
        `    paths:`,
        `      include:`,
        ...row.paths.map((p) => `        - ${yamlQuote(p)}`),
        patterns.length === 1
          ? `    pattern: ${yamlQuote(patterns[0])}`
          : `    pattern-either:\n${patterns.map((p) => `      - pattern: ${yamlQuote(p)}`).join('\n')}`,
      ];
      rules.push(body.join('\n'));
    }
  }
  if (!rules.length) return null;
  return `rules:\n${rules.join('\n')}\n`;
}

function selectedConfig(root, sources) {
  for (const src of sources) {
    if (!src?.path) continue;
    const [bound] = readBinding(root, src.path, 'Semgrep rules');
    if (!bound) continue;
    const rel = insideRoot(root, bound);
    if (!rel) return { status: 'unconfigured', source: 'missing', path: bound, message: `Semgrep rules path is outside the repo: ${bound}` };
    if (!existsSync(join(root, rel))) {
      return { status: 'unconfigured', source: 'missing', path: rel, message: `Semgrep rules file not found: ${rel}` };
    }
    return { status: 'ready', source: 'selected', path: rel };
  }
  for (const rel of CONFIG_CANDIDATES) {
    if (existsSync(join(root, rel))) return { status: 'ready', source: 'selected', path: rel };
  }
  return null;
}

/** Select a project config, else generate YAML from the specs. Does not write the repo. */
export function resolveSemgrepConfig(root, sources) {
  const selected = selectedConfig(root, sources);
  if (selected) return selected;
  const rows = boundaryRows(sources);
  const languages = languagesFrom(sources.find((s) => s.id === 'tech')?.text);
  if (rows.length && !languages.length) {
    return {
      status: 'unconfigured',
      source: 'none',
      message: 'A boundary table is filled in, but tech.md does not name a Language Semgrep can scan.',
    };
  }
  const yaml = generateSemgrepYaml(sources);
  if (!yaml) {
    return {
      status: 'unconfigured',
      source: 'none',
      message: 'No .semgrep.yml and no "Paths | Must not import" rows in the architecture specs.',
    };
  }
  return {
    status: 'ready',
    source: 'generated',
    yaml,
    message: 'Generated a temporary Semgrep config from the architecture specs. Nothing was written to the repo.',
  };
}

function severityOf(value) {
  const s = String(value ?? '').toUpperCase();
  if (s === 'ERROR' || s === 'HIGH' || s === 'CRITICAL') return 'fail';
  if (s === 'WARNING' || s === 'MEDIUM' || s === 'WARN') return 'warn';
  return 'advisory';
}

function toRel(root, file) {
  if (typeof file !== 'string' || !file) return null;
  const abs = resolve(root, file);
  const fromRoot = relative(root, abs);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
  return fromRoot.split(sep).join('/');
}

// Semgrep OSS replaces extra.lines with this placeholder when not logged in.
const LINES_PLACEHOLDER = 'requires login';

/** Matched source lines read from the file, for when Semgrep withholds them. */
function sourceLines(root, path, start, end) {
  if (!start) return undefined;
  try {
    const lines = readFileSync(join(root, path), 'utf8').split('\n');
    const text = lines.slice(start - 1, Math.max(start, end || start)).join('\n').trim();
    return text || undefined;
  } catch {
    return undefined; // file gone since the scan: report the finding without code
  }
}

export function findingsFromSemgrep(root, report, limitTo = []) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const findings = [];
  for (const hit of results) {
    const path = toRel(root, hit.path);
    if (!path) continue;
    const line = Number(hit.start?.line) || undefined;
    const extra = hit.extra ?? {};
    const remediation = typeof extra.metadata?.remediation === 'string' ? extra.metadata.remediation : undefined;
    const fix = typeof extra.fix === 'string' && extra.fix ? extra.fix : undefined;
    const reported = typeof extra.lines === 'string' ? extra.lines.trim() : '';
    const code = reported && reported !== LINES_PLACEHOLDER
      ? reported
      : sourceLines(root, path, line, Number(hit.end?.line) || line);
    findings.push({
      id: findingId(hit.check_id ?? 'semgrep', path, line ?? 0),
      check: 'SEMGREP',
      rule: hit.check_id,
      severity: severityOf(extra.severity),
      paths: [path],
      ...(line ? { line } : {}),
      message: extra.message || hit.check_id || 'Semgrep finding',
      ...(code ? { code } : {}),
      ...(fix ? { fix } : {}),
      ...(remediation ? { remediation } : {}),
    });
  }
  if (!limitTo.length) return findings;
  const scopes = limitTo.map((p) => p.replace(/\/$/, ''));
  return findings.filter((f) => scopes.some((scope) => f.paths[0] === scope || f.paths[0].startsWith(`${scope}/`)));
}

function parseReport(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

/**
 * Run Semgrep. `spawn` is injectable in tests.
 * `bin` defaults to `semgrep` on PATH (`HARNESS_SEMGREP` overrides it at the server).
 */
export function runSemgrepScan({ root, sources, paths = [], bin = 'semgrep', spawn = spawnSync } = {}) {
  const config = resolveSemgrepConfig(root, sources);
  if (config.status !== 'ready') {
    return { status: config.status, source: config.source, path: config.path, findings: [], message: config.message };
  }
  let tmpDir = null;
  let configPath = config.path ? join(root, config.path) : null;
  if (config.yaml) {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-semgrep-'));
    configPath = join(tmpDir, '.semgrep.yml');
    writeFileSync(configPath, config.yaml);
  }
  const targets = (paths.length ? paths : ['.']).filter((p) => p === '.' || existsSync(join(root, p)));
  if (!targets.length) {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    return { status: 'pass', source: config.source, path: config.path, yaml: config.yaml, findings: [], message: 'No existing paths to scan.' };
  }
  try {
    const r = spawn(bin, [
      'scan', '--json', '--quiet', '--metrics=off', '--disable-version-check',
      '--config', configPath,
      ...targets,
    ], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (r.error?.code === 'ENOENT') {
      return {
        status: 'unavailable',
        source: config.source,
        path: config.path,
        yaml: config.yaml,
        findings: [],
        message: `semgrep is not installed (looked for ${bin}). This is not a pass.`,
      };
    }
    if (r.error || r.status === null) {
      return {
        status: 'error',
        source: config.source,
        path: config.path,
        yaml: config.yaml,
        findings: [],
        message: r.error?.message ?? 'semgrep timed out',
      };
    }
    const report = parseReport(r.stdout ?? '');
    if (!report) {
      const detail = `${r.stderr ?? ''}`.trim().slice(-500);
      return {
        status: 'error',
        source: config.source,
        path: config.path,
        yaml: config.yaml,
        findings: [],
        message: detail || `semgrep exited ${r.status} without JSON`,
      };
    }
    const findings = findingsFromSemgrep(root, report, paths);
    const scanError = Array.isArray(report.errors) && report.errors.length && !findings.length;
    if (scanError || (r.status !== 0 && r.status !== 1)) {
      return {
        status: 'error',
        source: config.source,
        path: config.path,
        yaml: config.yaml,
        findings,
        message: scanError ? 'semgrep reported errors and no results' : `semgrep exited ${r.status}`,
      };
    }
    return {
      status: findings.some((f) => f.severity === 'fail') ? 'fail' : 'pass',
      source: config.source,
      path: config.path,
      yaml: config.yaml,
      findings,
      message: config.message,
    };
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}
