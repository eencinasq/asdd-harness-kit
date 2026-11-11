/**
 * Minimal doublestar-like matcher for the allowlist and rule patterns.
 * Supports *, **, and {a,b} brace expansion. Case-insensitive via caller.
 */

const expandBraces = (pattern: string): string[] => {
	const match = /\{([^{}]+)\}/.exec(pattern);
	if (!match || match.index === undefined) return [pattern];
	const before = pattern.slice(0, match.index);
	const after = pattern.slice(match.index + match[0].length);
	const alts = (match[1] ?? '').split(',');
	return alts.flatMap((alt) => expandBraces(`${before}${alt}${after}`));
};

const globToRegExp = (pattern: string): RegExp => {
	let i = 0;
	let out = '^';
	while (i < pattern.length) {
		const ch = pattern[i] ?? '';
		if (ch === '*' && pattern[i + 1] === '*') {
			if (pattern[i + 2] === '/') {
				out += '(?:.*/)?';
				i += 3;
			} else {
				out += '.*';
				i += 2;
			}
			continue;
		}
		if (ch === '*') {
			out += '[^/]*';
			i += 1;
			continue;
		}
		if (ch === '?') {
			out += '[^/]';
			i += 1;
			continue;
		}
		if ('\\.()+|^$[]{}'.includes(ch)) out += `\\${ch}`;
		else out += ch;
		i += 1;
	}
	out += '$';
	return new RegExp(out);
};

/** Compiled patterns: the filters run ~100 globs on every file of every PR. */
const compiled = new Map<string, readonly RegExp[]>();

export const matchGlob = (pattern: string, pathValue: string): boolean => {
	let regexps = compiled.get(pattern);
	if (!regexps) {
		regexps = expandBraces(pattern).map(globToRegExp);
		compiled.set(pattern, regexps);
	}
	return regexps.some((re) => re.test(pathValue));
};
