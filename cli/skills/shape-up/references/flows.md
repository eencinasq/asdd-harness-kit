# Shaping flows — coaching detail

Loaded by the `shape-up` skill in its Step 2, for the flow the user picked. The skill owns the protocol, outputs, gates,
and handoffs; this file holds the questions and challenges for each flow.

## Product Mode Check

Before starting the shaping workflow, determine the context:

**Product Mode**

Which mode are you in?

A. Established product
   - Core features, existing users
   - Fixed time, variable scope (full rigor)
   - Circuit breaker applies

B. New product / exploration
   - Validating concepts, finding fit
   - Looser constraints, faster iteration
   - Goal: learn, not ship

**Mode affects rigor:**

| Aspect | Established | New Product |
|--------|-------------|-------------|
| Appetite | Strict (1-2 weeks or 6 weeks) | Flexible ("a few days to explore") |
| Rabbit holes | Must be identified and patched | Flag but accept more unknowns |
| No-gos | Explicit and enforced | Directional, may evolve |
| Output | Pitch ready for betting table | Pitch as working document |

## Flow 1: Shape New Work

### Step 1: Set Boundaries

**Ask about appetite first:**

How much time is this problem worth?

- Small batch (1-2 weeks)
   - Well-understood, limited scope
   - Quick win or focused fix

- Big batch (6 weeks)
   - New capability, more unknowns
   - Meaningful user value

What's your appetite?

**Then dig into the problem:**

Questions to ask:
1. **What's the raw idea?** (The surface-level request)
2. **What's the actual friction?** (Dig deeper - why does this matter?)
3. **Who experiences this?** (Specific users/personas)
4. **What do they do today?** (Current workaround or pain)

**Challenge weak problem definitions:**
- "Customers want X" → "What's broken that makes them want X?"
- "We need to improve Y" → "What specifically is wrong with Y?"
- "Add a feature for Z" → "What friction does Z solve?"

**Capture:**
- Appetite: [Small batch / Big batch]
- Problem: [Specific friction, who, when]
- Baseline: [What users do today]

### Step 2: Find the Elements

**Guide through solution sketching:**

Now let's sketch the solution. Keep it rough.

Questions:
- Where does this fit in the existing product?
- How do users access it?
- What are the main elements/components?
- How do they connect?

