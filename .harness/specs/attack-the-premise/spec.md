# attack-the-premise — Spec (lite)

**Author:** asdd-lite-agent · **Model/Tool:** claude-opus-5-5

## Requirements

- **REQ-001.** When a feature's verification fails a second time with the same failure signature, the implementation
  agent and the lite agent shall write a `checkpoint` session with `feature_id`, `premise` (the shared premise, one
  sentence), and `removes` (what the next attempt removes) before a third attempt; when the third attempt fails, they
  shall set the feature `blocked` and append the failure log (QG-DEB-05). Each failed attempt shall be recorded as a
  session carrying `feature_id` and `failure_signature`.
- **REQ-002.** While a slice is `in_progress`, when its sessions record two failures with the same
  `failure_signature` on one `feature_id` and no `checkpoint` session for that feature with a non-empty `premise`
  follows the second failure before the next failure, `asdd check` shall WARN `PREMISE-01` and shall not FAIL.
- **REQ-003.** When such a premise checkpoint follows the second failure (before any third failure), `asdd check`
  shall not report `PREMISE-01` for that feature and signature.
- **REQ-004.** `asdd check` shall not report `PREMISE-01` for slices that are not `in_progress` (DONE, PARKED,
  ABANDONED), nor for failures whose signatures or features differ.
- **REQ-005.** The session validator shall accept `failure_signature`, `premise`, and `removes` as non-empty strings
  and FAIL when one is present but empty or not a string.

## Design

One validator, `validators/premise.mjs`, reads each slice's sessions in file order (`readSessions`), skips slices
whose `deriveStatus` is not `in_progress`, groups sessions with `feature_id` + `failure_signature`, and for each
group with ≥2 entries looks for a premise `checkpoint` between the second and the third failure (or the end of the
log). Wired into `check-invariants.mjs` after `validateIntentEvidence`.
