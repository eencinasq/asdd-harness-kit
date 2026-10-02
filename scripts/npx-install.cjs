#!/usr/bin/env node
/**
 * npx entry point for asdd-harness-kit.
 *
 * Usage:
 *   npx asdd-harness-kit /path/to/repo --runtime=cursor --modules=http-api
 *   npx asdd-harness-kit --interactive
 *
 * This wrapper locates the kit's install-into.sh and spawns it with
 * all arguments forwarded. Stdin/stdout/stderr are preserved so the
 * interactive wizard works through npx.
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');

const scriptDir = __dirname;
const installSh = join(scriptDir, 'install-into.sh');

if (!existsSync(installSh)) {
  console.error('ERROR: install-into.sh not found at', installSh);
  process.exit(1);
}

function hasBash() {
  const r = spawnSync(
    process.platform === 'win32' ? 'where' : 'which',
    ['bash'],
    { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true }
  );
  return r.status === 0 && r.stdout && r.stdout.trim().length > 0;
}

if (!hasBash()) {
  console.error(`
ERROR: bash is required to run the asdd-harness-kit installer.

Options:
  1. Install Git for Windows (includes Git Bash)
  2. Use WSL (Windows Subsystem for Linux)
  3. Use the curl pipe method on a Unix-like shell:

     curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
       | bash -s -- /path/to/repo --from-git --runtime=cursor
`);
  process.exit(1);
}

const result = spawnSync('bash', [installSh, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  windowsHide: true,
});

process.exit(result.status ?? (result.error ? 1 : 0));
