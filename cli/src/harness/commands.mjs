import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * The harness + kit commands of the asdd CLI (registry commands.* — kernel-owned tables; the consumer `commands`
 * contribution type stays fail-closed). `asdd <command> [args]` runs the script next to this file, in the project of
 * the current directory. One table for the dispatcher, the argument parser, `asdd <command> --help`, `asdd help`,
 * `asdd completion`, and the docs. Command semantics are the running CLI's own contract (cli/registry/ ships in the
 * package).
 *
 * A command entry declares its arguments: `args` (positionals: name, required, variadic, help) and `flags`
 * (name → type boolean|string, short, multiple, value (the placeholder in help), default, help). `default` documents
 * the script's own default for --help; the parser leaves an absent flag undefined. Every command also takes -h/--help.
 */
/**
 * The bundled registry first (the running CLI's contract); a harness copy outside the package (no ../../registry)
 * reads the project's installed copy, as sync-state does for the vocabulary.
 */
function loadRegistry() {
  for (const file of [
    join(import.meta.dirname, '../../registry/contribution-points.json'),
    join(process.cwd(), '.harness/config/contribution-points.json'),
  ]) {
    try {
      const registry = JSON.parse(readFileSync(file, 'utf8'));
      if (registry?.commands?.harness) return registry;
    } catch {
      // next candidate
    }
  }
  // A mangled package still answers --version/help and dispatch errors instead of dying at import.
  return { commands: { harness: {}, kit: {}, control: {} } };
}
const REGISTRY = loadRegistry();
export const HARNESS_COMMANDS = REGISTRY.commands.harness;
export const KIT_COMMANDS = REGISTRY.commands.kit;
/** install, uninstall, doctor: the full package's control-plane commands. */
export const CONTROL_COMMANDS = REGISTRY.commands.control ?? {};

/** A wrong command line: the CLI prints it with the command's usage and exits 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.code = 2;
  }
}

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

/** Every command as [full name, entry]: `check`, `slice init`, `kit build`, `install`, … */
export function allCommands() {
  const out = [];
  for (const [name, e] of Object.entries(HARNESS_COMMANDS)) {
    if (e.sub) for (const [s, x] of Object.entries(e.sub)) out.push([`${name} ${s}`, x]);
    else out.push([name, e]);
  }
  for (const [name, e] of Object.entries(CONTROL_COMMANDS)) out.push([name, e]);
  for (const [name, e] of Object.entries(KIT_COMMANDS)) out.push([`kit ${name}`, e]);
  return out;
}

/** The registry entry of a full command name (`drift`, `knowledge search`, `kit build`, `install`), or null. */
export function commandSpec(name) {
  return allCommands().find(([n]) => n === name)?.[1] ?? null;
}

const HELP_FLAG = { type: 'boolean', short: 'h', help: 'show this help' };
const flagsOf = (spec) => ({ ...(spec?.flags ?? {}), help: HELP_FLAG });

/** `asdd <name> <args> [options]` */
export function usage(name) {
  const spec = commandSpec(name);
  const args = (spec?.args ?? []).map((a) => {
    const n = `<${a.name}>${a.variadic ? '…' : ''}`;
    return a.required ? n : `[${n}]`;
  });
  return ['asdd', name, ...args, Object.keys(spec?.flags ?? {}).length ? '[options]' : ''].filter(Boolean).join(' ');
}

const flagLabel = (name, f) =>
  `${f.short ? `-${f.short}, ` : ''}--${name}${(f.type ?? 'boolean') === 'string' ? ` <${f.value ?? 'value'}>` : ''}`;

const table = (rows) => {
  const width = Math.min(Math.max(...rows.map(([l]) => l.length)) + 2, 34);
  return rows
    .map(([label, text]) => (label.length + 2 > width ? `  ${label}\n  ${''.padEnd(width)}${text}` : `  ${label.padEnd(width)}${text}`))
    .join('\n');
};

