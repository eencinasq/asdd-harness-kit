import * as z from 'zod';

export const JevStatusInputSchema = z.object({
	health: z.boolean().default(false).describe('If true, also ping System One'),
});

export const ShapeUpGatesInputSchema = z.object({
	pitch: z
		.union([z.record(z.string(), z.unknown()), z.string().trim().min(1)])
		.describe('Pitch payload (problem, appetite, solution, no-gos, etc.), or its text'),
	appetite: z.string().optional().describe('Optional appetite label (e.g. "2 weeks") merged into pitch context'),
});

export const EarsGateInputSchema = z.object({
	requirement: z.string().trim().min(1, 'requirement must be a non-empty string').describe('EARS requirement text'),
});

export const ScopeChoiceInputSchema = z.object({
	scope: z
		.union([z.record(z.string(), z.unknown()), z.string().trim().min(1)])
		.describe('Scope object (id, name, outcome, must-haves) or summary string'),
});

export const CommandSafetyInputSchema = z.object({
	command: z.string().trim().min(1, 'command must be a non-empty string').describe('The bash command to check'),
	override: z.boolean().default(false).describe('Override the gate decision (user-authorized; use with caution)'),
});

export type JevStatusInput = z.infer<typeof JevStatusInputSchema>;
export type ShapeUpGatesInput = z.infer<typeof ShapeUpGatesInputSchema>;
export type EarsGateInput = z.infer<typeof EarsGateInputSchema>;
export type ScopeChoiceInput = z.infer<typeof ScopeChoiceInputSchema>;
export type CommandSafetyInput = z.infer<typeof CommandSafetyInputSchema>;
