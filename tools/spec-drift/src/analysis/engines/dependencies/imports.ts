import path from 'node:path';

/**
 * Import extraction and resolution by language (spec-drift-depth REQ-003, ADR-006): line-based regexes, resolved against
 * the repository's file set. Imports that resolve to no repository file (packages, the standard library) are dropped.
 * Pure.
 */

export type ImportRef = {
	readonly spec: string;
	readonly line: number;
	/** `import type` / `export type` (TypeScript): erased at runtime. */
	readonly typeOnly?: boolean;
};

export type Language = 'js' | 'python' | 'go' | 'java';

const JS_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export const languageOf = (file: string): Language | null => {
	const ext = path.posix.extname(file).toLowerCase();
	if (JS_EXT.includes(ext)) return file.endsWith('.d.ts') ? null : 'js';
	if (ext === '.py') return 'python';
	if (ext === '.go') return 'go';
	if (ext === '.java' || ext === '.kt' || ext === '.kts') return 'java';
	return null;
};

const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

const allMatches = (text: string, re: RegExp, group = 1): ImportRef[] =>
	[...text.matchAll(re)].map((m) => ({ spec: m[group] ?? '', line: lineAt(text, m.index ?? 0) })).filter((r) => r.spec);

/** Block and line comments blanked out, keeping line numbers and string contents. */
const stripComments = (text: string, hash = false): string =>
	text.replace(hash ? /#[^\n]*/g : /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

export const extractImports = (language: Language, source: string): ImportRef[] => {
	if (language === 'js') {
		const text = stripComments(source);
		return [
			// import x from 'm'; import { a,\n b } from 'm'; export * from 'm'
			...[...text.matchAll(/\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"\n]+)['"]/g)].map((m) => ({
				spec: m[1] ?? '',
				line: lineAt(text, m.index ?? 0),
				...(/^(?:import|export)\s+type\s/.test(m[0]) ? { typeOnly: true } : {}),
			})),
			// import 'm'
			...allMatches(text, /\bimport\s*['"]([^'"\n]+)['"]/g),
			// require('m'), import('m')
			...allMatches(text, /\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g),
		].sort((a, b) => a.line - b.line);
	}
	if (language === 'python') {
		const text = stripComments(source, true);
		const refs: ImportRef[] = [];
		for (const m of text.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm)) {
			const base = m[1] ?? '';
			const line = lineAt(text, m.index ?? 0);
			const names = (m[2] ?? '')
				.replace(/[()]/g, '')
				.split(',')
				.map(
					(n) =>
						n
							.trim()
							.split(/\s+as\s+/)[0]
							?.trim() ?? '',
				)
				.filter((n) => n && n !== '*');
			// `from pkg import mod` may name a submodule: try it first, then the package itself.
			for (const n of names) refs.push({ spec: `${base}${base.endsWith('.') ? '' : '.'}${n}`, line });
			if (base.replace(/\./g, '')) refs.push({ spec: base, line });
		}
		for (const m of text.matchAll(/^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm)) {
			const line = lineAt(text, m.index ?? 0);
			for (const spec of (m[1] ?? '').split(',')) refs.push({ spec: spec.trim(), line });
		}
		return refs.sort((a, b) => a.line - b.line);
	}
	if (language === 'go') {
		const text = stripComments(source);
		const refs = allMatches(text, /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm);
		for (const block of text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
			const offset = (block.index ?? 0) + block[0].indexOf('(');
			for (const m of (block[1] ?? '').matchAll(/(?:[\w.]+\s+)?"([^"]+)"/g)) {
				refs.push({ spec: m[1] ?? '', line: lineAt(text, offset + 1 + (m.index ?? 0)) });
			}
		}
		return refs.sort((a, b) => a.line - b.line);
	}
	const text = stripComments(source);
	return allMatches(text, /^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;?\s*$/gm);
};

export type ResolveContext = {
	readonly files: ReadonlySet<string>;
	/** tsconfig `paths`, already joined with `baseUrl`: `@app/*` → [`src/app/*`]. */
	readonly tsPaths: readonly { readonly pattern: string; readonly targets: readonly string[] }[];
	/** `module` of `go.mod`. */
	readonly goModule: string | null;
	/** Files by their path suffix for Java/Kotlin (`com/acme/Foo.java`), built once. */
	readonly bySuffix?: ReadonlyMap<string, string>;
	/** Folders → their first source file, built once. */
	readonly firstInDir?: ReadonlyMap<string, string>;
};

const JS_CANDIDATES = (base: string): string[] => {
	const noJs = base.replace(/\.(m|c)?js$/, '');
	return [
		base,
		...JS_EXT.map((e) => `${base}${e}`),
		...(noJs !== base ? JS_EXT.map((e) => `${noJs}${e}`) : []),
		...JS_EXT.map((e) => `${base}/index${e}`),
	];
};

const firstExisting = (files: ReadonlySet<string>, candidates: readonly string[]): string | null =>
	candidates.find((c) => files.has(c)) ?? null;

