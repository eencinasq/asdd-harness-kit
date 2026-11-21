# cli-args — Spec (lite)

## Requirements

- **REQ-001.** Every `asdd` command (harness, kit, control) shall declare its positional arguments and flags in its
  `commands` registry entry, and its implementation shall parse its argv against that entry with `node:util`
  `parseArgs`.
- **REQ-002.** When a command line has an unknown option, an option without its value, a value on a boolean flag, a
  missing required argument, or an extra argument, the CLI shall print the problem and the command's usage on stderr
  and exit 2.
- **REQ-003.** When `asdd <command> --help`, `asdd <command> -h`, or `asdd help <command>` runs, the CLI shall print
  help generated from the registry entry (summary, usage, arguments, options, stdin, environment) and exit 0.
- **REQ-004.** When `asdd completion bash|zsh|fish` runs, the CLI shall print a completion script generated from the
  registry that completes commands, subcommands, and each command's flags.
- **REQ-005.** Each harness script shall export `run(argv)` returning its exit status, and the dispatcher shall call it
  in-process; a direct `node <script>` run (hooks, tests, sibling scripts) shall behave the same.
- **REQ-006.** The hook commands (`gate`, `verify`, `span`, `observe`) shall not depend on the argument parser or the
  registry to answer, and the MCP servers' vendored copies shall not include any script's CLI tail.
