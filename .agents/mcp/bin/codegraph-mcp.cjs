#!/usr/bin/env node
/**
 * Cross-platform Codegraph MCP launcher (macOS / Linux / Windows).
 * Resolves `codegraph` + Node when the GUI PATH omits version managers.
 */
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { homedir } = require('node:os');
const { dirname, join } = require('node:path');
const {
  isWin,
  pathWithBinFirst,
  resolveNodeToolchain,
} = require('./resolve-node.cjs');

function which(cmd) {
  const finder = isWin ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], {
    encoding: 'utf8',
    shell: isWin,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  return (
    String(r.stdout)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) || null
  );
}

function resolveCodegraph(binDirHint) {
  if (process.env.CODEGRAPH_BIN && existsSync(process.env.CODEGRAPH_BIN)) {
    return process.env.CODEGRAPH_BIN;
  }

  const names = isWin
    ? ['codegraph.cmd', 'codegraph.exe', 'codegraph']
    : ['codegraph'];

  if (binDirHint) {
    for (const n of names) {
      const p = join(binDirHint, n);
      if (existsSync(p)) return p;
    }
  }

  for (const n of names) {
    const w = which(n);
    if (w) return w;
  }

  // nvm / nvm-windows globals next to node
  const searchRoots = [];
  const nvmUnix = join(homedir(), '.nvm', 'versions', 'node');
  if (existsSync(nvmUnix)) {
    try {
      for (const name of readdirSync(nvmUnix)) {
        searchRoots.push(join(nvmUnix, name, 'bin'));
      }
    } catch {
      /* ignore */
    }
  }
  const nvmWin = process.env.NVM_HOME || join(homedir(), 'AppData', 'Roaming', 'nvm');
  if (existsSync(nvmWin)) {
    try {
      for (const name of readdirSync(nvmWin)) {
        if (!/^v?\d/.test(name)) continue;
        searchRoots.push(join(nvmWin, name));
      }
    } catch {
      /* ignore */
    }
  }

  let best = null;
  for (const root of searchRoots.sort()) {
    for (const n of names) {
      const p = join(root, n);
      if (existsSync(p)) best = p;
    }
  }
  return best;
}

const tool = resolveNodeToolchain();
const cg = resolveCodegraph(tool?.binDir);
if (!cg) {
  console.error(
    'codegraph CLI not found. Install: npm install -g codegraph',
  );
  console.error(
    'Or set CODEGRAPH_BIN to the codegraph executable path.',
  );
  process.exit(127);
}

const here = __dirname;
// .agents/mcp/bin → repo root (three levels up)
const defaultRoot = join(here, '..', '..', '..');
const root = process.env.CODEGRAPH_PROJECT_PATH || defaultRoot;

const binDir = tool?.binDir || dirname(cg);
const env = {
  ...process.env,
  PATH: pathWithBinFirst(binDir),
};

const extra = process.argv.slice(2);
const child = spawn(cg, ['serve', '--mcp', '--path', root, ...extra], {
  stdio: 'inherit',
  env,
  shell: isWin && /\.cmd$/i.test(cg),
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error(`codegraph-mcp: failed to spawn ${cg}:`, err.message);
  process.exit(127);
});
