import { fileURLToPath } from 'node:url';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.ts';

/** A root as MCP `roots/list` reports it. */
export interface ClientRoot {
	readonly uri: string;
	readonly name?: string;
}

/** Roots pinned by configuration; each one, when set, wins over what the client reports. */
export interface ExplicitRoots {
	readonly analysis?: string;
	readonly harness?: string;
	readonly prReview?: string;
}

export type WorkspaceRootSource = 'client-roots' | 'cwd';

const pathOfFileUri = (uri: string): string | undefined => (uri.startsWith('file:') ? fileURLToPath(uri) : undefined);

/**
 * The project the server works on. One server process is shared by every project its client opens, and a GUI client
 * starts it from an arbitrary directory (often `/`), so the project comes from the client: the first `file://` root
 * of MCP `roots/list`, refreshed on `notifications/roots/list_changed`. An explicit env root wins; with neither, the
 * working directory.
 */
@Injectable()
export class WorkspaceRoot {
	private clientRoot: string | undefined;

	constructor(
		private readonly explicit: ExplicitRoots,
		private readonly cwd: string,
	) {}

	static fromConfig(config: ConfigService<Env, true>): WorkspaceRoot {
		return new WorkspaceRoot(
			{
				analysis: config.get('ANALYSIS_REPO_ROOT', { infer: true }),
				harness: config.get('HARNESS_ROOT', { infer: true }),
				prReview: config.get('PR_REVIEW_REPO', { infer: true }),
			},
			process.cwd(),
		);
	}

	adoptClientRoots(roots: readonly ClientRoot[]): void {
		this.clientRoot = roots.map((root) => pathOfFileUri(root.uri)).find((root) => root !== undefined);
	}

	source(): WorkspaceRootSource {
		return this.clientRoot === undefined ? 'cwd' : 'client-roots';
	}

	analysisRoot(): string {
		return this.explicit.analysis ?? this.projectRoot();
	}

	harnessRoot(): string {
		return this.explicit.harness ?? this.projectRoot();
	}

	prReviewRepo(): string {
		return this.explicit.prReview ?? this.projectRoot();
	}

	private projectRoot(): string {
		return this.clientRoot ?? this.cwd;
	}
}

export const workspaceRootProvider = {
	provide: WorkspaceRoot,
	inject: [ConfigService],
	useFactory: (config: ConfigService<Env, true>): WorkspaceRoot => WorkspaceRoot.fromConfig(config),
};