/** `asdd <name> --help`, generated from the registry entry. */
export function commandHelp(name) {
  const spec = commandSpec(name);
  if (!spec) return null;
  const parts = [`asdd ${name}: ${spec.help ?? ''}`.trimEnd(), '', 'Usage:', `  ${usage(name)}`];
  if (spec.description) parts.push('', spec.description.trimEnd());
  if (spec.args?.length) {
    parts.push('', 'Arguments:', table(spec.args.map((a) => [`<${a.name}>${a.variadic ? '…' : ''}`, `${a.help ?? ''}${a.required ? '' : ' (optional)'}`])));
  }
  const flags = Object.entries(flagsOf(spec)).filter(([, f]) => !f.hidden);
  parts.push(
    '',
    'Options:',
    table(
      flags.map(([n, f]) => [
        flagLabel(n, f),
        `${f.help ?? ''}${f.multiple ? ' (repeatable)' : ''}${f.default !== undefined ? ` (default: ${f.default})` : ''}`,
      ]),
    ),
  );
  if (spec.stdin) parts.push('', `stdin: ${spec.stdin}`);
  if (spec.env) parts.push('', 'Environment:', table(Object.entries(spec.env)));
  return `${parts.join('\n')}\n`;
}

/** True when argv asks for help (before a `--` terminator). */
export function wantsHelp(argv) {
  const end = argv.indexOf('--');
  return (end < 0 ? argv : argv.slice(0, end)).some((a) => a === '-h' || a === '--help');
}

/**
 * Parses a command's argv against its registry entry with node:util parseArgs: unknown options, a missing value,
 * missing required positionals, and extra positionals are UsageErrors. Returns parseArgs' { values, positionals },
 * with `args` mapping each declared positional name to its value (a variadic one to an array).
 */
export function parseCommand(name, argv) {
  const spec = commandSpec(name);
  if (!spec) throw new Error(`no registry entry for command "${name}"`);
  const options = {};
  for (const [flag, f] of Object.entries(flagsOf(spec))) {
    options[flag] = { type: f.type ?? 'boolean' };
    if (f.short) options[flag].short = f.short;
    if (f.multiple) options[flag].multiple = true;
  }
  const fail = (message) => new UsageError(`${message}\nusage: ${usage(name)} (asdd ${name} --help)`);
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    if (!String(error?.code).startsWith('ERR_PARSE_ARGS')) throw error;
    const option = error.message.match(/'(-[^' ]+)/)?.[1];
    if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' && option) throw fail(`unknown option: ${option}`);
    if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && option) {
      throw fail(/does not take an argument/.test(error.message) ? `${option} takes no value` : `${option} needs a value`);
    }
    // Anything else: parseArgs' first sentence is the problem (the rest explains `--`).
    throw fail(error.message.split(/\.\s/)[0].replace(/\.$/, ''));
  }
  const declared = spec.args ?? [];
  const { positionals } = parsed;
  const args = {};
  declared.forEach((a, i) => {
    args[a.name] = a.variadic ? positionals.slice(i) : positionals[i];
    if (a.required && (a.variadic ? !args[a.name].length : args[a.name] === undefined)) throw fail(`missing <${a.name}>`);
  });
  if (!declared.some((a) => a.variadic) && positionals.length > declared.length) {
    throw fail(`unexpected argument: ${positionals[declared.length]}`);
  }
  return { values: parsed.values, positionals, args };
}

/**
 * Runs `run(argv)` when the module is the process entry (`node <script> …`, as hooks, tests, and sibling scripts
 * spawn them); a no-op when the dispatcher imported it. --help prints the generated help; a UsageError exits 2.
 */
export async function runMain(url, run, name = commandNameOf(url)) {
  if (!isEntry(url)) return;
  const argv = process.argv.slice(2);
  try {
    if (name && wantsHelp(argv) && commandHelp(name)) {
      process.stdout.write(commandHelp(name));
      return;
    }
    const code = await run(argv);
    if (code !== undefined) process.exitCode = code;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`✗ ${error.message}\n`);
    process.exitCode = error.code;
  }
}

