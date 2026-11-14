import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cyclesOf, cycleViolations, type Edge, layerOf, layerViolations } from './graph.ts';
import {
	buildIndexes,
	extractImports,
	goModuleOf,
	languageOf,
	type ResolveContext,
	resolveImport,
	tsPathsOf,
} from './imports.ts';
import { parseLayers } from './layers.ts';

const BINDING = `# Domain layer

## Dependency layers

| Layer | Paths | May depend on |
|-------|-------|---------------|
| Domain | \`src/domain/**\` | — |
| Application | \`src/application\`, \`src/use-cases/**\` | Domain |
| Adapters | \`src/infra/**\` | Domain, Application, Ports |
| … | \`…\` | … |

**Dependency cycles:** forbid

## Exceptions
`;

test('spec-drift-depth REQ-003: the Dependency layers table becomes layers; placeholders and unknown names are handled', () => {
	const config = parseLayers(BINDING);
	assert.ok(config);
	assert.deepEqual(
		config.layers.map((l) => [l.name, l.paths, l.mayDependOn]),
		[
			['Domain', ['src/domain/**'], []],
			['Application', ['src/application', 'src/use-cases/**'], ['Domain']],
			['Adapters', ['src/infra/**'], ['Domain', 'Application', 'Ports']],
		],
	);
	assert.equal(config.cycles, 'forbid');
	assert.deepEqual(config.unknownLayers, ['Ports']);
	assert.equal(parseLayers(BINDING.replace('forbid', 'allow'))?.cycles, 'allow');
	assert.equal(
		parseLayers('# x\n\n## Semgrep boundaries\n\n| Paths | Must not import |\n|--|--|\n| `a` | `b` |\n'),
		null,
	);
	assert.equal(
		parseLayers('## Dependency layers\n\n| Layer | Paths | May depend on |\n|--|--|--|\n| … | `…` | … |\n'),
		null,
		'the stub table is no config',
	);
});

test('spec-drift-depth REQ-003: imports are extracted with their line in each language', () => {
	assert.deepEqual(
		extractImports(
			'js',
			[
				"import { a } from './a';",
				'import {',
				'  b,',
				"} from '../b.js';",
				"// import { c } from './commented';",
				"export * from './c';",
				"import './side-effect';",
				"const d = require('./d');",
				"const e = await import('./e');",
				"import type { T } from '@app/types';",
			].join('\n'),
		).map((r) => [r.spec, r.line]),
		[
			['./a', 1],
			['../b.js', 2],
			['./c', 6],
			['./side-effect', 7],
			['./d', 8],
			['./e', 9],
			['@app/types', 10],
		],
	);
	assert.deepEqual(
		extractImports(
			'python',
			[
				'import os, app.core',
				'from .models import User as U, Order',
				'from ..infra import (',
				'    db,',
				')',
				'# import x',
			].join('\n'),
		).map((r) => [r.spec, r.line]),
		[
			['os', 1],
			['app.core', 1],
			['.models.User', 2],
			['.models.Order', 2],
			['.models', 2],
			['..infra.db', 3],
			['..infra', 3],
		],
	);
	assert.deepEqual(
		extractImports(
			'go',
			['package x', 'import "fmt"', 'import (', '\t"example.com/m/internal/a"', '\tb "example.com/m/b"', ')'].join(
				'\n',
			),
		).map((r) => [r.spec, r.line]),
		[
			['fmt', 2],
			['example.com/m/internal/a', 4],
			['example.com/m/b', 5],
		],
	);
	assert.deepEqual(
		extractImports(
			'java',
			[
				'package a;',
				'import com.acme.domain.Order;',
				'import static com.acme.util.Math.max;',
				'import com.acme.infra.*;',
			].join('\n'),
		).map((r) => r.spec),
		['com.acme.domain.Order', 'com.acme.util.Math.max', 'com.acme.infra.*'],
	);
	assert.deepEqual(
		extractImports('js', "import type { A } from './a';\nexport type { B } from './b';\nimport { C } from './c';").map(
			(r) => [r.spec, r.typeOnly === true],
		),
		[
			['./a', true],
			['./b', true],
			['./c', false],
		],
		'type-only imports are marked',
	);
	assert.equal(languageOf('a/b.d.ts'), null);
	assert.equal(languageOf('a/b.kt'), 'java');
	assert.equal(languageOf('a/b.md'), null);
});

const ctxOf = (files: string[], extra: Partial<ResolveContext> = {}): ResolveContext => ({
	files: new Set(files),
	tsPaths: [],
	goModule: null,
	...buildIndexes(files),
	...extra,
});

test('spec-drift-depth REQ-003: JS/TS imports resolve to repository files, with extensions, index files and tsconfig paths', () => {
	const ctx = ctxOf(['src/a.ts', 'src/b/index.ts', 'src/c.tsx', 'libs/types/src/index.ts'], {
		tsPaths: tsPathsOf(
			'{\n  // comment\n  "compilerOptions": { "baseUrl": ".", "paths": { "@app/types": ["libs/types/src/index.ts"], "@app/*": ["src/*"], }, },\n}',
		),
	});
	assert.equal(resolveImport('js', 'src/x/y.ts', '../a', ctx), 'src/a.ts');
	assert.equal(resolveImport('js', 'src/x.ts', './a.js', ctx), 'src/a.ts', 'ESM .js specifier of a .ts file');
	assert.equal(resolveImport('js', 'src/x.ts', './b', ctx), 'src/b/index.ts');
	assert.equal(resolveImport('js', 'src/x.ts', './c', ctx), 'src/c.tsx');
	assert.equal(resolveImport('js', 'src/x.ts', '@app/types', ctx), 'libs/types/src/index.ts');
	assert.equal(resolveImport('js', 'src/x.ts', '@app/a', ctx), 'src/a.ts');
	assert.equal(resolveImport('js', 'src/x.ts', 'react', ctx), null, 'packages are not repository files');
	assert.equal(resolveImport('js', 'src/a.ts', './a', ctx), null, 'no self edge');
});

