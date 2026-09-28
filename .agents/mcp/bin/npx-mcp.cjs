#!/usr/bin/env node
/**
 * Cross-platform MCP launcher: run `npx` with a real Node (not Cursor's helper).
 * macOS / Linux / Windows.
 */
const { spawn } = require('node:child_process');
const {
  isWin,
  pathWithBinFirst,
  resolveNodeToolchain,
} = require('./resolve-node.cjs');

const tool = resolveNodeToolchain();
if (!tool) {
  console.error(
    'npx-mcp: no Node ^20.19 / ^22.12 / >=23 with npx found.',
  );
  console.error(
    'Install Node (nvm, nvm-windows, fnm, volta, or nodejs.org), or set NPX_MCP_NODE_BIN to that version\'s bin dir.',
  );
  process.exit(127);
}

const args = process.argv.slice(2);
const env = {
  ...process.env,
  PATH: pathWithBinFirst(tool.binDir),
};
delete env.npm_config_prefix;
delete env.PREFIX;

const child = spawn(tool.npx, args, {
  stdio: 'inherit',
  env,
  shell: isWin,
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error(`npx-mcp: failed to spawn ${tool.npx}:`, err.message);
  process.exit(127);
});
