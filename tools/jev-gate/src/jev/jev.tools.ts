import { Inject, Injectable } from '@nestjs/common';
import { Tool } from '@nestjs/mcp';

import {
	type CommandSafetyInput,
	CommandSafetyInputSchema,
	type EarsGateInput,
	EarsGateInputSchema,
	type JevStatusInput,
	JevStatusInputSchema,
	type ScopeChoiceInput,
	ScopeChoiceInputSchema,
	type ShapeUpGatesInput,
	ShapeUpGatesInputSchema,
} from './jev.schemas.ts';
import { JevService, type Verdict } from './jev.service.ts';

/** JSON text result; an unavailable or failed gate is a tool error (never a pass). */
const present = ({ payload, failed }: Verdict) => ({
	content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
	structuredContent: payload,
	isError: failed,
});

/** Jev calls a remote judge (System One): open world, read-only on this machine. */
const JEV_CALL = { readOnlyHint: true, openWorldHint: true } as const;

@Injectable()
export class JevTools {
	constructor(@Inject(JevService) private readonly jev: JevService) {}

	@Tool({
		name: 'jev_status',
		title: 'Jev status',
		annotations: JEV_CALL,
		description:
			'Confirm Jev is configured for shape-up / product-delivery (JEV_API_KEY + capabilities.jev.enabled). Call before other jev_* tools. Do not use from harness ASDD agents.',
		inputSchema: JevStatusInputSchema,
	})
	async status(args: JevStatusInput) {
		return present(await this.jev.status(args.health));
	}

	@Tool({
		name: 'jev_shape_up_gates',
		title: 'Shape Up gates',
		annotations: JEV_CALL,
		description:
			'Shape Up required gates: appetite jevScore + rabbit-hole jevNoul. Call after pitch draft, before betting. Fail if ok=false or unavailable.',
		inputSchema: ShapeUpGatesInputSchema,
	})
	async shapeUpGates(args: ShapeUpGatesInput) {
		return present(await this.jev.shapeUpGates(args.pitch, args.appetite));
	}

	@Tool({
		name: 'jev_ears_gate',
		title: 'EARS gate',
		annotations: JEV_CALL,
		description:
			'Product-delivery EARS gate: noul that the requirement is an observable, unconditioned outcome. Rewrite if prob_yes < 0.85 unless # jev-override: accept.',
		inputSchema: EarsGateInputSchema,
	})
	async earsGate(args: EarsGateInput) {
		return present(await this.jev.earsGate(args.requirement));
	}

	@Tool({
		name: 'jev_scope_choice',
		title: 'Scope choice',
		annotations: JEV_CALL,
		description:
			'Product-delivery scope class within a bet: must_have | nice_to_have | reshape (back to shaping, never a backlog).',
		inputSchema: ScopeChoiceInputSchema,
	})
	async scopeChoice(args: ScopeChoiceInput) {
		return present(await this.jev.scopeChoice(args.scope));
	}

	@Tool({
		name: 'check_command_safety',
		title: 'Check command safety (deprecated)',
		annotations: { readOnlyHint: true, openWorldHint: false },
		description:
			'Deprecated: use `asdd gate` (hooks already do). Checks a bash command against the pattern allow/deny list; does not call Jev.',
		inputSchema: CommandSafetyInputSchema,
	})
	async checkCommandSafety(args: CommandSafetyInput) {
		return present(await this.jev.checkCommandSafety(args.command, args.override));
	}
}
