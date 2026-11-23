# mutation-testing — Lessons (Knowledge phase)

- **The QA gate needed four runs, and every redirect was a real gap.** The tests passed from the start; 8, then 3,
  then 1 hand mutant survived them. A passing suite plus REQ mentions (CONVERGE-02, DRIFT-04) said "covered"; only
  mutating the code showed what the tests did not pin. This slice is its own argument for `QG-SPEC-11`.
- **Hand mutants are a usable stand-in** where no mutation tool is bound (the kit itself): a short battery of string
  edits on a scratchpad copy, run against the focused test file, found one real bug (UNCOV-001: no usage line).
- **Validation caught a self-contradiction** (CON-001: "record the equivalent mutant" vs an exit-code contract). Third
  occurrence of that shape → SP-013 (Spec agent names the existing contract a MUST requirement must agree with).
- **Budget pressure is real**: one new core skill row cost ~400 always-loaded bytes; the REQ-013 cap was met by
  folding a restating bullet list, not by raising the cap.
