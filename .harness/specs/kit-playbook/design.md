# Design: kit-playbook (lite)

- The playbook mirrors `tools/spec-drift/docs/PLAYBOOK.md` (sections 1–6) and names only commands `asdd help` lists;
  `docs/**` already ships in the npm package.
- Version: `asdd kit versions bump 3.11.0` (package, lock, every artifact), then `asdd kit self` for the kit's own copies.
  spec-drift and knowledge gained tools (1.1.0); jev-gate only received refreshed copies (stays 1.0.0).
