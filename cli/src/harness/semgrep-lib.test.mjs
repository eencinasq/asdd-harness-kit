import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findingsFromSemgrep, generateSemgrepYaml, resolveSemgrepConfig, runSemgrepScan } from './semgrep-lib.mjs';

const sources = [
  { id: 'domain-layer', path: '.harness/steering/domain-layer.md', filled: true, text: '# Domain\n\nBusiness rules stay in the domain.\n' },
  {
    id: 'domain-layer.project',
    path: '.harness/steering/domain-layer.project.md',
    filled: true,
    text: '# Layers\n\n| Paths | Must not import |\n|-------|-----------------|\n| `src/domain/**` | `pg`, `@nestjs/common` |\n| `…` | `…` |\n',
  },
  { id: 'product', path: '.harness/steering/product.md', filled: true, text: '# Product\n\nActors settle chips.\n' },
  { id: 'structure', path: '.harness/steering/structure.md', filled: false },
  {
    id: 'tech',
    path: '.harness/steering/tech.md',
    filled: true,
    text: '# Stack\n\n| Layer | Technology |\n|-------|------------|\n| Language | TypeScript |\n| Runtime | Node 22 |\n',
  },
];

test('generateSemgrepYaml builds import bans from the boundary table and the Language row', () => {
  const yaml = generateSemgrepYaml(sources);
  assert.match(yaml, /languages: \[typescript\]/);
  assert.match(yaml, /import \$X from \\"pg\\"/);
  assert.match(yaml, /@nestjs\/common/);
  assert.match(yaml, /src\/domain\/\*\*/);
  assert.match(yaml, /remediation:/);
  assert.doesNotMatch(yaml, /nodejs/);
});

test('generateSemgrepYaml derives adapter bans from the layer table and the package scope', () => {
  const derived = sources.map((s) => {
    if (s.id === 'domain-layer.project') {
      return {
        ...s,
        text: `# Layers

\`libs/entities\` and \`libs/domain\` must not import vendor SDKs or adapter libs.

| Tag | Projects | May depend on | Vendor imports |
|-----|----------|---------------|----------------|
| \`layer:entities\` | \`entities\` | entities, infra | banned |
| \`layer:domain\` | \`domain\` | domain, entities, port, infra | banned |
| \`layer:adapter\` | \`stripe\`, \`orm.typeorm.mongo\` | domain, entities, port, infra (**not** other adapters) | — |
`,
      };
    }
    if (s.id === 'tech') {
      return { ...s, text: `${s.text}\nPackages under \`@acme/*\`.\n` };
    }
    return s;
  });
  const yaml = generateSemgrepYaml(derived);
  assert.match(yaml, /libs\/entities\/\*\*/);
  assert.match(yaml, /libs\/domain\/\*\*/);
  assert.match(yaml, /@acme\/stripe/);
  assert.match(yaml, /import \$X from \\"stripe\\"/);
  assert.match(yaml, /@acme\/orm\.typeorm\.mongo/);
  assert.match(yaml, /libs\/stripe\/\*\*/);
  assert.match(yaml, /libs\/orm\.typeorm\.mongo\/\*\*/);
});

test('generateSemgrepYaml is null for kit stubs', () => {
  const stubs = sources.map((s) => ({ ...s, filled: false, text: '# Technology stack (stub)\n\n| Language | … |\n' }));
  assert.equal(generateSemgrepYaml(stubs), null);
});

test('resolveSemgrepConfig selects .semgrep.yml and does not generate', () => {
  const root = mkdtempSync(join(tmpdir(), 'semgrep-select-'));
  writeFileSync(join(root, '.semgrep.yml'), 'rules: []\n');
  const config = resolveSemgrepConfig(root, sources);
  assert.equal(config.source, 'selected');
  assert.equal(config.path, '.semgrep.yml');
  assert.equal(config.yaml, undefined);
});

