/**
 * Deterministic checks: findings that need no model and are never sent to one. Today: a PR that adds
 * or changes a secrets file (`.env`, private keys, credentials). The file's content is excluded from
 * the review (it may hold live credentials), so the finding is about the file itself.
 */
import { rightSideLines } from './hunks.ts';
import type { FileDecision, ReviewFinding } from './types.ts';

export const secretFileFinding = (decision: FileDecision): ReviewFinding | undefined => {
	if (decision.reason !== 'secret' || decision.diff.isDeleted) return undefined;
	const first = rightSideLines(decision.diff.diff)[0];
	const verb = decision.diff.isNew ? 'adds' : 'changes';
	return {
		path: decision.path,
		startLine: first ?? 0,
		endLine: first ?? 0,
		severity: 'high',
		category: 'security',
		ruleId: 'checks.secret-file',
		source: 'check',
		confidence: 90,
		content: `This PR ${verb} \`${decision.path}\`, which looks like a secrets file. Secrets must not be committed: remove it from the PR, rotate any credential it held, and ignore the file (\`.gitignore\`). Use an \`.example\` file for the shape.`,
		evidence: 'The path matches the secret-file patterns; its content was not sent to the reviewer.',
	};
};

/** Every deterministic finding for the PR's files. */
export const deterministicFindings = (decisions: readonly FileDecision[]): ReviewFinding[] =>
	decisions.map(secretFileFinding).filter((f): f is ReviewFinding => f !== undefined);
