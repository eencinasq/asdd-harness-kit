/**
 * Deprecated shim: the command gate is now `command-gate.mjs` (kit-hygiene, REQ-009).
 * Kept so hook configs that still call this path get identical verdicts. The installer
 * rewrites such entries to `command-gate.mjs`; remove this file in a major release.
 */
import { runHookCli } from './command-gate.mjs';

export * from './command-gate.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  await runHookCli();
}
