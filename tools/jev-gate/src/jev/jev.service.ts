import { Inject, Injectable } from '@nestjs/common';

import { jevLibs, type Verdict } from './harness-libs.ts';

export type { Verdict } from './harness-libs.ts';

export const JEV_OPTIONS = Symbol('JEV_OPTIONS');

export type JevOptions = {
	/** Repo with the harness installed; its `.env` / `.env.local` are re-read on every gate call. */
	readonly root: string;
};

/**
 * Skill-scoped System One gates (shape-up, product-delivery) and the deprecated pattern-only command check.
 * A thin projection of the vendored `jev-gates.mjs` verdicts, the same ones the skills get from its CLI.
 */
@Injectable()
export class JevService {
	constructor(@Inject(JEV_OPTIONS) private readonly options: JevOptions) {}

	status(health: boolean): Promise<Verdict> {
		return jevLibs.gates.statusVerdict(this.options.root, { health });
	}

	shapeUpGates(pitch: Record<string, unknown> | string, appetite?: string): Promise<Verdict> {
		return jevLibs.gates.shapeUpVerdict(this.options.root, pitch, appetite);
	}

	earsGate(requirement: string): Promise<Verdict> {
		return jevLibs.gates.earsVerdict(this.options.root, requirement);
	}

	scopeChoice(scope: unknown): Promise<Verdict> {
		return jevLibs.gates.scopeVerdict(this.options.root, scope);
	}

	async checkCommandSafety(command: string, override: boolean): Promise<Verdict> {
		return { payload: await jevLibs.commandGate.checkCommandSafety(command, { override }), failed: false };
	}
}
