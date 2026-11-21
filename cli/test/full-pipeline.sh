#!/usr/bin/env bash
# Full-pipeline e2e: a --full slice walks every ASDD phase (discovery → knowledge) with its artifact and gate, the
# installed runtime hooks run exactly as Claude Code and Cursor run them, and every registry command answers in an
# installed project (its --help, and a real run). full-flow.sh covers the lite → escalated path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
asdd() { node "$ROOT/cli/bin/asdd.mjs" "$@"; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-pipeline-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "FAIL $*" >&2; exit 1; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

APP="$TMP/billing-app"
mkdir -p "$APP"
asdd install "$APP" --runtime=cursor,claude --no-interactive >/dev/null
cd "$APP"
git init -q && git config user.email "test@asdd.local" && git config user.name "asdd-test"
# The project's devDependency, as npm i -D asdd-harness-kit lays it out: the hooks resolve node_modules/.bin/asdd.
mkdir -p node_modules/.bin
ln -s "$ROOT" node_modules/asdd-harness-kit
ln -s ../asdd-harness-kit/cli/bin/asdd.mjs node_modules/.bin/asdd
printf 'node_modules/\n' >>.gitignore
git add -A >/dev/null && git commit -qm "install asdd" >/dev/null

echo "== 1. runtime hooks: the installed command lines (pipeline-e2e REQ-002) =="
hook() { # runtime event → the installed command line
  case "$1" in
    claude) node -e 'const s=require("./.claude/settings.json");const h=s.hooks[process.argv[1]].flatMap((e)=>e.hooks).find((x)=>x.command.includes(process.argv[2]));process.stdout.write(h.command)' "$2" "$3" ;;
    cursor) node -e 'const s=require("./.cursor/hooks.json");process.stdout.write(s.hooks[process.argv[1]].find((x)=>x.command.includes(process.argv[2])).command)' "$2" "$3" ;;
  esac
}
for rt in claude cursor; do
  [ "$rt" = claude ] && GATE_EV=PreToolUse || GATE_EV=beforeShellExecution
  [ "$rt" = claude ] && STOP_EV=Stop || STOP_EV=stop
  GATE="$(hook $rt $GATE_EV gate)"; VERIFY="$(hook $rt $STOP_EV verify)"
  if [ "$rt" = claude ]; then
    ALLOW='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}'
    DENY='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'
    STOP='{"hook_event_name":"Stop","stop_hook_active":false}'
  else
    ALLOW='{"command":"git status"}'; DENY='{"command":"rm -rf /"}'; STOP='{"status":"completed","loop_count":0}'
  fi
  out="$(printf '%s' "$ALLOW" | CLAUDE_PROJECT_DIR="$APP" sh -c "$GATE")" || fail "$rt gate exited non-zero on an allowed command"
  grep -q '"deny"' <<<"$out" && fail "$rt gate denied git status: $out"
  out="$(printf '%s' "$DENY" | CLAUDE_PROJECT_DIR="$APP" sh -c "$GATE")" || true
  grep -q '"deny"' <<<"$out" || fail "$rt gate let rm -rf / through: $out"
  out="$(printf '%s' "$STOP" | CLAUDE_PROJECT_DIR="$APP" sh -c "$VERIFY")" || fail "$rt verify exited non-zero"
  [ "$out" = '{}' ] || fail "$rt verify blocked a clean project: $out"
  echo "  $rt: gate allows/denies, verify releases a clean session"
done
OBSERVE="$(hook claude PostToolUse observe)"
printf '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":".harness/steering/controls.md"}}' \
  | CLAUDE_PROJECT_DIR="$APP" sh -c "$OBSERVE" || fail "observe hook exited non-zero"
echo "  claude: observe hook is fail-open"

echo "== 2. --full slice: every phase, its artifact, its gate (pipeline-e2e REQ-001) =="
S=invoice-export
asdd slice init "$S" --full >/dev/null
grep -q '"mode": "full"' ".harness/state/slices/$S/manifest.json" || fail "slice init --full did not set mode full"
SPEC=".harness/specs/$S"; SESS=".harness/state/slices/$S/sessions"; FEAT=".harness/features/$S.features.json"
n=1
session() { # event phase evidence [extra json]
  n=$((n + 1)); local f; f="$(printf '%03d' $n)-$1-$2.json"
  printf '{ "schema_version": "1.0", "session_id": "sess-%s-%03d", "timestamp": "%s", "agent": "test-agent", "human": "tl", "slice_id": "%s", "event_type": "%s", "phase": "%s", "evidence": "%s", "concerns": []%s }\n' \
    "$S" $n "$(now)" "$S" "$1" "$2" "$3" "${4:-}" >"$SESS/$f"
}
phase_of() { node -p "require('./.harness/state/slices/$S/manifest.json').phase"; }
status_of() { node -p "require('./.harness/state/slices/$S/manifest.json').status"; }
complete() { # phase next-phase evidence
  session phase_completed "$1" "$3"
  asdd sync --slice "$S" >/dev/null
  [ "$(phase_of)" = "$2" ] || fail "after $1 the slice is in $(phase_of), expected $2"
  local out; out="$(asdd check --slice "$S" 2>&1)" || fail "asdd check failed after $1: $out"
  if grep -q 'QG-DEC-09' <<<"$out"; then fail "phase chain broken after $1: $out"; fi
  echo "  $1 → $2"
}

