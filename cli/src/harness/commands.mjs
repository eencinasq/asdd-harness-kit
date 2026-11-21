import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The harness + kit commands of the asdd CLI (registry commands.* — kernel-owned tables; the consumer `commands`
 * contribution type stays fail-closed). `asdd <command> [args]` runs the script next to this file, in the project of
 * the current directory. One table for the dispatcher, `asdd help`, and the docs. Bundled registry only: command
 * semantics are the running CLI's own contract (cli/registry/ ships in the package).
 */
let REGISTRY;
try {
  REGISTRY = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../registry/contribution-points.json'), 'utf8'),
  );
} catch {
  // A mangled package still answers --version/help and dispatch errors instead of dying at import.
  REGISTRY = { commands: { harness: {}, kit: {} } };
}
export const HARNESS_COMMANDS = REGISTRY.commands.harness;
export const KIT_COMMANDS = REGISTRY.commands.kit;

/**
 * `asdd <args>` → { script, argv } for a harness command, or null when `args[0]` is not one.
 * `pass` subcommands keep their name as the script's first argument (knowledge search … → knowledge-query.mjs search …).
 */
export function resolveHarnessCommand(args) {
  const [name, ...rest] = args;
  const entry = HARNESS_COMMANDS[name];
  if (!entry) return null;
  if (!entry.sub) return { name, ...entry, argv: rest };
  const [subName, ...subRest] = rest;
  const sub = entry.sub[subName];
  if (!sub) return { name, error: `usage: asdd ${name} ${Object.keys(entry.sub).join('|')} …` };
  return { name: `${name} ${subName}`, ...sub, argv: sub.pass ? [subName, ...subRest] : subRest };
}
