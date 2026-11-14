/**
 * Where a finding came from (spec-drift-demand REQ-001, ADR-001): the commit that last changed its line
 * (`git blame --porcelain`) and the oldest commit that added the line's text (`git log -S`). Pure parsing.
 */

export type OriginCommit = {
	readonly sha: string;
	readonly author: string;
	readonly date: string;
	readonly subject: string;
	/** PR number from a squash `(#N)` or `Merge pull request #N` subject. */
	readonly pr: number | null;
};

export const FIELD_SEPARATOR = '\x1f';
/** `git log` format matching parseLogLine. */
export const LOG_FORMAT = ['%H', '%an', '%aI', '%s'].join('%x1f');

const PR_IN_SUBJECT = /\(#(\d+)\)\s*$|Merge pull request #(\d+)/;

export const prFromSubject = (subject: string): number | null => {
	const m = PR_IN_SUBJECT.exec(subject);
	return m ? Number(m[1] ?? m[2]) : null;
};

/** One line of `git blame -L n,n --porcelain`; null when the output has no commit (or the line is not committed). */
export const parseBlamePorcelain = (text: string): (OriginCommit & { readonly committed: boolean }) | null => {
	const lines = text.split('\n');
	const sha = /^([0-9a-f]{40})\s/.exec(lines[0] ?? '')?.[1];
	if (!sha) return null;
	const field = (name: string) => lines.find((l) => l.startsWith(`${name} `))?.slice(name.length + 1) ?? '';
	const seconds = Number(field('author-time'));
	const subject = field('summary');
	return {
		sha,
		author: field('author'),
		date: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : '',
		subject,
		pr: prFromSubject(subject),
		committed: !/^0+$/.test(sha),
	};
};

/** A line of `git log --format=LOG_FORMAT`. */
export const parseLogLine = (line: string): OriginCommit | null => {
	const [sha, author, date, ...rest] = line.split(FIELD_SEPARATOR);
	if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return null;
	const subject = rest.join(FIELD_SEPARATOR);
	return { sha, author: author ?? '', date: date ?? '', subject, pr: prFromSubject(subject) };
};

export const describeOrigin = (o: {
	readonly path: string;
	readonly line: number;
	readonly lastChange: OriginCommit | null;
	readonly committed: boolean;
	readonly introduced: OriginCommit | null;
}): string => {
	const commit = (c: OriginCommit) =>
		`${c.sha.slice(0, 10)} by ${c.author} on ${c.date.slice(0, 10)}${c.pr ? ` (PR #${c.pr})` : ''}: ${c.subject}`;
	return [
		`${o.path}:${o.line}`,
		!o.committed
			? 'Last change: not committed yet (a local edit).'
			: o.lastChange
				? `Last change: ${commit(o.lastChange)}`
				: 'Last change: unknown.',
		o.introduced
			? `Text first added: ${commit(o.introduced)}`
			: 'Text first added: not found in the history of this file.',
	].join('\n');
};
