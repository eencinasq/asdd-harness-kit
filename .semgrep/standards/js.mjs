// ruleid: std.node-protocol-imports
import fs from 'fs';
// ok: std.node-protocol-imports
import { join } from 'node:path';
// ok: std.node-protocol-imports
import { runDrift } from './drift-lib.mjs';
import { spawnSync } from 'node:child_process';

export function validate(ctx) {
  // ruleid: std.validator-read-only
  fs.writeFileSync(join(ctx.root, 'x.json'), '{}');
  // ok: std.validator-read-only
  const data = fs.readFileSync(join(ctx.root, 'x.json'), 'utf8');
  if (!data) {
    // ruleid: std.lib-no-process-exit
    process.exit(1);
  }
  // ok: std.lib-no-process-exit
  ctx.fail('missing data');
  // ruleid: std.no-shell-true
  spawnSync('git status', { shell: true });
  // ok: std.no-shell-true
  spawnSync('git', ['status'], { encoding: 'utf8' });
  // ruleid: std.no-eval
  eval(data);
  // ruleid: std.no-eval
  const f = new Function('return 1');
  // ok: std.no-eval
  return runDrift({ root: ctx.root, f });
}

async function main() {
  // ok: std.lib-no-process-exit
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // ok: std.lib-no-process-exit
  main().catch(() => process.exit(1));
}