test('spec-drift-depth REQ-003: Python, Go and Java/Kotlin imports resolve to repository files', () => {
	const ctx = ctxOf(
		[
			'app/core.py',
			'app/models/__init__.py',
			'app/models/user.py',
			'src/pkg/mod.py',
			'internal/a/a.go',
			'internal/a/a_test.go',
			'src/main/java/com/acme/domain/Order.java',
			'src/main/kotlin/com/acme/infra/Db.kt',
		],
		{ goModule: goModuleOf('module example.com/m\n\ngo 1.22\n') },
	);
	assert.equal(resolveImport('python', 'app/x.py', 'app.core', ctx), 'app/core.py');
	assert.equal(resolveImport('python', 'app/x.py', '.models.user', ctx), 'app/models/user.py');
	assert.equal(resolveImport('python', 'app/models/user.py', '..core', ctx), 'app/core.py');
	assert.equal(resolveImport('python', 'app/x.py', '.models', ctx), 'app/models/__init__.py');
	assert.equal(resolveImport('python', 'tests/t.py', 'pkg.mod', ctx), 'src/pkg/mod.py', 'src layout');
	assert.equal(resolveImport('python', 'app/x.py', 'os', ctx), null);
	assert.equal(resolveImport('go', 'cmd/main.go', 'example.com/m/internal/a', ctx), 'internal/a/a.go');
	assert.equal(resolveImport('go', 'cmd/main.go', 'fmt', ctx), null);
	assert.equal(
		resolveImport('java', 'src/main/java/com/acme/app/X.java', 'com.acme.domain.Order', ctx),
		'src/main/java/com/acme/domain/Order.java',
	);
	assert.equal(
		resolveImport('java', 'src/main/java/com/acme/app/X.java', 'com.acme.domain.Order.Status', ctx),
		'src/main/java/com/acme/domain/Order.java',
		'nested class or static member',
	);
	assert.equal(
		resolveImport('java', 'src/main/java/com/acme/app/X.java', 'com.acme.infra.*', ctx),
		'src/main/kotlin/com/acme/infra/Db.kt',
	);
	assert.equal(resolveImport('java', 'X.java', 'java.util.List', ctx), null);
});

const graphOf = (edges: Record<string, [string, number][]>): Map<string, Edge[]> =>
	new Map(Object.entries(edges).map(([from, list]) => [from, list.map(([to, line]) => ({ to, line }))]));

test('spec-drift-depth REQ-003: a layer may import itself and the layers it lists, nothing else', () => {
	const config = parseLayers(BINDING);
	assert.ok(config);
	assert.equal(layerOf(config.layers, 'src/application/x.ts')?.name, 'Application');
	assert.equal(layerOf(config.layers, 'src/other.ts'), null);
	const graph = graphOf({
		'src/domain/order.ts': [
			['src/domain/money.ts', 1],
			['src/infra/db.ts', 3],
		],
		'src/application/place.ts': [
			['src/domain/order.ts', 1],
			['src/infra/db.ts', 2],
		],
		'src/infra/db.ts': [['src/application/place.ts', 4]],
		'src/other.ts': [['src/infra/db.ts', 1]],
	});
	const v = layerViolations(config, graph);
	assert.deepEqual(
		v.map((x) => [x.path, x.line]),
		[
			['src/application/place.ts', 2],
			['src/domain/order.ts', 3],
		],
	);
	assert.equal(
		v[1]?.message,
		'Domain must not depend on Adapters: imports src/infra/db.ts (Domain may depend on no other layer).',
	);
	assert.deepEqual(
		layerViolations(config, graph, new Set(['src/domain/order.ts'])).map((x) => x.path),
		['src/domain/order.ts'],
		'limited to the given files',
	);
});

test('spec-drift-depth REQ-003: cycles are found and reported once, at the first file', () => {
	const graph = graphOf({
		'a.ts': [['b.ts', 2]],
		'b.ts': [['c.ts', 5]],
		'c.ts': [
			['a.ts', 7],
			['d.ts', 8],
		],
		'd.ts': [],
		'e.ts': [['e.ts', 1]],
		'x.ts': [['y.ts', 1]],
		'y.ts': [['x.ts', 3]],
	});
	assert.deepEqual(cyclesOf(graph), [
		['a.ts', 'b.ts', 'c.ts'],
		['x.ts', 'y.ts'],
	]);
	const v = cycleViolations(graph);
	assert.deepEqual(
		v.map((x) => [x.rule, x.path, x.line, x.message]),
		[
			['dep-cycle', 'a.ts', 2, 'Import cycle: a.ts → b.ts → c.ts → a.ts.'],
			['dep-cycle', 'x.ts', 1, 'Import cycle: x.ts → y.ts → x.ts.'],
		],
	);
	const typeOnly = new Map([
		['p.ts', [{ to: 'q.ts', line: 1, typeOnly: true }]],
		['q.ts', [{ to: 'p.ts', line: 1 }]],
	]);
	assert.deepEqual(cycleViolations(typeOnly), [], 'a cycle through a type-only import is no runtime cycle');
	assert.deepEqual(
		cycleViolations(graph, new Set(['y.ts'])).map((x) => x.path),
		['x.ts'],
		'a cycle touching a given file',
	);
});
