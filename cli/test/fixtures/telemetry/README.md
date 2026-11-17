# Telemetry hook payload fixtures

Real hook payloads that the `asdd observe` parser is tested against (ADR-004: the parser reads only keys that a
committed fixture shows). Never hand-write a payload here.

## File shape

```json
{ "provenance": { "runtime", "runtime_version", "captured_at", "captured_by", "method" }, "payload": { … } }
```

`method` is `live-capture` (payload written by a real runtime hook) or `vendor-doc` (copied from vendor
documentation; such a fixture does not count as proof for D-3).

## Claude Code (`claude/`)

Captured 2026-11-17 from Claude Code 2.1.283 by a temporary `PostToolUse` hook (matcher `Read|Skill`,
command `cat > <file>`) in an uncommitted `.claude/settings.local.json`, removed after capture.

| Fixture | Case |
|---|---|
| `posttooluse-read-steering` | `Read` of a `.harness/steering/` file, no `limit` |
| `posttooluse-read-offset-limit` | `Read` with `limit` (extra `tool_input` key) |
| `posttooluse-read-nonguidance` | `Read` of a file that is not guidance (`package.json`) |
| `posttooluse-read-claude-skills` | `Read` through the `.claude/skills` alias of `.agents/skills` |
| `posttooluse-skill-installed` | `Skill` call of a kit skill installed under `.agents/skills/` |
| `posttooluse-skill-namespaced` | `Skill` call of a plugin skill (`plugin:name`) |
| `posttooluse-read-subagent` | `Read` made by a sub-agent |

Observed facts:

- `Read`: `tool_input.file_path` is absolute; `limit`/`offset` appear only when passed.
- `Skill`: `tool_input.skill` is the bare name (`codegraph`) or `plugin:name`; `tool_response` is
  `{ success, commandName }`.
- The parent's `PostToolUse` hook fires for a sub-agent's tool calls. Those payloads add `agent_id` and
  `agent_type`; main-session payloads have neither key (A-01 confirmed; agent id is omitted when absent).
- Every payload carries `session_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `prompt_id`, `permission_mode`,
  `tool_use_id`, `duration_ms`; main-session payloads also carry `effort`. The parser must not copy
  `transcript_path`, `cwd`, `scratchpad_dir` or `tool_response` (REQ-004).

Hook exit behaviour (OI-6), probed with `Read` in the same session:

- exit 1 with stderr: the tool result is unchanged and nothing reaches the model.
- exit 2 with stderr: the tool result is unchanged, and the stderr reaches the model as a
  "PostToolUse:Read hook blocking error" notice on a later turn. `asdd observe` must therefore never exit 2.
- `timeout: 1` with a 3 s hook: the tool result is unchanged and nothing reaches the model.

## Redaction

Applied before commit:

- the absolute repository path → `${REPO}`; other home paths → `${HOME}`; temp paths → `${SCRATCHPAD}`;
- `transcript_path` → a placeholder value (kept, so the "never copied" test has a value);
- `tool_response.file.content` → `<redacted file content>`;
- `session_id`, `prompt_id`, `agent_id`, `tool_use_id` → fixed fake ids of the same shape (the same real id maps to the
  same fake id across fixtures).

## Cursor (`cursor/`)

See TASK-002 (D-3): the Cursor load hook ships only with a `live-capture` fixture.
