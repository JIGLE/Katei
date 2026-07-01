# Katei — Frontend design guidelines (always-on)

This file is loaded into context on every turn for this repo. It consolidates the
design constraints from Anthropic's official **frontend-design** plugin and the
**Impeccable** design system so all UI work here is bespoke and free of "AI slop".

> Provenance & honest note: this environment has no plugin directory and cannot
> hot-install/activate a Claude Code plugin at runtime, and the git proxy blocks
> cloning non-`jigle/katei` repos. So the plugin/Impeccable rules are captured
> here instead — this file is the active mechanism. Sources:
> - frontend-design: `anthropics/claude-code` → `plugins/frontend-design/skills/frontend-design/SKILL.md`
> - Impeccable: `github.com/pbakaus/impeccable` (Apache-2.0, Paul Bakaus)

## 0. Katei-specific reconciliation (read first)

Katei already has a deliberate, coherent design system in **`BRAND.md`**: a Japandi
dark palette (`zinc` neutrals as CSS-variable tokens, light/dark themes), semantic
accents (emerald = money/positive, rose = critical, amber = time, teal = savings),
and Inter typography. That IS the bespoke choice for this product.

Therefore: apply the principles below **in service of the existing brand**, not to
restyle for novelty. Do not swap the typeface or palette per screen, and do not
churn the token system. "Bespoke" here means precision, restraint, and meaning —
consistent with `BRAND.md`. When a rule below conflicts with `BRAND.md`, `BRAND.md`
wins and the conflict is noted rather than silently overridden. (Example: the
generic "never use Inter" rule does not apply — Inter is Katei's deliberate,
system-wide choice; spend boldness elsewhere.)

## 1. Core constraints I will follow

1. **Ground in subject.** Before designing a screen, state its single job, its
   audience (a household managing shared obligations), and the one thing it must
   make effortless. Derive layout from that, not from a template.
2. **Structure encodes meaning.** Numbering, dividers, labels, and cards appear
   only when they truthfully represent hierarchy. Numbered sequences (01/02) are
   for real sequences, not decoration.
3. **Typography with intent.** One deliberate scale (weights/tracking/leading),
   used consistently. Light weights + wide tracking for eyebrows/wordmark, as in
   the current app. Tabular-nums for money.
4. **Deliberate motion.** Animate with purpose (load, reveal, state change),
   honor `prefers-reduced-motion`, and prefer *less* — superfluous animation reads
   as AI-generated. No bounce/elastic easing.
5. **Spend boldness in one place.** One focal moment per view; everything else
   recedes. Remove decoration that doesn't serve the screen's job.
6. **Complexity matches vision.** Katei is calm/minimal, so precision in spacing,
   alignment, and type matters more than embellishment.

## 2. Anti-slop don'ts

- Don't use gray text on colored backgrounds (contrast + intent).
- Don't use pure black/pure gray — always tint (Katei tokens already do this).
- Don't wrap everything in cards, and never nest cards inside cards.
- Don't use bounce/elastic easing; use calm cubic-bezier eases.
- Don't reach for the generic AI defaults: warm-cream + serif + terracotta;
  near-black + acid-green/vermilion; broadsheet hairline layouts. Avoid
  predictable purple gradients and cookie-cutter components.
- Don't invent new accent colors — reuse the semantic palette in `BRAND.md`.

## 3. Process (two-pass, before non-trivial UI)

1. **Brainstorm** a compact token plan for the change: which existing tokens/accents,
   the layout concept (sketch in words/ASCII), and the one signature element.
2. **Critique before building.** If any part reads like the generic default I'd
   produce for any similar screen — rather than a choice made for *this* screen and
   *this* brand — revise it first.
3. **Build & refine** to a quality floor without announcing it: responsive to
   mobile (test ~390px), visible keyboard focus, reduced-motion respected,
   light+dark both checked.

## 4. Writing / microcopy

- Name things by what the user controls, not system architecture. Active voice
  ("Mark as paid", not "Submit"). Consistent action names across a flow
  (button "Save" → toast "Saved"). Sentence case, no filler.
- Errors say what happened and how to fix it; empty states invite the next action.
- All user-facing strings go through i18n (`react-i18next`), added to all six catalogs.

## 5. Impeccable command taxonomy (reference)

The upstream Impeccable set (invoked conceptually here since the plugin isn't
installed): `craft, init, document, extract, shape, critique, audit, polish,
bolder, quieter, distill, harden, onboard, animate, colorize, typeset, layout,
delight, overdrive, clarify, adapt, optimize, live`. Treat `critique`/`audit`/
`polish` as the default loop on any UI change.
