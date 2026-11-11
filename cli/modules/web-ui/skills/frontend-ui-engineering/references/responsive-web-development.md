# Responsive Web Development

Generic reference for **responsive layout**. Use with any web frontend (React, Vue, Svelte, plain HTML/CSS, Tailwind or CSS modules).

**Complements (do not duplicate):**

| Concern | Where |
|---------|--------|
| Component architecture, state, anti-AI craft, loading/empty UX | Parent [`../SKILL.md`](../SKILL.md) |
| WCAG checklists, ARIA patterns, a11y tooling | [`accessibility-checklist.md`](./accessibility-checklist.md) |

This file owns **breakpoints strategy, mobile-first layout, fluid containers, touch targets, type scaling, media, tables/forms at small viewports, and responsive verification**.

## Discover project constraints first

Before applying defaults:

1. Read the project’s theme / design-token source (CSS variables, Tailwind theme, design tokens package).
2. Read configured breakpoints (e.g. `tailwind.config.*` `screens`, CSS `@custom-media`, MUI breakpoints).
3. Prefer **project screens and tokens** over the example tables below.

If the project has no documented screens, use the **recommended defaults** in the next section and document the choice.

## Breakpoints (recommended defaults)

Mobile-first min-width scale. Adjust names to match the project; keep the *progression* (phone → tablet → laptop → desktop).

| Token (example) | Min-width | Target |
|-----------------|-----------|--------|
| (base) | 0 | Mobile portrait |
| `xs` | 480px | Large phone / landscape |
| `sm` | 640px–768px | Small tablet / large phone |
| `md` | 768px–834px | Tablet |
| `lg` | 1024px | Laptop |
| `xl` | 1280px–1440px | Desktop |
| `2xl` | 1536px–1920px | Large desktop |

**Rules:**

- Do not mix two competing breakpoint systems in one UI surface.
- Do not invent one-off media queries for every component when a shared scale exists.
- **Verify at least:** ~375, ~480, ~768, ~1024, ~1440 (plus landscape when navigation collapses).

Tailwind example (only if the project uses Tailwind):

```tsx
<div className="px-4 sm:px-6 lg:px-8">
  <h1 className="text-2xl sm:text-3xl lg:text-4xl">Title</h1>
</div>
```

CSS equivalent:

```css
.section { padding-inline: 1rem; }
@media (min-width: 640px) { .section { padding-inline: 1.5rem; } }
@media (min-width: 1024px) { .section { padding-inline: 2rem; } }
```

## Design tokens (responsive usage)

- Use **semantic** color/spacing tokens from the project (`--color-primary`, `bg-primary`, theme keys) — never scatter raw hex/`rgb()` in layout code unless the design system has no tokens yet.
- This reference does not define a palette; token *craft* and anti-AI aesthetics live in the parent skill.

## Mobile-first

Base styles = smallest viewport; layer enhancements at larger breakpoints. Never style desktop first and “shrink down.”

```tsx
// Good: expand upward
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Bad: desktop default then fight it on small screens
className="grid grid-cols-3 max-md:grid-cols-1"
```

## Layout patterns

**Stack → multi-column**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Sidebar**

```tsx
<div className="flex flex-col lg:flex-row gap-6">
  <aside className="w-full lg:w-64 shrink-0" />
  <main className="min-w-0 flex-1" />
</div>
```

Use `min-w-0` (or equivalent) on flex children so content can shrink without overflow.

## Container

- Prefer `width: 100%` + `max-width` + horizontal padding over fixed pixel page widths.
- Example: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (Tailwind) or CSS `max-width` + `padding-inline`.

```tsx
// Avoid
<div className="w-[1200px]">
```

## Navigation

Common pattern (adapt to the project’s nav component):

- **Small:** menu control visible; primary links in a panel/drawer
- **Large:** horizontal links; menu control hidden

Toggle visibility with the project’s `lg` (or equivalent) breakpoint — do not hardcode a different collapse point per page unless product requires it.

## Typography scaling

Semantic heading hierarchy → parent skill. Here: **size steps across viewports**.

- Scale display titles up at `sm` / `lg`; keep body readable.
- Body text ≥ **16px** from tablet-ish breakpoints upward when possible.
- Do not use the smallest type token as the only body size on mobile and desktop.

## Touch targets

Interactive controls ≥ **44×44px** CSS pixels on touch-first layouts (WCAG 2.5.5 / platform HIG alignment).

```tsx
<button className="min-h-[44px] min-w-[44px] px-4 py-2">Submit</button>
```

## Images and media

- Prefer responsive images: `srcset` / `sizes`, or the framework image helper (e.g. Next.js `Image`, Nuxt `NuxtImg`).
- Set intrinsic or aspect ratio to reduce CLS; use `width`/`height` or `aspect-ratio`.
- Lazy-load below-the-fold media; eager-load LCP candidates.
- `alt` text rules → accessibility checklist.

```tsx
// Framework-agnostic idea
<img
  src="/photo.jpg"
  alt="Description"
  width={800}
  height={600}
  loading="lazy"
  decoding="async"
  style={{ width: '100%', height: 'auto' }}
/>
```

## Responsive tables

Pick one strategy per table:

1. **Horizontal scroll** wrapper (`overflow-x: auto`) with `min-width` on the table  
2. **Card list** on small viewports; table from `lg` up  

Never leave a wide table unusable on a 375px screen.

## Forms

- Fields default to full width on small screens
- Multi-column field groups only from `md`/`lg` up
- Primary submit: full width on mobile, auto width on larger screens when it fits the design
- Input text ≥ 16px where possible (reduces iOS zoom-on-focus)

## Internationalization (when the project has i18n)

- Route all user-visible strings through the project i18n layer
- Allow for longer translated strings (flexible layouts, avoid fixed-width labels)
- Do not hardcode copy in components when an i18n system exists

## Performance (layout-related)

- Defer heavy, desktop-only widgets when the viewport will not use them
- Code-split large client-only charts/editors
- Avoid layout thrash from competing fixed and fluid widths

## Common mistakes

1. Fixed page widths without max-width + horizontal padding  
2. Raw colors instead of design tokens  
3. Ignoring the project’s configured breakpoints  
4. Testing only one desktop width  
5. Tiny body text on all breakpoints  
6. Tables and nav that fail under ~400px  

## Verification checklist (responsive only)

- [ ] Checked ~375, ~480, ~768, ~1024, ~1440 (and landscape if nav collapses)
- [ ] Mobile-first cascade (no desktop-first overrides fighting the base)
- [ ] Touch targets ≥ 44×44px where relevant
- [ ] Body text readable (≥ 16px on larger small-device breakpoints when possible)
- [ ] Images/media do not overflow; aspect ratio / sizes considered
- [ ] Navigation usable at collapsed and expanded breakpoints
- [ ] Tables have a small-viewport strategy
- [ ] Semantic/design tokens used for colors (no ad-hoc hex sprawl)
- [ ] If i18n exists: no new hardcoded user-facing strings

For keyboard/ARIA/contrast, use [`accessibility-checklist.md`](./accessibility-checklist.md).
