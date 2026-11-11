/**
 * Unified diff parser, with C-quoted paths (non-ASCII names). Omits git-show content fetch: agents read
 * code at the PR head with pr_review_read_file.
 */
import type { FileDiff } from './types.ts';

const BINARY_RE = /^Binary files /;

const splitDiffLines = (text: string): string[] =>
	text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

const C_ESCAPES: Readonly<Record<string, number>> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/**
 * A path as git prints it: plain, or C-quoted when it has special or non-ASCII characters
 * (`"src/caf\303\251.ts"`, with `core.quotePath`). Octal escapes are UTF-8 bytes.
 */
export const unquoteGitPath = (raw: string): string => {
	const trimmed = raw.trim();
	if (!(trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed;
	const inner = trimmed.slice(1, -1);
	const bytes: number[] = [];
	for (let i = 0; i < inner.length; i += 1) {
		const ch = inner[i] ?? '';
		if (ch !== '\\') {
			bytes.push(...Buffer.from(ch, 'utf8'));
			continue;
		}
		const next = inner[i + 1] ?? '';
		const octal = /^[0-7]{3}/.exec(inner.slice(i + 1, i + 4))?.[0];
		if (octal) {
			bytes.push(Number.parseInt(octal, 8));
			i += 3;
		} else {
			bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
			i += 1;
		}
	}
	return Buffer.from(bytes).toString('utf8');
};

/** `"a/x y"` → index after the closing quote (escaped quotes skipped). */
const quotedEnd = (text: string, start: number): number => {
	for (let i = start + 1; i < text.length; i += 1) {
		if (text[i] === '\\') i += 1;
		else if (text[i] === '"') return i + 1;
	}
	return -1;
};

const stripPrefix = (p: string, prefix: 'a/' | 'b/'): string => (p.startsWith(prefix) ? p.slice(2) : p);

/** `diff --git` paths when at least one side is quoted. */
const splitQuotedHeader = (rest: string): { oldPath: string; newPath: string } | null => {
	if (rest.startsWith('"')) {
		const end = quotedEnd(rest, 0);
		if (end < 0 || rest[end] !== ' ') return null;
		return {
			oldPath: stripPrefix(unquoteGitPath(rest.slice(0, end)), 'a/'),
			newPath: stripPrefix(unquoteGitPath(rest.slice(end + 1)), 'b/'),
		};
	}
	if (rest.endsWith('"')) {
		const split = rest.lastIndexOf(' "b/');
		if (split < 0) return null;
		return {
			oldPath: stripPrefix(rest.slice(0, split), 'a/'),
			newPath: stripPrefix(unquoteGitPath(rest.slice(split + 1)), 'b/'),
		};
	}
	return null;
};

const splitSamePathHeader = (rest: string): { oldPath: string; newPath: string } | null => {
	for (let i = 0; i + 3 <= rest.length; i += 1) {
		if (rest[i] !== ' ' || rest[i + 1] !== 'b' || rest[i + 2] !== '/') continue;
		const left = rest.slice(0, i);
		const right = rest.slice(i + 3);
		if (left.startsWith('a/') && left.slice(2) === right) {
			return { oldPath: left.slice(2), newPath: right };
		}
	}
	return null;
};

const parseDiffHeaderLine = (line: string): { oldPath: string; newPath: string } | null => {
	if (!line.startsWith('diff --git ')) return null;
	const rest = line.slice('diff --git '.length);
	const quoted = splitQuotedHeader(rest);
	if (quoted) return quoted;
	const same = splitSamePathHeader(rest);
	if (same) return same;
	const match = /^a\/(.+?) b\/(.+)$/.exec(rest);
	if (match) return { oldPath: match[1] ?? '', newPath: match[2] ?? '' };
	return null;
};

type MutableDiff = {
	oldPath: string;
	newPath: string;
	diff: string;
	isBinary: boolean;
	isDeleted: boolean;
	isNew: boolean;
	isRenamed: boolean;
	insertions: number;
	deletions: number;
};

const freeze = (d: MutableDiff): FileDiff => ({ ...d });

export const parseDiffText = (diffText: string): readonly FileDiff[] => {
	const lines = splitDiffLines(diffText);
	const diffs: FileDiff[] = [];
	let current: MutableDiff | null = null;
	let buf: string[] = [];
	let inHunk = false;

	const flush = (): void => {
		if (!current) return;
		current.diff = buf.join('\n').replace(/\n$/, '');
		if (current.isDeleted) current.newPath = '/dev/null';
		diffs.push(freeze(current));
		current = null;
		buf = [];
		inHunk = false;
	};

	for (const line of lines) {
		const header = parseDiffHeaderLine(line);
		if (header) {
			flush();
			current = {
				oldPath: header.oldPath,
				newPath: header.newPath,
				diff: '',
				isBinary: false,
				isDeleted: false,
				isNew: false,
				isRenamed: false,
				insertions: 0,
				deletions: 0,
			};
			inHunk = false;
		}
		if (!current) continue;

		if (line.startsWith('@@')) inHunk = true;
		else if (!inHunk && line.startsWith('index ')) {
			/* skip */
		} else if (!inHunk && BINARY_RE.test(line)) current.isBinary = true;
		else if (line.startsWith('new file mode ')) current.isNew = true;
		else if (line.startsWith('deleted file mode ')) current.isDeleted = true;
		else if (line.startsWith('rename from ')) {
			current.oldPath = unquoteGitPath(line.slice('rename from '.length));
			current.isRenamed = true;
		} else if (line.startsWith('rename to ')) {
			current.newPath = unquoteGitPath(line.slice('rename to '.length));
			current.isRenamed = true;
		} else if (!inHunk && line === '--- /dev/null') current.isNew = true;
		else if (!inHunk && line === '+++ /dev/null') current.isDeleted = true;
		else if (inHunk && line.startsWith('+')) current.insertions += 1;
		else if (inHunk && line.startsWith('-')) current.deletions += 1;

		buf.push(line);
	}
	flush();
	return diffs;
};

export const effectivePath = (diff: FileDiff): string => {
	if (diff.newPath && diff.newPath !== '/dev/null') return diff.newPath;
	return diff.oldPath;
};
