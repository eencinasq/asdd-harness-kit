import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function validate(ctx) {
  const { root, fail } = ctx;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const script of ['check-skills-index.mjs', 'check-skill-profile.mjs', 'check-skill-fleet.mjs']) {
    const res = spawnSync(process.execPath, [join(here, '..', script)], {
      cwd: root,
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      const text = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      const failures = lines.filter((line) => line.startsWith('FAIL'));
      if (failures.length === 0) fail(`${script} failed`);
      for (const line of failures) {
        fail(line.replace(/^FAIL\s+/, ''));
      }
    }
  }
}
