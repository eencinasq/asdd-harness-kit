> Test code is reviewed for whether it actually protects the behaviour it claims to test. Favor precision: a test that is merely written differently from how you would write it is not a finding.

#### Assertions That Cannot Fail
- Tests with no assertion, or whose only assertion is on a value the test itself just set (asserting the mock returns what it was told to return)
- Assertions inside callbacks, `then` handlers or loops that may never run, so the test passes when the code under test does nothing
- Async tests that do not `await` (or return) the promise they assert on, so failures surface after the test has already passed
- Snapshot assertions added for logic that a targeted assertion would describe; snapshots updated wholesale in the same PR that changes the behaviour
- Do not report a test that asserts through a helper whose body you have not read (confirm it with `pr_review_read_file`)

#### Focused, Skipped or Disabled Tests
- `.only`, `fit`, `fdescribe`, `@pytest.mark.only`-style focus left in, which silently skips the rest of the suite
- New `skip`, `xit`, `@Disabled`, `t.Skip()` or commented-out tests without a reason or a linked issue
- Assertions deleted or loosened in the same PR that changes the code they covered

#### Flakiness and Isolation
- Fixed sleeps (`sleep`, `setTimeout`, `waitForTimeout`, `time.sleep`) used to wait for asynchronous work instead of awaiting the condition
- Dependence on wall-clock time, time zones, random values or test execution order without fixing them (fake timers, seeded random, explicit setup)
- Shared mutable state (module globals, singletons, databases, files) modified by one test and read by another without reset
- Real network, filesystem or external services in unit tests where the rest of the suite uses fakes

#### Coverage of the Change
- Changed branches or error paths in the production code of this PR with no test exercising them, when the PR adds tests for the happy path only
- Tests that mock the very unit under test, so the real code never runs
- Boundary values the production code handles specially (empty, zero, null, maximum) that the new tests skip
- Do not report missing tests for code the PR does not change

#### Test Hygiene
- Test names that contradict what the test asserts (named "rejects …" but asserts success)
- Copy-pasted test bodies where only one case was updated, leaving assertions on the wrong inputs
- Credentials, tokens or production URLs hard-coded in tests or fixtures
