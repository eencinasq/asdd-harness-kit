import fs from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import { writeFileAtomic } from '../../common/fs/atomic-write.ts';

import type { CommentsCheck, ParsedComments, ResolvedPaths } from '../pr-review.types.ts';
import { buildCommentsCheck, parseCommentsMarkdown, validateParsedComments } from './comments-format.ts';

export type SavedDraft = { readonly parsed: ParsedComments; readonly warnings: readonly string[] };

/**
 * Persists report.md / comments.md drafts and compares human edits against the
 * `.original/comments.md` snapshot taken when the agent finished its draft.
 */
@Injectable()
export class CommentsService {
	/** Write both drafts; by default also refresh the `.original` snapshot used to detect human edits. */
	async saveDraft(
		paths: ResolvedPaths,
		draft: {
			readonly reportMarkdown: string;
			readonly commentsMarkdown: string;
			/** false during incremental group submits, so later human edits are still detected. */
			readonly snapshotOriginal?: boolean;
		},
	): Promise<SavedDraft> {
		const parsed = parseCommentsMarkdown(draft.commentsMarkdown);
		await writeFileAtomic(paths.report, draft.reportMarkdown);
		await writeFileAtomic(paths.comments, draft.commentsMarkdown);
		if (draft.snapshotOriginal !== false) {
			await fs.mkdir(path.dirname(this.originalPath(paths)), { recursive: true });
			await writeFileAtomic(this.originalPath(paths), draft.commentsMarkdown);
		}
		return { parsed, warnings: validateParsedComments(parsed) };
	}

	/** Save edits made in the dashboard (never touches the `.original` snapshot). */
	async saveFromUi(
		paths: ResolvedPaths,
		draft: { readonly commentsMarkdown: string; readonly reportMarkdown?: string },
	): Promise<SavedDraft> {
		const parsed = parseCommentsMarkdown(draft.commentsMarkdown);
		await writeFileAtomic(paths.comments, draft.commentsMarkdown);
		if (draft.reportMarkdown !== undefined) {
			await writeFileAtomic(paths.report, draft.reportMarkdown);
		}
		return { parsed, warnings: validateParsedComments(parsed) };
	}

	/** Diff current comments.md against the `.original` snapshot (all "added" when there is none). */
	async checkAgainstOriginal(paths: ResolvedPaths): Promise<CommentsCheck> {
		const current = parseCommentsMarkdown(await fs.readFile(paths.comments, 'utf8'));
		const originalText = await fs.readFile(this.originalPath(paths), 'utf8').catch(() => null);
		return buildCommentsCheck(current, originalText === null ? null : parseCommentsMarkdown(originalText));
	}

	private originalPath(paths: ResolvedPaths): string {
		return path.join(paths.base, '.original', 'comments.md');
	}
}
