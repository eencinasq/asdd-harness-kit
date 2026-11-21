# pipeline-e2e — Intent

Prove the whole ASDD pipeline stays wired: a `--full` slice walks every phase with its artifact and gate to DONE,
the runtime hooks run exactly as installed (Claude Code and Cursor command lines, through the project's
`node_modules/.bin/asdd`), and every registry command answers in an installed project.

- `cli/test/full-pipeline.sh` — the e2e (full-flow.sh keeps the lite → escalated path).
- `package.json` — `npm test` runs it; `npm run test:full-pipeline` runs it alone.