const resolveJs = (from: string, spec: string, ctx: ResolveContext): string | null => {
	if (spec.startsWith('.')) {
		return firstExisting(
			ctx.files,
			JS_CANDIDATES(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))),
		);
	}
	for (const { pattern, targets } of ctx.tsPaths) {
		const star = pattern.indexOf('*');
		const match =
			star < 0
				? spec === pattern
					? ''
					: null
				: spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
					? spec.slice(star, spec.length - (pattern.length - star - 1))
					: null;
		if (match === null) continue;
		for (const target of targets) {
			const hit = firstExisting(ctx.files, JS_CANDIDATES(path.posix.normalize(target.replace('*', match))));
			if (hit) return hit;
		}
	}
	return null;
};

const resolvePython = (from: string, spec: string, ctx: ResolveContext): string | null => {
	const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
	const rest = spec.slice(dots).split('.').filter(Boolean).join('/');
	const bases: string[] = [];
	if (dots > 0) {
		let dir = path.posix.dirname(from);
		for (let i = 1; i < dots; i += 1) dir = path.posix.dirname(dir);
		bases.push(dir === '.' ? '' : dir);
	} else {
		bases.push('', 'src');
	}
	for (const base of bases) {
		const stem = [base, rest].filter(Boolean).join('/');
		if (!stem) continue;
		const hit = firstExisting(ctx.files, [`${stem}.py`, `${stem}/__init__.py`]);
		if (hit) return hit;
	}
	return null;
};

const resolveGo = (spec: string, ctx: ResolveContext): string | null => {
	if (!ctx.goModule || !(spec === ctx.goModule || spec.startsWith(`${ctx.goModule}/`))) return null;
	const dir = spec.slice(ctx.goModule.length).replace(/^\//, '');
	return ctx.firstInDir?.get(dir) ?? null;
};

const resolveJava = (spec: string, ctx: ResolveContext): string | null => {
	const parts = spec.replace(/\.\*$/, '').split('.');
	if (spec.endsWith('.*')) return ctx.firstInDir?.get(`*/${parts.join('/')}`) ?? null;
	// com.acme.Foo, or a static import com.acme.Foo.bar / a nested class com.acme.Foo.Inner
	for (let n = parts.length; n >= 2; n -= 1) {
		const stem = parts.slice(0, n).join('/');
		const hit = ctx.bySuffix?.get(`${stem}.java`) ?? ctx.bySuffix?.get(`${stem}.kt`);
		if (hit) return hit;
	}
	return null;
};

export const resolveImport = (language: Language, from: string, spec: string, ctx: ResolveContext): string | null => {
	const hit =
		language === 'js'
			? resolveJs(from, spec, ctx)
			: language === 'python'
				? resolvePython(from, spec, ctx)
				: language === 'go'
					? resolveGo(spec, ctx)
					: resolveJava(spec, ctx);
	return hit && hit !== from ? hit : null;
};

/** Suffix and folder indexes for Java/Kotlin and Go, built once per scan. */
export const buildIndexes = (files: readonly string[]): Pick<ResolveContext, 'bySuffix' | 'firstInDir'> => {
	const bySuffix = new Map<string, string>();
	const firstInDir = new Map<string, string>();
	for (const file of [...files].sort()) {
		const lang = languageOf(file);
		if (lang !== 'java' && lang !== 'go') continue;
		const dir = path.posix.dirname(file);
		if (lang === 'go') {
			if (!file.endsWith('_test.go') && !firstInDir.has(dir)) firstInDir.set(dir === '.' ? '' : dir, file);
			continue;
		}
		const segments = file.split('/');
		for (let i = 0; i < segments.length; i += 1) {
			const suffix = segments.slice(i).join('/');
			if (!bySuffix.has(suffix)) bySuffix.set(suffix, file);
			const dirSuffix = segments.slice(i, -1).join('/');
			if (dirSuffix && !firstInDir.has(`*/${dirSuffix}`)) firstInDir.set(`*/${dirSuffix}`, file);
		}
	}
	return { bySuffix, firstInDir };
};

/** `compilerOptions.paths` of a tsconfig (JSON with comments), joined with `baseUrl`. */
export const tsPathsOf = (tsconfigText: string | null): ResolveContext['tsPaths'] => {
	if (!tsconfigText) return [];
	try {
		const json = JSON.parse(
			tsconfigText
				// Comments out, strings kept (a `"src/*"` value contains `/*`).
				.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (_m, str: string | undefined) => str ?? '')
				.replace(/,(\s*[}\]])/g, '$1'),
		) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
		const baseUrl = json.compilerOptions?.baseUrl ?? '.';
		return Object.entries(json.compilerOptions?.paths ?? {}).map(([pattern, targets]) => ({
			pattern,
			targets: targets.map((t) => path.posix.normalize(path.posix.join(baseUrl, t))),
		}));
	} catch {
		return [];
	}
};

export const goModuleOf = (goMod: string | null): string | null => /^module\s+(\S+)/m.exec(goMod ?? '')?.[1] ?? null;
