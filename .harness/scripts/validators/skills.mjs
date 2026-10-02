import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export default function validate(ctx) {
  const { root, fail } = ctx;
  const skillsIndex = spawnSync(process.execPath, [join(root, '.harness/scripts/check-skills-index.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (skillsIndex.status !== 0) {
    const text = `${skillsIndex.stdout || ''}\n${skillsIndex.stderr || ''}`.trim();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) fail('skills index check failed');
    for (const line of lines) {
      fail(line.replace(/^FAIL\s+/, ''));
    }
  }
}