Would you like to:
1. Breadboard it (workflow/screens)
2. Fat marker sketch it (visual layout)
3. Just describe it (I'll help structure)

**If breadboarding:**
Help structure as: Places → Affordances → Connections

**If sketching:**
Remind: Keep it rough. Thick lines. No details.

**Challenge over-specification:**
- "Here's my wireframe..." → "Let's step back. What are the key elements?"
- Detailed UI → "This is too concrete. What decisions are we making?"

**Capture:**
- Solution sketch (breadboard or fat marker)
- Key elements and how they connect
- Main user flows

### Step 3: Address Risks

**Walk through de-risking:**

Let's find the rabbit holes before they find you.

Walk me through the solution step by step:
- What happens first?
- Then what?
- What could go wrong?
- What's the riskiest part technically?

**Questions to probe:**
1. Does this require unprecedented technical work?
2. Are there parts assumed to fit without validation?
3. Are hard decisions being deferred to the team?
4. What edge cases could blow up scope?

**For each risk identified:**
- Can we patch it now? (Make a decision/trade-off)
- Can we cut it? (Move to no-gos)
- Must we flag it? (Add to rabbit holes section)

**Challenge "it'll be fine" thinking:**
- "The team will figure it out" → "What specifically will they figure out?"
- "It's probably straightforward" → "Walk me through the implementation"

**Capture:**
- Rabbit holes (risks to flag)
- Patches made (trade-offs decided)
- No-gos (explicitly out of scope)

### Step 4: Write the Pitch

**Compile the 5 ingredients:**

Let me compile everything into a pitch.

The 5 ingredients:
1. Problem - Why this matters
2. Appetite - How much time it's worth
3. Solution - What we'll build (rough)
4. Rabbit Holes - Known risks
5. No-Gos - What we're NOT doing

**Generate pitch using template from:** [`pitch-template.md`](./pitch-template.md)

**Output the pitch, then ask:**

**Pitch Ready**

[Generated pitch document]

What's next?

- Copy to your pitch doc
- Bring it to the betting table
- Review and refine further
- Shape another feature

## Flow 2: Review Existing Pitch

**When user provides a pitch to review:**

**Pitch Review — critique-first / no-glazing**

Start with the **strongest reason this pitch could fail the appetite**. Prefer a fresh-context
(Goldfish) pass: quote the pitch file only; ignore the drafting chat. Empty praise is not a verdict.

Checking:
- Problem - Is the friction specific and real?
- Appetite - Is time budget explicit?
- Solution - Rough but solved?
- Rabbit Holes - Are risks identified?
- No-Gos - Are boundaries explicit?

**Review criteria:**

| Element | Pass | Fail |
|---------|------|------|
| Problem | Specific friction, named users, evidence | Vague "customers want X" |
| Appetite | Explicit time budget (1-2 weeks or 6 weeks) | No time constraint or "ASAP" |
| Solution | Breadboard/sketch, elements connected | Wireframes OR just words |
| Rabbit Holes | Technical risks flagged with mitigation | "Should be straightforward" |
| No-Gos | Explicit exclusions listed | Nothing marked as out of scope |

The verdict table, the counter-case, and the human decision are Step 4 of the skill (`SKILL.md`).

## Flow 3: Quick Pitch

**For experienced users who know what they want:**

Skip the coaching, just ask the minimum questions:

1. What's the problem? (1-2 sentences)
2. What's the appetite? (Small batch or big batch)
3. What's the solution? (Key elements)
4. Any known risks?
5. What's explicitly out?

**Generate pitch immediately** using [`pitch-template.md`](./pitch-template.md)

## Flow 4: Explore First

**When the idea isn't ready to shape:**

Write a **concepts brief** first ([`concepts-brief-template.md`](./concepts-brief-template.md)) to
`docs/pitches/<pitch-id>/concepts_brief.md`. Optional brownfield context:
[`brownfield-bootstrap.md`](./brownfield-bootstrap.md). Do not set `ready_for_bet` from a brief alone.

**Readiness gate** (human `decided_by` on each row):

| Question | Must be… |
|----------|----------|
| Specific friction named? | yes, or deferred with who/when to learn |
| Who has it? | named actor, or deferred |
| Evidence it matters? | cited, "none yet", or deferred |
| Learn vs ship? | explicit |

- `brief_status: ready_to_shape` → continue to Flow 1 or 3 (formal pitch).
- `brief_status: parked` → stop; gather evidence; do not invent a pitch.
- `brief_status: exploring` → keep asking; critique-first on the weakest open question.

Signs it's still too early:
- Can't articulate specific friction
- Don't know who has the problem
- Solution is completely unclear
- No evidence it matters

Would you like to:
1. Dig deeper into the problem now (update the brief)
2. Plan discovery work first (`parked`)
3. Shape anyway (accept higher risk — record deferrals on the readiness gate, then Flow 1)

## Flow 5: Convert or Hand Off a Pitch

Use this flow only after a canonical pitch exists or after creating one through Flow 1 or Flow 3. Inside a repository
with `.harness/`, the `scope_map` mode belongs to the `product-delivery` skill (it owns the scope map there); here it
is for a pitch leaving for another workflow. Read [`conversions.md`](./conversions.md) before producing any derived artifact.

### Select the smallest output

| User intent | Output mode |
|---|---|
| Share with a team or decision maker | `share` |
| Split the pitch into independently finishable scopes | `scope_map` |
| Send to another discovery workflow | `discovery` |
| Prepare a complete downstream handoff | `bundle` |

Shape Up has no epics, user stories, story points, sprints, or backlog. Never convert a pitch into those artifacts.

Do not generate every format automatically. Use the smallest format that satisfies the request. If the request is ambiguous, return the canonical pitch and list the available conversion modes.

### Conversion protocol

1. Preserve the canonical pitch as the source artifact.
2. Assign or preserve a stable `pitch_id` and `scope_id` values.
3. Read the conversion reference for the selected mode.
4. Carry forward appetite, betting status, problem, desired outcome, boundaries, scopes, risks, and open questions.
5. Mark derived or unsupported details as `DERIVED`, `PROPOSED`, or `PENDING_DEFINITION`.
6. Add `source_pitch_id` and `source_scope_id` to every derived artifact.
7. Preserve the betting state; a converted artifact is not automatically bet work.
8. Report unresolved questions and any conversion loss explicitly.

### Bundle handoff

Use `bundle` when the next workflow needs more than a single ticket. It produces:

- the canonical pitch;
- a pitch manifest with identity, status, appetite, and source;
- betting decision, if available;
- scope map;
- risk and rabbit-hole notes;
- a conversion index listing derived artifacts and their provenance.

The bundle is a portable handoff. It does not assume a repository layout, project framework, or ticket provider.

### Conversion quality gate

Before returning a conversion, verify:

- the canonical pitch remains unchanged;
- the derived artifact links to the source pitch and scope;
- appetite is represented as a time boundary, not an estimate;
- must-haves, nice-to-haves, and no-gos are preserved;
- no new requirement or technical fact was invented;
- the selected format matches the requested work size;
- unresolved decisions remain visible;
- the betting state is preserved.

If the conversion changes the problem, outcome, appetite, or boundaries, return `RE-SHAPING_REQUIRED` instead of silently rewriting the pitch.

## Common Shaping Mistakes to Challenge

| Mistake | Challenge |
|---------|-----------|
| "Customers want X" | "What friction makes them want X?" |
| No appetite stated | "How much time is this worth? Small or big batch?" |
| Detailed wireframes | "This is too concrete. What are the key elements?" |
| "Team will figure it out" | "What specifically will they figure out?" |
| No no-gos | "What are you explicitly NOT building?" |
| "Should be straightforward" | "Walk me through the implementation" |

---
