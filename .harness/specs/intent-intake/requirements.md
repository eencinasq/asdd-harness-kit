# intent-intake — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** `asdd intake --from <file|-> --ref <url>` shall reject an item that does not follow the canonical Intent format and name the missing fields.
- **REQ-002.** For a valid item it shall write `.harness/specs/<slice>/intent.md`, initialize the slice in the suggested mode (`hotfix`, `lite`, or `full`), and record the tracker URL as the slice source; it shall not use the network.
- **REQ-003.** At intake, every grounding evidence ref that no longer resolves (missing REQ, slice, or path) shall be reported, and the intake shall stop unless `--accept-stale` is given.
- **REQ-004.** `asdd check` shall report, through an `intent-evidence` validator, intents whose grounding refs do not resolve (WARN by default; FAIL when the binding says so).
- **REQ-005.** `external-trackers` shall document the intake flow and hand off to the slice's first phase.
