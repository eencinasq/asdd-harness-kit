import { readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');
// ruleid: arch.hook-input-to-shell
execSync(command);
// ruleid: arch.hook-input-to-shell
spawnSync(`echo ${process.env.HARNESS_PR_BRANCH}`, { shell: true });
// ok: arch.hook-input-to-shell
spawnSync('git', ['log', process.env.HARNESS_PR_BRANCH]);
// ok: arch.hook-input-to-shell
execSync('git rev-parse HEAD');

async function observe() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  // ruleid: arch.hook-input-to-shell
  execSync(`cat ${payload.tool_input.file_path}`);
}
