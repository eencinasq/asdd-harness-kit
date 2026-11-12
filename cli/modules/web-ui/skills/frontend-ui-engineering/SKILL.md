---
name: frontend-ui-engineering
description: >-
  Builds and changes components, pages, and layouts on the project's design system, accessible to WCAG 2.1 AA, with
  loading, empty, and error states. Use when building or modifying UI. Do NOT use for inspecting a running page — use
  browser-testing-with-devtools; or for testing component logic — use test-driven-development.
metadata:
  tier: leaf
---

# Frontend UI Engineering

UI that looks like a design-aware engineer built it: the project's design system, accessibility, clear interaction
states — not a generic "AI aesthetic". Component architecture, state choices, design-system adherence, accessibility
principles, loading states: [`references/ui-craft.md`](./references/ui-craft.md). Breakpoints and mobile-first layout:
[`references/responsive-web-development.md`](./references/responsive-web-development.md). WCAG 2.1 AA checklist and ARIA
patterns: [`references/accessibility-checklist.md`](./references/accessibility-checklist.md).

**Operational boundary:** the component, page, style, and story files of the change (and their tests). It never edits
design tokens or the design system itself unless the task is about them.

## Input / Output Contract

- **Inputs:** `ui_change` (`string`, the component or page to build or change, required); `design` (`path` or URL, a
  mock or `.harness/steering/design-system.md`, optional); `req_ids` (`string[]`, `^REQ-\d{3}$`, in an ASDD slice).
- **Outputs:** `components` (`source files`, colocated by component: component, test, story when Storybook is used);
  `states` (`render branches`, each data-driven container renders loading, empty, and error).

## Execution Protocol

### Step 1: Find the design system

- **Action:** locate the project's primitives, tokens (color, spacing, radius, type), breakpoints, and state library
  (`design-system.md` when the web-ui module binding is filled, then the repository).
- **Target:** the repository.
- **Assertion:** tokens and breakpoints are named with their files; no new one-off value is planned.

### Step 2: Build

- **Action:** compose from existing primitives; separate data containers from presentation; choose the simplest state
  that works; for layout, follow the responsive reference and the project's breakpoints.
- **Target:** the component files.
- **Assertion:** the project's build or type check exits 0; no arbitrary off-scale pixel value in the diff.

### Step 3: Make it accessible and complete

- **Action:** native interactive elements, labels for icon-only controls, visible focus, focus trapped in dialogs and
  restored on close, meaning never by color alone; loading (skeleton with `aria-busy`), empty, and error states.
- **Target:** the same files.
- **Assertion:** the project's accessibility lint or test (for example `eslint-plugin-jsx-a11y`, `axe`) reports 0
  violations for the changed components.

## Verification Gate

1. The project's lint, type check, and test commands (from `tech.md`) exit 0.
2. The accessibility check of Step 3 reports 0 violations for the changed components.
3. Each changed container has loading, empty, and error branches (`grep` the component for the three states).
4. When layout changed: the responsive reference checklist holds.
5. Negative check: `git diff --name-only` lists only UI files of the change and their tests.

## Escalation Gate

HALT when the design asks for a value the design system does not have (a new token is a design decision), when the
mock contradicts accessibility (contrast, focus), or when the change needs a new state library. Escalate as Context →
Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `browser-testing-with-devtools`:** to verify the rendered result in a live browser; passes `components`.
- **handoff → `test-driven-development`:** for component logic and state transitions; passes `ui_change`.
