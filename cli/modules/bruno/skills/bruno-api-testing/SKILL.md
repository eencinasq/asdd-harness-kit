---
name: bruno-api-testing
description: >-
  Writes, organizes, and runs Bruno (.bru) collections that test a slice's HTTP API end to end: requests with
  assertions, chained variables, auth, data-driven runs, and the CI command. Use when API requirements need executable
  end-to-end tests. Do NOT use for unit tests of handler logic — use test-driven-development; or for designing the API
  contract (the http-api module's skill).
metadata:
  tier: leaf
---

# Bruno API Testing

Bruno collections are `.bru` files stored with the code, versioned in Git, and run headlessly with the Bruno CLI
(`bru`). Stack resolution, the file format, the workflow detail, CLI and CI commands, patterns, and anti-patterns:
[`references/bruno-reference.md`](./references/bruno-reference.md).

**Operational boundary:** writes only the project's Bruno collection tree (default `docs/bruno/`) and its environment
files without secrets; reads requirements, design, and the API code. It never edits application code.

## Preconditions

- `npx @usebruno/cli --version` (or `bru --version`) exits 0.
- The API runs at the environment's base URL, and secrets come from the environment or a secret store, never from
  `.bru` files.

## Input / Output Contract

- **Inputs:** `requirements` (`path`, `.harness/specs/<slice-id>/requirements.md`, required); `api_source` (`path`, an
  OpenAPI document or the route code, optional); `environment` (`string`, a Bruno environment name, required).
- **Outputs:** `collection` (`bru files`, one request per case under `docs/bruno/<resource>/`, each with tests and a
  `REQ-NNN` in its name or docs block); `run_report` (`json` or `junit`, the CLI output of the run).

## Execution Protocol

### Step 1: Resolve the stack

- **Action:** read `.harness/steering/tech.md` (and `api-test.md` when present) for base URL, auth, collection path,
  and conventions (Step 0 of the reference).
- **Target:** the steering bindings.
- **Assertion:** base URL, auth method, and collection path are named.

### Step 2: Scope and design

- **Action:** map each API MUST requirement to cases (happy path and 4xx errors), the folder layout, and the variables
  that chain requests.
- **Target:** the case list.
- **Assertion:** every API MUST requirement has at least one case.

### Step 3: Implement

- **Action:** write the `.bru` files to disk: request, assertions on status, shape, values, and time; captured
  variables; pre-request auth.
- **Target:** `docs/bruno/<resource>/`.
- **Assertion:** each case of Step 2 has a file on disk.

### Step 4: Run

- **Action:** run the collection with the CLI (`bru run <folder> --env <environment>`, JUnit/JSON output for CI).
- **Target:** the collection.
- **Assertion:** the run exits 0, or each failure is reported as an API defect with the response.

## Verification Gate

1. `bru run docs/bruno --env <environment>` exits 0 (or the report names each failing request as an API defect).
2. `grep -rL 'REQ-[0-9]\{3\}' docs/bruno --include='*.bru'` lists only shared setup requests.
3. `grep -rniE 'password|token|secret' docs/bruno --include='*.bru'` finds only variable references, no literal values.
4. Negative check: `git diff --name-only` lists only files under the collection tree.

## Escalation Gate

HALT when the API does not run, auth cannot be obtained without a secret you lack, or a requirement's expected response
is ambiguous. Escalate as Context → Options → Recommendation → Decision Needed; never assert the observed response
just because the API returned it.

## Handoff & Convergence

- **redirect → `test-driven-development`:** when a failing request is an API defect; passes the request and its response.