/** True when the module at `url` is the process entry. Node gives the entry its real path (a symlinked tmp dir). */
export function isEntry(url) {
  try {
    return Boolean(process.argv[1]) && url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

/** The registry command that runs `script` (the first, for a script several subcommands share). */
function commandNameOf(url) {
  const file = url.slice(url.lastIndexOf('/') + 1);
  return allCommands().find(([, e]) => e.script === file)?.[0] ?? null;
}

// ── Completion ─────────────────────────────────────────────────────────────────────────────────────────────────

const BUILTINS = ['help', 'completion', '--version', '--help'];
const flagWords = (spec) =>
  Object.entries(flagsOf(spec)).flatMap(([n, f]) => [`--${n}`, ...(f.short ? [`-${f.short}`] : [])]).join(' ');

/** The command tree: top-level words, and per first word either subcommands (a group) or flags. */
function tree() {
  const top = new Map();
  for (const [name, spec] of allCommands()) {
    const [head, sub] = name.split(' ');
    if (sub) {
      if (!top.has(head)) top.set(head, new Map());
      top.get(head).set(sub, spec);
    } else top.set(head, spec);
  }
  return top;
}

const isGroup = (v) => v instanceof Map;

function bash() {
  const top = tree();
  const cases = [...top].map(([head, v]) => {
    if (!isGroup(v)) return `    ${head}) words="${flagWords(v)}" ;;`;
    const subs = [...v].map(([s, spec]) => `        ${s}) words="${flagWords(spec)}" ;;`).join('\n');
    return `    ${head})\n      if [ "$COMP_CWORD" -eq 2 ]; then words="${[...v.keys()].join(' ')}"\n      else case "$w2" in\n${subs}\n      esac; fi ;;`;
  });
  return `# asdd completion for bash. Load it: source <(asdd completion bash)   (or save it under bash-completion's dir)
_asdd_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" w1="\${COMP_WORDS[1]}" w2="\${COMP_WORDS[2]}" words=""
  if [ "$COMP_CWORD" -eq 1 ]; then
    words="${[...top.keys(), ...BUILTINS].join(' ')}"
  else
    case "$w1" in
${cases.join('\n')}
    help) words="${[...top.keys()].join(' ')}" ;;
    completion) words="bash zsh fish" ;;
    esac
  fi
  COMPREPLY=($(compgen -W "$words" -- "$cur"))
}
complete -o default -F _asdd_complete asdd
`;
}

function fish() {
  const q = (s) => `'${String(s ?? '').replace(/'/g, "\\'")}'`;
  const lines = ['# asdd completion for fish. Load it: asdd completion fish | source', 'complete -c asdd -f'];
  const top = tree();
  for (const [head, v] of top) {
    lines.push(`complete -c asdd -n __fish_use_subcommand -a ${head} -d ${q(isGroup(v) ? `${head} …` : v.help)}`);
    const flagLines = (cond, spec) =>
      Object.entries(flagsOf(spec)).map(
        ([n, f]) => `complete -c asdd -n ${q(cond)} -l ${n}${f.short ? ` -s ${f.short}` : ''}${(f.type ?? 'boolean') === 'string' ? ' -r' : ''} -d ${q(f.help)}`,
      );
    if (!isGroup(v)) lines.push(...flagLines(`__fish_seen_subcommand_from ${head}`, v));
    else {
      for (const [s, spec] of v) {
        lines.push(`complete -c asdd -n ${q(`__fish_seen_subcommand_from ${head}; and not __fish_seen_subcommand_from ${[...v.keys()].join(' ')}`)} -a ${s} -d ${q(spec.help)}`);
        lines.push(...flagLines(`__fish_seen_subcommand_from ${head}; and __fish_seen_subcommand_from ${s}`, spec));
      }
    }
  }
  lines.push(`complete -c asdd -n __fish_use_subcommand -a 'help completion'`);
  lines.push(`complete -c asdd -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'`);
  return `${lines.join('\n')}\n`;
}

/** `asdd completion <bash|zsh|fish>`: a completion script generated from the registry. */
export function completion(shell) {
  if (shell === 'bash') return bash();
  // zsh runs the bash function through bashcompinit: one generator, the same words.
  if (shell === 'zsh') {
    return `# asdd completion for zsh. Load it: source <(asdd completion zsh)\nautoload -U +X bashcompinit && bashcompinit\n${bash().split('\n').slice(1).join('\n')}`;
  }
  if (shell === 'fish') return fish();
  throw new UsageError(`usage: asdd completion bash|zsh|fish (got ${shell ?? 'nothing'})`);
}
