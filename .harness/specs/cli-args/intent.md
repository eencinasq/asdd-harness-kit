# cli-args — Intent

Every `asdd` command declares its arguments once, in the registry, and parses them the same way: no per-script
`process.argv` scanning, generated help per command, and shell completion.

- `cli/registry/contribution-points.json` — each `commands.harness` / `commands.kit` / `commands.control` entry
  declares `args` (positionals) and `flags` (type, short, multiple, value placeholder, default, help). `commands.kit`
  entries become objects (`module` + spec); `commands.control` adds `install`, `uninstall`, `doctor`.
- `cli/src/harness/commands.mjs` — `parseCommand(name, argv)` on `node:util` `parseArgs` (strict; unknown option,
  missing value, missing or extra positional → `UsageError`, exit 2), `commandHelp`, `completion(bash|zsh|fish)`,
  `runMain` (direct `node <script>` runs), `isEntry` (symlink-safe).
- Every harness script exports `run(argv)` and returns its exit status; `main.mjs` calls it instead of rewriting
  `process.argv` and importing for side effects. The hooks (`gate`, `verify`, `span`, `observe`) take no parser import:
  they must still deny / answer when the rest of the package is broken.
- `asdd <command> --help`, `asdd help <command>`, `asdd completion <shell>`; the overview is generated too.
- `asdd kit vendor` strips a script's CLI tail from the `// asdd CLI: ` marker and follows imports of the stripped
  text only, so MCP server copies never load `commands.mjs`.

Decision (not oclif): `parseArgs` is built into Node 22 — the package keeps zero runtime dependencies, the hooks keep
their in-process latency (`asdd gate` 34 ms before and after), and the registry stays the one source of truth for
dispatch, help, completion, and docs.

Not in scope: changing what any command does. Usage errors now exit 2 everywhere (`knowledge search` without a query
exited 1).