cat >"$SPEC/intent.md" <<'EOF'
# invoice-export — Intent
Accountants export a month of invoices as CSV. Scope: `src/export` only.
EOF
cat >"$SPEC/capability.md" <<'EOF'
# invoice-export — Capability
CAP-1: export the invoices of one month as CSV.
EOF
complete discovery spec "capability.md, grounded in src/export"
cat >"$SPEC/requirements.md" <<'EOF'
# invoice-export — Requirements
- **REQ-001.** WHEN an accountant exports a month, the system SHALL return one CSV row per invoice of that month.
- **REQ-002.** IF the month has no invoices, THEN the system SHALL return the header row only.
EOF
complete spec validation "requirements.md: 2 EARS requirements"
printf '# Spec validation report\nGate: PASS (2/2 requirements testable, no anti-patterns)\n' >"$SPEC/spec-validation-report.md"
complete validation domain "spec-validation-report.md PASS"
complete domain design "no new domain terms (Invoice, Month already defined)"
printf '# invoice-export — Design\n`src/export/csv.js` builds rows from invoices; no new boundary. Traceability: REQ-001, REQ-002 → csv.js.\n' >"$SPEC/design.md"
complete design task_planning "design.md; no ADR needed"
cat >"$SPEC/tasks.md" <<'EOF'
# invoice-export — Tasks
- **TASK-001** CSV rows for a month (REQ-001, REQ-002).
EOF
cat >"$FEAT" <<'EOF'
{
  "schema_version": "1.0",
  "slice_id": "invoice-export",
  "source_tasks": ".harness/specs/invoice-export/tasks.md",
  "features": [
    { "id": "TASK-001", "title": "CSV rows for a month", "user_visible_behavior": "export returns one row per invoice", "status": "not_started", "priority": 1, "owner": "test-agent", "req_ids": ["REQ-001", "REQ-002"], "depends_on": [], "verification": ["node --test test/csv.test.mjs"], "scope_paths": ["src/export/csv.js", "test/csv.test.mjs"] }
  ]
}
EOF
complete task_planning implementation "tasks.md + features: 1 task, 1 wave"

session feature_started implementation "RED: test/csv.test.mjs fails" ', "feature_id": "TASK-001", "scope_paths": ["src/export/csv.js", "test/csv.test.mjs"]'
mkdir -p src/export test
printf 'export const toCsv = (invoices) => ["id,total", ...invoices.map((i) => `${i.id},${i.total}`)].join("\\n");\n' >src/export/csv.js
cat >test/csv.test.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/export/csv.js';
// REQ-001: one row per invoice. REQ-002: header only for an empty month.
test('REQ-001 one CSV row per invoice', () => assert.equal(toCsv([{ id: 1, total: 5 }]).split('\n').length, 2));
test('REQ-002 header only when the month is empty', () => assert.equal(toCsv([]), 'id,total'));
EOF
# converge reads tracked test files (git ls-files): stage the new ones, as the agent does before converging.
git add -A >/dev/null
EVIDENCE="$(node --test test/csv.test.mjs 2>&1 | grep -E '^# pass' | tr -d '\n')" || fail "feature test failed"
node -e '
const fs = require("fs"); const p = process.argv[1]; const d = JSON.parse(fs.readFileSync(p, "utf8"));
d.features[0].status = "passing"; d.features[0].evidence = `node --test test/csv.test.mjs: ${process.argv[2]}`;
fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");' "$FEAT" "$EVIDENCE"
session feature_completed implementation "GREEN: $EVIDENCE" ', "feature_id": "TASK-001"'
asdd sync --slice "$S" >/dev/null
grep -q '"evidence_hash"' "$FEAT" || fail "asdd sync did not stamp the passing feature"
out="$(asdd converge --slice "$S" --strict 2>&1)" || fail "converge --strict failed: $out"
complete implementation qa "TASK-001 passing; $EVIDENCE"
printf '# Spec coverage report\nREQ-001 → test/csv.test.mjs; REQ-002 → test/csv.test.mjs. Gate: PASS\n' >"$SPEC/spec-coverage-report.md"
complete qa knowledge "spec-coverage-report.md: 2/2 requirements pinned"
session phase_completed knowledge "no reusable pattern"
asdd sync --slice "$S" >/dev/null
[ "$(status_of)" = DONE ] || fail "the slice is $(status_of) after knowledge, expected DONE"
asdd check --live >/dev/null || fail "asdd check --live failed on the finished slice"
asdd drift --slice "$S" --json | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.findings.some((f)=>f.severity==="fail"))process.exit(1)})' \
  || fail "spec drift FAILs on the finished slice"
