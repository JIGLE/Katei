# Katei 家庭 — Brand & Design Identity

> The single source of truth for how Katei looks, feels, and speaks.
> New UI should reference this file. When a design decision isn't covered here,
> extend this document rather than improvising in a component.

---

## 1. Name & meaning

**Katei** (家庭) is Japanese for *household / home / family* — not the building, but
the unit of people and the life they run together. The app is a **household
obligation awareness system**: it makes the shared, easily-forgotten duties of a
home (bills, deadlines, renewals, who-owns-what) calmly visible.

The logo is the wordmark **家庭**, optionally followed by `· {name}` for the
signed-in user. It is never distorted, recolored, or boxed. Set in the regular
UI typeface at a light weight.

---

## 2. Positioning & feeling

Katei is a **quiet control tower**, not a productivity taskmaster. It should feel
like a well-kept entryway shelf where the important things live: uncluttered,
warm, intentional. The opposite of a noisy notification-spam to-do app.

Three words: **calm · deliberate · trustworthy**.

---

## 3. Design philosophy — Japandi

Japandi = Japanese minimalism (ma / negative space, restraint, natural calm) +
Scandinavian function (honest materials, soft warmth, everyday usability).

Principles, in priority order:

1. **Space is a feature.** Generous padding and breathing room beat density.
   When in doubt, remove an element rather than shrink it.
2. **One accent at a time.** Color is meaning, never decoration (see §5).
3. **Soft, not flat; calm, not cold.** Rounded corners, gentle borders, low
   contrast surfaces. Avoid hard shadows and pure-black/pure-white.
4. **Light weight, light touch.** Thin typography, hairline borders, subtle
   transitions. Nothing shouts.
5. **Mobile-first, thumb-first.** Designed for a phone in one hand: bottom nav,
   bottom-sheet modals, large tap targets.

---

## 4. Surfaces & elevation

A dark, layered neutral palette built on Tailwind `zinc`. Elevation is conveyed
by getting *lighter*, plus a hairline border — never by drop shadows.

| Layer | Token | Use |
|---|---|---|
| App background | `bg-zinc-950` | The page / root canvas |
| Card / panel | `bg-zinc-900` | Raised content blocks, list containers |
| Hairline border | `border-zinc-800/60` | Card edges, dividers, header rules |
| Input well | `bg-zinc-950` inside a `border-zinc-800` field | Form inputs sit *below* cards |
| Hover lift | `hover:border-zinc-700` | Interactive border brighten on hover |

Corner radius: cards/sheets `rounded-2xl`, controls/inputs `rounded-xl`, pills
and avatars `rounded-full`. Never square corners on a surface.

---

## 5. Color = meaning

Accents are **semantic**. A color may only appear when it carries its meaning;
decorative color is forbidden.

| Accent | Token | Meaning | Where |
|---|---|---|---|
| 🟡 Amber | `amber-500` | **Time** — appointments, upcoming, "this week" | Appointment events, time stats |
| 🟢 Emerald | `emerald-500` | **Money** — flows, costs, outflow | Money Flow, payment events, amounts |
| 🔴 Rose | `rose-500` | **Critical** — deadlines, overdue, destructive | Deadlines, overdue items, delete actions, errors |
| ⚪ Zinc | `zinc-100 → zinc-600` | **Neutral** — text, structure, "later" | Everything non-semantic |

Money sub-types (budgeting) stay within the money family so green still reads as
"money": **income** = `emerald`, **savings** = `teal`, **expense** = neutral
`zinc`. Net is `emerald` when ≥ 0, `rose` when negative.

Event-type → accent mapping (authoritative):

```
deadline    → rose      (a hard date you can miss)
payment     → emerald   (money leaving)
appointment → amber     (a time to be somewhere)
```

Accent usage patterns:
- **Dot** (status): `bg-{accent}-500`, `h-2 w-2 rounded-full`
- **Pill** (label): `bg-{accent}-500/10 text-{accent}-500 rounded-full px-2 py-0.5 text-xs`
- **Emphasis pill** (overdue): bump fill to `/20` and text to `-400`
- **De-emphasized** ("later"/done): drop to `zinc` (`bg-zinc-800 text-zinc-500`)

