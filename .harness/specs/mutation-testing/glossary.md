# mutation-testing — Glossary

- **Mutant:** a copy of the code with one small change (an operator flipped, a return replaced) made by a mutation tool.
- **Surviving mutant:** a mutant the test suite does not fail on: the tests would not notice that defect.
- **Equivalent mutant:** a mutant that does not change observable behavior; it cannot be killed and is recorded, with
  its reason, instead of tested.
- **Mutation command:** the `quality-gates.project.md` binding that runs the project's mutation tool on `{files}` and
  exits non-zero when a mutant survives.
