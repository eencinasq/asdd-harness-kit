# cli-args — Tasks

- **TASK-001** Registry `args`/`flags` for every command; `parseCommand`, generated help, completion, dispatcher
  (REQ-001, REQ-002, REQ-003, REQ-004).
- **TASK-002** Harness scripts export `run(argv)` on `parseCommand`; hooks parser-free; vendor strips the CLI tail
  (REQ-001, REQ-005, REQ-006).
- **TASK-003** Kit commands, install, uninstall, and doctor parse through `parseCommand` (REQ-001, REQ-002).
- **TASK-004** PR #13 review: installer parses in main.mjs (layers), help parity (install, knowledge-query), hook
  command lines validated by the dispatcher, long-flag error names (REQ-002, REQ-003, REQ-005, REQ-007).