Text hierarchy: primary `text-zinc-100`, secondary `text-zinc-400`, tertiary /
captions `text-zinc-500`, disabled / faint `text-zinc-600`.

---

## 6. Typography

Typeface: **Inter** (loaded from Google Fonts), with a system-ui fallback stack.
Weights used: **300 / 400 / 500 / 600** only.

| Role | Classes |
|---|---|
| Page title | `text-2xl font-light text-zinc-100` |
| Section eyebrow | `text-xs uppercase tracking-widest text-zinc-500` |
| Card heading | `text-xs font-medium uppercase tracking-widest text-zinc-500` |
| Body | `text-sm text-zinc-200` |
| Stat figure | `text-xl font-light` (in its semantic accent) |
| Caption / meta | `text-xs text-zinc-500` |

Rules: titles are **light** (300), not bold. Labels and eyebrows are
**uppercase with wide tracking**. Body stays at `text-sm`. Let weight and
spacing — not size jumps — carry hierarchy.

---

## 7. Core components

These patterns already exist in `frontend/src/components`. Reuse them; don't
reinvent.

- **Card** — `rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5`. The
  fundamental container. Group related content; one idea per card.
- **Stat card** — small card: caption (`text-xs text-zinc-500`) over a
  `text-xl font-light` figure in a semantic accent.
- **Bottom-sheet modal** (`Modal.tsx`) — all create/edit/settings flows slide up
  from the bottom with a drag-handle visual, backdrop dismiss, and Escape to
  close. Forms never navigate to a new page.
- **Segmented control** — for small mutually-exclusive choices (event type,
  frequency). Selected segment fills with the relevant accent.
- **FAB** — a single floating action button (bottom-right, above the nav) for the
  primary "add" action on a tab.
- **Bottom nav** (`BottomNav.tsx`) — four destinations: Overview · Timeline ·
  Money Flow · Household. Active item brightens to `zinc-100`.
- **Buttons**:
  - Primary: `bg-zinc-100 text-zinc-900 rounded-xl py-2.5 text-sm font-medium`
  - Secondary: `border border-zinc-800 text-zinc-300 rounded-xl hover:border-zinc-700`
  - Destructive: rose text, **two-tap confirm** (tap once to arm, again to commit).
- **Avatar** — circle with initials on a `zinc-800` ground (`rounded-full`),
  used for household members. Falls back to initials when no `avatar_url`.

---

## 8. Iconography & motion

- **Icons**: thin line icons only, `stroke-width: 1.5`, sized `h-4 w-4` to
  `h-5 w-5`, in `currentColor`. Heroicons "outline" style is the reference.
  Never filled/duotone icons.
- **Motion**: subtle and short. `transition-colors` on hover, slide-up for
  sheets. No bounce, no spin, no attention-grabbing animation. Reduced motion
  should feel native.

---

## 9. Voice & tone

Plain, warm, and brief. Katei talks like a considerate housemate, not a brand.

- **Do**: "Nothing coming up — all clear." · "Rent due" · "in 2 days"
- **Don't**: "🎉 You're all caught up!!!" · "URGENT: Action required" · jargon
- Lowercase relative time ("today", "tomorrow", "in 4 days", "2 days ago").
- Empty states reassure, they don't nag.
- Errors are quiet and specific, in `text-rose-400`, never modal alarms.

---

## 10. Quick reference (copy-paste tokens)

```
Background      bg-zinc-950
Card            rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5
Input           rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm
Eyebrow         text-xs uppercase tracking-widest text-zinc-500
Title           text-2xl font-light text-zinc-100
Primary btn     rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900
Pill            rounded-full px-2 py-0.5 text-xs font-medium
Accent — time   amber-500     Accent — money  emerald-500     Accent — critical  rose-500
```
