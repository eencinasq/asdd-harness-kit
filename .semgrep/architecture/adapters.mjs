import fs, { readFileSync, writeFileSync } from 'node:fs';

export default {
  id: 'example',
  description: 'test adapter',
  run(root) {
    // ok: arch.adapter-read-only
    const spec = readFileSync(`${root}/openapi.json`, 'utf8');
    // ruleid: arch.adapter-read-only
    writeFileSync(`${root}/out.json`, spec);
    // ruleid: arch.adapter-read-only
    fs.rmSync(`${root}/tmp`, { recursive: true });
    // ok: arch.adapter-read-only
    return fs.existsSync(`${root}/openapi.json`) ? [] : [{ id: 'missing' }];
  },
};
