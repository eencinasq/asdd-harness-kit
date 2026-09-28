/**
 * Shared Node resolution for MCP launchers (macOS / Linux / Windows).
 * Avoids Cursor's bundled Node (broken npm prefix) and finds a real engine.
 */
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { homedir, platform } = require('node:os');
const { dirname, join } = require('node:path');

const isWin = platform() === 'win32';

function isCursorNode(p) {
  if (!p) return false;
  const s = p.replace(/\\/g, '/').toLowerCase();
  return (
    s.includes('/cursor.app/') ||
    s.includes('/cursor/resources/') ||
    s.includes('/programs/cursor/') ||
    s.includes('/cursor.exe') ||
    /\/cursor\/[^/]*\/resources\//.test(s)
  );
}

/** chrome-devtools-mcp / modern MCP packages: ^20.19 || ^22.12 || >=23 */
function nodeVersionOk(nodeBin) {
  try {
    const r = spawnSync(nodeBin, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout) return false;
    const ver = String(r.stdout).trim();
    const [majS, minS] = ver.split('.');
    const major = Number(majS);
    const minor = Number(minS);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
    if (major >= 23) return true;
    if (major === 22 && minor >= 12) return true;
    if (major === 20 && minor >= 19) return true;
    return false;
  } catch {
    return false;
  }
}

function nodeName() {
  return isWin ? 'node.exe' : 'node';
}

function npxName() {
  return isWin ? 'npx.cmd' : 'npx';
}

function binHasNodeAndNpx(binDir) {
  if (!binDir) return false;
  const node = join(binDir, nodeName());
  const npx = join(binDir, npxName());
  // Unix npx is often a shim without .cmd; also accept plain `npx`
  const npxOk =
    existsSync(npx) || (!isWin && existsSync(join(binDir, 'npx')));
  return existsSync(node) && npxOk && nodeVersionOk(node);
}

function which(cmd) {
  const finder = isWin ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], {
    encoding: 'utf8',
    shell: isWin,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  const line = String(r.stdout)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  return line || null;
}

function collectNvmUnixBins() {
  const out = [];
  const base = join(homedir(), '.nvm', 'versions', 'node');
  if (!existsSync(base)) return out;
  try {
    for (const name of readdirSync(base)) {
      out.push(join(base, name, 'bin'));
    }
  } catch {
    /* ignore */
  }
  return out;
}

function collectNvmWindowsBins() {
  const out = [];
  const nvmHome = process.env.NVM_HOME || process.env.NVM_DIR;
  if (nvmHome && existsSync(nvmHome)) {
    try {
      for (const name of readdirSync(nvmHome)) {
        if (!/^v?\d/.test(name)) continue;
        out.push(join(nvmHome, name));
      }
    } catch {
      /* ignore */
    }
  }
  // nvm-windows default
  const def = join(homedir(), 'AppData', 'Roaming', 'nvm');
  if (existsSync(def) && def !== nvmHome) {
    try {
      for (const name of readdirSync(def)) {
        if (!/^v?\d/.test(name)) continue;
        out.push(join(def, name));
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function collectFnVoltaAsdf() {
  const out = [];
  const home = homedir();
  const candidates = [
    join(home, '.fnm', 'node-versions'),
    join(home, '.local', 'share', 'fnm', 'node-versions'),
    join(home, '.volta', 'tools', 'image', 'node'),
    join(home, '.asdf', 'installs', 'node'),
  ];
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    try {
      for (const name of readdirSync(base)) {
        const bin = join(base, name, 'bin');
        const winRoot = join(base, name);
        if (existsSync(bin)) out.push(bin);
        else if (isWin && existsSync(join(winRoot, 'node.exe'))) out.push(winRoot);
      }
    } catch {
      /* ignore */
    }
  }
  // Volta shims dir
  const voltaBin = join(home, '.volta', 'bin');
  if (existsSync(voltaBin)) out.push(voltaBin);
  return out;
}

function collectProgramFilesNode() {
  if (!isWin) return [];
  const out = [];
  for (const key of ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']) {
    const root = process.env[key];
    if (!root) continue;
    const dirs = [
      join(root, 'nodejs'),
      join(root, 'Programs', 'nodejs'),
    ];
    for (const d of dirs) {
      if (existsSync(join(d, 'node.exe'))) out.push(d);
    }
  }
  return out;
}

/**
 * @returns {{ binDir: string, node: string, npx: string }}
 */
function resolveNodeToolchain() {
  const override = process.env.NPX_MCP_NODE_BIN;
  if (override && binHasNodeAndNpx(override)) {
    return {
      binDir: override,
      node: join(override, nodeName()),
      npx: join(override, existsSync(join(override, npxName())) ? npxName() : 'npx'),
    };
  }

  // Prefer PATH node when it is not Cursor's helper.
  const pathNode = which(isWin ? 'node.exe' : 'node') || which('node');
  if (pathNode && !isCursorNode(pathNode)) {
    const binDir = dirname(pathNode);
    if (binHasNodeAndNpx(binDir)) {
      return {
        binDir,
        node: join(binDir, nodeName()),
        npx: join(binDir, existsSync(join(binDir, npxName())) ? npxName() : 'npx'),
      };
    }
  }

  // Current process (only if not Cursor and engines OK).
  if (!isCursorNode(process.execPath) && nodeVersionOk(process.execPath)) {
    const binDir = dirname(process.execPath);
    if (binHasNodeAndNpx(binDir)) {
      return {
        binDir,
        node: process.execPath,
        npx: join(binDir, existsSync(join(binDir, npxName())) ? npxName() : 'npx'),
      };
    }
  }

  const search = [
    ...collectNvmUnixBins(),
    ...collectNvmWindowsBins(),
    ...collectFnVoltaAsdf(),
    ...collectProgramFilesNode(),
  ];

  // Prefer highest semver-ish directory name last (lexical sort).
  search.sort();
  let best = null;
  for (const binDir of search) {
    if (binHasNodeAndNpx(binDir)) best = binDir;
  }
  if (best) {
    return {
      binDir: best,
      node: join(best, nodeName()),
      npx: join(best, existsSync(join(best, npxName())) ? npxName() : 'npx'),
    };
  }

  return null;
}

function pathWithBinFirst(binDir) {
  const sep = isWin ? ';' : ':';
  const prev = process.env.PATH || process.env.Path || '';
  return `${binDir}${sep}${prev}`;
}

module.exports = {
  isWin,
  isCursorNode,
  nodeVersionOk,
  binHasNodeAndNpx,
  resolveNodeToolchain,
  pathWithBinFirst,
};
