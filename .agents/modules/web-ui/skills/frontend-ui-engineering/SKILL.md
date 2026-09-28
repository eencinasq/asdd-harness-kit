---
name: frontend-ui-engineering
description: >-
  Builds production-quality, accessible user-facing UIs with design-system craft
  (not AI-generic aesthetics). Use when building or modifying interfaces, pages,
  or components; implementing layouts; meeting WCAG; managing UI state; or when
  output must look production-quality. Loads responsive and accessibility
  references as complementary progressive disclosure.
---

# Frontend UI Engineering

## Overview

Ship UI that looks like a design-aware engineer built it: real design-system adherence, accessibility, clear interaction patterns — not a generic “AI aesthetic.”

**Progressive disclosure (complementary, no overlapping SoTs):**

| Load | Owns |
|------|------|
| This `SKILL.md` | Component architecture, state, anti-AI craft, semantic type/color principles, loading/empty/error UX, craft verification |
| [`references/responsive-web-development.md`](./references/responsive-web-development.md) | Breakpoints strategy, mobile-first layout, containers, touch targets, type *scaling*, media/tables/forms, responsive checklist (generic — any project) |
| [`references/accessibility-checklist.md`](./references/accessibility-checklist.md) | WCAG 2.1 AA checklists, ARIA patterns, a11y tooling |

## When to Use

- Building or modifying user-facing components or pages
- Layout / responsive work (then **also Read** the responsive reference)
- Interactivity, state, loading/empty/error states
- Accessibility work (then **also Read** the accessibility checklist)

## Workflow

1. Prefer the project’s design system / existing primitives over new one-offs.
2. If layout or breakpoints: **Read** `references/responsive-web-development.md`, then honor **this repo’s** configured screens/tokens if present.
3. If interactive UI: apply a11y principles below; for the full checklist **Read** `references/accessibility-checklist.md`.
4. Build; run Verification here **plus** the responsive checklist when layout changed.

## Component Architecture

### File structure

Colocate by component:

```
src/components/
  TaskList/
    TaskList.tsx
    TaskList.test.tsx
    TaskList.stories.tsx   # if Storybook
    use-task-list.ts       # if complex state
    types.ts
```

### Patterns

**Composition over configuration** — nest slots (`Card` / `CardHeader` / `CardBody`) instead of prop-soup variants.

**One job per component** — presentational pieces stay small; split past ~200 lines.

**Separate data from presentation** — container handles fetch/loading/error/empty; child renders data only.

## State Management

Simplest approach that works:

```
Local state (useState)        → Component UI state
Lifted state                  → 2–3 siblings
Context                       → Theme, auth, locale (read-heavy)
URL state (searchParams)      → Filters, pagination, shareable UI
Server state (React Query/SWR)→ Remote data
Global store                  → Complex shared client state
```

Avoid prop drilling deeper than ~3 unused hops — context or restructure.

## Design System Adherence

### Avoid the AI aesthetic

| AI default | Production quality |
|---|---|
| Purple/indigo everything | Project palette / tokens |
| Excessive gradients | Flat or design-system-approved subtle gradient |
| `rounded-2xl` everywhere | Radius scale from the design system |
| Generic hero / stock card grids | Content-first, purpose-driven layout |
| Lorem / fake copy | Realistic content lengths |
| Uniform oversized padding | Spacing scale |
| Heavy multi-layer shadows | Subtle or design-system shadows only |

### Spacing

Use the project spacing scale (typically 0.25rem steps). No one-off `13px` / `2.3rem`.

### Typography (semantics)

```
h1 → Page title (one per page)
h2 → Section
h3 → Subsection
body → Default
small → Secondary
```

Do not skip heading levels. Do not style non-headings as headings.

**Responsive type sizes** → responsive reference.

### Color (principles)

- Semantic tokens — discover names from the project; layout usage → responsive reference
- Contrast: 4.5:1 normal text, 3:1 large (details → accessibility checklist)
- Never color alone for meaning

## Accessibility (principles)

Target **WCAG 2.1 AA**. Full checklist → `references/accessibility-checklist.md`.

- Prefer native interactive elements (`button`, `a`, `input`) over `div` + role
- Icon-only controls need `aria-label`
- Visible focus; trap focus in dialogs; restore focus on close
- Empty and error states must be announced / meaningful (not blank screens)

**Touch targets and responsive body type size** → responsive reference.

## Loading and transitions

- Prefer skeletons (`aria-busy`) over spinners for content regions
- Optimistic UI when mutations are safe to roll back
- Always define loading, error, and empty paths in containers

## Common rationalizations

| Rationalization | Reality |
|---|---|
| “A11y later” | Quality bar and often legal requirement |
| “Responsive later” | Retrofitting costs more; use the responsive reference from the start |
| “Prototype = unstyled” | Use design-system defaults |
| “AI look is fine for now” | Use project tokens and craft rules from day one |

## Red flags

- Components > ~200 lines without split
- Inline styles / arbitrary off-scale pixels
- Missing loading / error / empty states
- No keyboard path
- Color-only state
- Purple gradients / stock card grids / ignoring project breakpoints

## Verification

After UI work:

- [ ] Renders without console errors
- [ ] Interactive elements keyboard-reachable; focus visible
- [ ] Screen reader structure makes sense (spot-check)
- [ ] Loading, error, empty handled
- [ ] Design-system spacing/colors/type (no AI-generic look)
- [ ] **If layout changed:** completed responsive reference checklist
- [ ] **If interactive:** skimmed accessibility checklist essentials

## See also

- Responsive: `references/responsive-web-development.md`
- A11y: `references/accessibility-checklist.md`
