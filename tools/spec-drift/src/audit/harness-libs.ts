import * as audit from '../harness/audit-lib.mjs';
import * as drift from '../harness/drift-lib.mjs';
import * as knowledgeStore from '../harness/knowledge-store.mjs';
import * as learning from '../harness/learning-lib.mjs';
import * as semgrep from '../harness/semgrep-lib.mjs';
import type { AuditFinding, KnowledgeEdge, KnowledgeNode } from './audit.types.ts';

/**
 * The checks are the harness's own (`cli/src/harness/*.mjs`), vendored into `src/harness/` by the kit's
 * `asdd kit vendor` (cli/src/kit/vendor.mjs), so Verify-on-Stop, CI and chat run the same logic while the server needs nothing
 * from the project but its data under `.harness/`.
 */

type Json = Record<string, unknown>;

export type ArchitectureSource = {
	readonly id: string;
	readonly path: string;
	readonly filled: boolean;
	readonly text?: string;
};

export type SemgrepScan = {
	readonly status: string;
	readonly source: string;
	readonly path?: string;
	readonly message?: string;
	readonly yaml?: string;
	readonly findings: AuditFinding[];
};

export type DriftResult = {
	readonly findings: AuditFinding[];
	readonly summary: Json & {
		linked_slices?: string[];
		spec_compliance?: number | null;
		must_requirements?: number;
	};
	readonly notes?: string[];
};

export type DriftLib = {
	changedFiles(root: string, base: string | null, target: string): string[];
	harnessManaged(root: string): Set<string>;
	isExempt(file: string, managed: Set<string>): boolean;
	isGitRepo(root: string): boolean;
	readBinding(root: string, file: string, label: string): string[];
	resolveBase(root: string, base: string | undefined, target: string): string | null;
	runDrift(options: Json & { root: string }): DriftResult;
};

export type SemgrepLib = {
	loadArchitectureSources(root: string, options?: { includeText?: boolean }): ArchitectureSource[];
	resolveSemgrepConfig(
		root: string,
		sources: ArchitectureSource[],
	): { source: string; path?: string; message?: string; yaml?: string };
	runSemgrepScan(options: { root: string; sources: ArchitectureSource[]; paths: string[]; bin: string }): SemgrepScan;
};

export type AuditReportFile = { readonly path: string; readonly report: Json & { findings?: AuditFinding[] } };

export type AuditLib = {
	applyTriage(root: string, findings: AuditFinding[]): { kept: AuditFinding[]; suppressed: AuditFinding[] };
	latestReport(root: string): AuditReportFile | null;
	listReports(root: string): string[];
};

export type LearningLib = {
	learningForReview(root: string, options: { changed: string[]; slices: string[] }): unknown;
};

export type KnowledgeStore = {
	edgesIncident(id: string): Promise<KnowledgeEdge[]>;
	nodeById(id: string): Promise<KnowledgeNode | null>;
};

export type HarnessLibs = {
	readonly drift: DriftLib;
	readonly semgrep: SemgrepLib;
	readonly audit: AuditLib;
	readonly learning: LearningLib;
	/** The knowledge index is optional: null when it cannot be opened. */
	openKnowledgeStore(root: string): Promise<KnowledgeStore | null>;
};

/** Bundled with the server: no runtime lookup of the project's harness CLI. */
export const harnessLibs: HarnessLibs = {
	drift: drift as unknown as DriftLib,
	semgrep: semgrep as unknown as SemgrepLib,
	audit: audit as unknown as AuditLib,
	learning: learning as unknown as LearningLib,
	async openKnowledgeStore(root) {
		try {
			return await (knowledgeStore as unknown as { openStore(root: string): Promise<KnowledgeStore | null> }).openStore(
				root,
			);
		} catch {
			return null;
		}
	},
};
