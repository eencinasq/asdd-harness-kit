import fs from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

import { writeFileAtomic, writeJsonAtomic } from '../../common/fs/atomic-write.ts';

import type { ArchitectureReviewView } from '../architecture/architecture.types.ts';
import type { ExistingComment } from '../context/review-context.ts';
import type { ReviewProgress } from '../coverage/coverage.ts';
import type { ResolvedPaths, ReviewUnitsView } from '../pr-review.types.ts';
import type { RequirementsState } from '../requirements/requirements.types.ts';
import type { PrRisk } from '../risk/file-risk.ts';

const writeJson = writeJsonAtomic;

/**
 * Typed read/write of the artifact files inside a resolved PR workspace
 * (diff.patch, units.json, progress.json, architecture.json, report.md, comments.md).
 * Missing files read as `undefined`.
 */
@Injectable()
export class ReviewArtifactsRepository {
	async readText(file: string): Promise<string | undefined> {
		return fs.readFile(file, 'utf8').catch(() => undefined);
	}

	writeText(file: string, text: string): Promise<void> {
		return writeFileAtomic(file, text);
	}

	async exists(file: string): Promise<boolean> {
		return fs
			.access(file)
			.then(() => true)
			.catch(() => false);
	}

	loadReviewUnits(paths: ResolvedPaths): Promise<ReviewUnitsView | undefined> {
		return this.readJson<ReviewUnitsView>(paths.units);
	}

	saveReviewUnits(paths: ResolvedPaths, units: ReviewUnitsView): Promise<void> {
		return writeJson(paths.units, units);
	}

	loadProgress(paths: ResolvedPaths): Promise<ReviewProgress | undefined> {
		return this.readJson<ReviewProgress>(paths.progress);
	}

	saveProgress(paths: ResolvedPaths, progress: ReviewProgress): Promise<void> {
		return writeJson(paths.progress, progress);
	}

	async loadArchitecture(paths: ResolvedPaths): Promise<ArchitectureReviewView | undefined> {
		const saved = await this.readJson<ArchitectureReviewView & { semgrepDir?: string }>(paths.architecture);
		if (!saved) return undefined;
		// Reviews saved before the analyzer was pluggable stored `semgrepDir`.
		const { semgrepDir, ...view } = saved;
		return { ...view, rulesDir: view.rulesDir ?? semgrepDir ?? '' };
	}

	loadRequirements(paths: ResolvedPaths): Promise<RequirementsState | undefined> {
		return this.readJson<RequirementsState>(paths.requirements);
	}

	saveRequirements(paths: ResolvedPaths, requirements: RequirementsState): Promise<void> {
		return writeJson(paths.requirements, requirements);
	}

	loadRisk(paths: ResolvedPaths): Promise<PrRisk | undefined> {
		return this.readJson<PrRisk>(paths.risk);
	}

	saveRisk(paths: ResolvedPaths, risk: PrRisk): Promise<void> {
		return writeJson(paths.risk, risk);
	}

	async loadExistingComments(paths: ResolvedPaths): Promise<ExistingComment[]> {
		return (await this.readJson<ExistingComment[]>(paths.existingComments)) ?? [];
	}

	saveExistingComments(paths: ResolvedPaths, comments: readonly ExistingComment[]): Promise<void> {
		return writeJson(paths.existingComments, comments);
	}

	async appendLine(file: string, line: string): Promise<void> {
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.appendFile(file, `${line}\n`);
	}

	saveArchitecture(paths: ResolvedPaths, arch: ArchitectureReviewView): Promise<void> {
		return writeJson(paths.architecture, arch);
	}

	/** Delete the whole PR workspace. */
	removeAll(paths: ResolvedPaths): Promise<void> {
		return fs.rm(paths.base, { recursive: true, force: true });
	}

	private async readJson<T>(file: string): Promise<T | undefined> {
		const raw = await this.readText(file);
		return raw ? (JSON.parse(raw) as T) : undefined;
	}
}