test('resolveSemgrepConfig honors the Semgrep rules binding', () => {
  const root = mkdtempSync(join(tmpdir(), 'semgrep-bound-'));
  mkdirSync(join(root, 'rules'), { recursive: true });
  mkdirSync(join(root, '.harness/steering'), { recursive: true });
  writeFileSync(join(root, 'rules/arch.yml'), 'rules: []\n');
  writeFileSync(join(root, '.semgrep.yml'), 'rules: []\n');
  const text = `${sources.find((s) => s.id === 'domain-layer.project').text}\n**Semgrep rules:** \`rules/arch.yml\`\n`;
  writeFileSync(join(root, '.harness/steering/domain-layer.project.md'), text);
  const bound = sources.map((s) => (s.id === 'domain-layer.project' ? { ...s, text } : s));
  const config = resolveSemgrepConfig(root, bound);
  assert.equal(config.path, 'rules/arch.yml');
});

test('runSemgrepScan parses JSON findings and fixes, and deletes the temp config', () => {
  const root = mkdtempSync(join(tmpdir(), 'semgrep-run-'));
  writeFileSync(join(root, 'src-a.js'), 'x\n');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.js'), 'import pg from "pg";\n');
  let configSeen = '';
  const result = runSemgrepScan({
    root,
    sources,
    paths: ['src/a.js'],
    bin: 'semgrep',
    spawn: (_bin, args) => {
      const i = args.indexOf('--config');
      configSeen = args[i + 1];
      assert.equal(args[0], 'scan');
      assert.ok(args.includes('--json'));
      assert.ok(args.includes('src/a.js'));
      return {
        status: 1,
        stdout: JSON.stringify({
          results: [{
            check_id: 'harness-arch-typescript-1',
            path: join(root, 'src/a.js'),
            start: { line: 1 },
            extra: {
              message: 'domain imports pg',
              severity: 'ERROR',
              fix: 'import { Db } from "./port.js";',
              metadata: { remediation: 'use a port' },
            },
          }],
        }),
        stderr: '',
      };
    },
  });
  assert.equal(result.status, 'fail');
  assert.equal(result.source, 'generated');
  assert.match(result.yaml, /import \$X from \\"pg\\"/);
  assert.equal(result.findings[0].check, 'SEMGREP');
  assert.equal(result.findings[0].paths[0], 'src/a.js');
  assert.equal(result.findings[0].line, 1);
  assert.equal(result.findings[0].fix, 'import { Db } from "./port.js";');
  assert.equal(result.findings[0].remediation, 'use a port');
  assert.equal(result.findings[0].severity, 'fail');
  assert.match(configSeen, /harness-semgrep-/);
  assert.equal(existsSync(configSeen), false);
});

test('runSemgrepScan is unavailable (not a pass) when the binary is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'semgrep-miss-'));
  writeFileSync(join(root, '.semgrep.yml'), 'rules: []\n');
  const result = runSemgrepScan({
    root,
    sources,
    spawn: () => ({ error: Object.assign(new Error('spawn semgrep ENOENT'), { code: 'ENOENT' }), status: null, stdout: '', stderr: '' }),
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.message, /not a pass/);
});

test('REQ-002 (drift-consistency): the "requires login" placeholder is replaced by the matched source lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'semgrep-lines-'));
  mkdirSync(join(root, 'src/domain'), { recursive: true });
  writeFileSync(join(root, 'src/domain/order.js'), 'import axios from "axios";\nexport const f = () => axios;\n');
  const hit = (lines, start = 1, end = 1) => ({
    check_id: 'domain-no-axios',
    path: join(root, 'src/domain/order.js'),
    start: { line: start },
    end: { line: end },
    extra: { message: 'domain must not import axios', severity: 'ERROR', lines },
  });
  const [placeholder, multi, real, missing] = findingsFromSemgrep(root, {
    results: [hit('requires login'), hit('requires login', 1, 2), hit('import axios from "axios";'), { ...hit('requires login'), path: join(root, 'src/gone.js') }],
  });
  assert.equal(placeholder.code, 'import axios from "axios";');
  assert.equal(multi.code, 'import axios from "axios";\nexport const f = () => axios;');
  assert.equal(real.code, 'import axios from "axios";');
  assert.equal(missing.code, undefined);
});