echo "  knowledge → DONE; check --live and drift pass"

echo "== 2b. negative: a phase completed out of order is flagged (QG-DEC-09; pipeline-e2e REQ-004) =="
asdd slice init skipper --full >/dev/null
printf '{ "schema_version": "1.0", "session_id": "sess-skipper-002", "timestamp": "%s", "agent": "test-agent", "slice_id": "skipper", "event_type": "phase_completed", "phase": "design", "evidence": "skipped spec and validation", "concerns": [] }\n' "$(now)" \
  >.harness/state/slices/skipper/sessions/002-phase_completed-design.json
asdd sync --slice skipper >/dev/null
out="$(asdd check --slice skipper 2>&1)" || true
grep -q 'QG-DEC-09 slice "skipper": design completed (sess-skipper-002) with no validation gate recorded' <<<"$out" \
  || fail "a skipped phase was not flagged: $out"
echo "  design without validation → QG-DEC-09"

echo "== 3. every registry command answers in the project (pipeline-e2e REQ-003) =="
node --input-type=module - "$ROOT" <<'EOF'
import { spawnSync } from 'node:child_process';
const root = process.argv[2];
const { allCommands } = await import(`${root}/cli/src/harness/commands.mjs`);
const bin = `${root}/cli/bin/asdd.mjs`;
// A real run per harness command: read-only or idempotent arguments, with the exits each may legitimately give.
const RUNS = {
  check: [[], [0]], drift: [['--json'], [0]], 'check-config': [[], [0, 1]], 'skills-index': [[], [0]],
  status: [[], [0]], converge: [['--json'], [0]], 'converge-eval': [['--json'], [0, 1]], waves: [['--json'], [0]],
  portfolio: [['--json'], [0]], 'tracker-sync': [['--json'], [0]], 'spec-source': [['--json'], [0, 1]],
  sync: [[], [0]], repair: [['--dry-run', '--json'], [0]], 'knowledge sync': [[], [0]],
  'knowledge status': [[], [0]], 'knowledge search': [['invoice'], [0]], 'knowledge trace': [['REQ-001'], [0, 1]],
  'knowledge slice': [['invoice-export'], [0]], 'knowledge patterns': [[], [0]], learn: [['--json'], [0]],
  audit: [['--json', '--no-write'], [0]], triage: [['--list'], [0]], 'skill-eval': [['--json'], [0, 1]],
  profile: [['--json'], [0, 3]], profiling: [['--json'], [0, 3]],
  span: [[], [0], '{"kind":"turn","slice_id":"invoice-export"}'],
  observe: [['claude'], [0], '{}'], gate: [[], [0], '{"command":"ls"}'], verify: [[], [0], '{"status":"completed"}'],
};
// Not run here: they write slices or start a server (lifecycle.sh, full-flow.sh, and the unit tests run them).
const SKIP = new Set(['init-flow', 'slice init', 'slice escalate', 'slice amend', 'intake', 'ui', 'gate-decide',
  'install', 'uninstall', 'doctor']);
const failures = [];
for (const [name, spec] of allCommands()) {
  const words = name.split(' ');
  const help = spawnSync(process.execPath, [bin, ...words, '--help'], { encoding: 'utf8' });
  if (help.status !== 0 || !help.stdout.includes(`asdd ${name}`)) failures.push(`${name} --help: exit ${help.status}`);
  if (words[0] === 'kit' || SKIP.has(name)) continue;
  const run = RUNS[name];
  if (!run) { failures.push(`${name}: no smoke run declared (add it to RUNS or SKIP)`); continue; }
  const [args, okExits, input] = run;
  const r = spawnSync(process.execPath, [bin, ...words, ...args], { encoding: 'utf8', input: input ?? '', timeout: 120000 });
  const crashed = /\n\s+at .+:\d+:\d+/.test(r.stderr);
  if (!okExits.includes(r.status) || crashed) failures.push(`${name} ${args.join(' ')}: exit ${r.status}${crashed ? ' (stack trace)' : ''}\n${r.stderr.slice(0, 400)}`);
}
// doctor on the installed project: the kit, its dirs, and the CLI the hooks resolve are ok.
const d = spawnSync(process.execPath, [bin, 'doctor', '.', '--json'], { encoding: 'utf8' });
const level = Object.fromEntries(JSON.parse(d.stdout).checks.map((c) => [c.id, c.level]));
for (const id of ['kit', 'kit-dirs', 'cli']) if (level[id] !== 'ok') failures.push(`doctor: ${id} is ${level[id]}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`  ${allCommands().length} commands: --help ok; harness commands ran with their expected exits`);
EOF

echo "OK full-pipeline e2e test"
