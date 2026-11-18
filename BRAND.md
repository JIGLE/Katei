# Katei — Brand & Design Identity

> The single source of truth for how Katei looks, feels, and speaks.
> New UI should reference this file. When a design decision isn't covered here,
> extend this document rather than improvising in a component.

---

## 1. Name & meaning

**Katei** (家庭) is Japanese for _household / home / family_ — not the building, but
the unit of people and the life they run together. The app is a **household
obligation awareness system**: it makes the shared, easily-forgotten duties of a
home (bills, deadlines, renewals, who-owns-what) calmly visible.

The logo is a **monogram**, not the wordmark: a K drawn as three hairline
strokes — one upright, two diagonals meeting it at a single point, in the same
`stroke-width: 1.5` line language as the rest of the icon set (see §8) rather
than a letterform borrowed from a typeface. It sits beside the lowercase
wordmark **katei** (Inter Light, wide tracking) wherever there's room for both;
the mark alone stands in for it in tight spaces (the app header, the favicon).
Defined once in `frontend/src/components/Logo.tsx` — every render site imports
it rather than redrawing it. Never distorted, recolored, or boxed. On the
splash screen the three strokes draw themselves in before the wordmark and the
emerald underline settle — the app's one deliberate signature animation.

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
by getting _lighter_, plus a hairline border — never by drop shadows.

| Layer           | Token                                          | Use                                    |
| --------------- | ---------------------------------------------- | -------------------------------------- |
| App background  | `bg-zinc-950`                                  | The page / root canvas                 |
| Card / panel    | `bg-zinc-900`                                  | Raised content blocks, list containers |
| Hairline border | `border-zinc-800/60`                           | Card edges, dividers, header rules     |
| Input well      | `bg-zinc-950` inside a `border-zinc-800` field | Form inputs sit _below_ cards          |
| Hover lift      | `hover:border-zinc-700`                        | Interactive border brighten on hover   |

Corner radius: cards/sheets `rounded-2xl`, controls/inputs `rounded-xl`, pills
and avatars `rounded-full`. Never square corners on a surface.

---

## 5. Color = meaning

Accents are **semantic**. A color may only appear when it carries its meaning;
decorative color is forbidden.

| Accent     | Token                 | Meaning                                        | Where                                            |
| ---------- | --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| 🟡 Amber   | `amber-500`           | **Time** — appointments, upcoming, "this week" | Appointment events, time stats                   |
| 🟢 Emerald | `emerald-500`         | **Money** — flows, costs, outflow              | Money Flow, payment events, amounts              |
| 🔴 Rose    | `rose-500`            | **Critical** — deadlines, overdue, destructive | Deadlines, overdue items, delete actions, errors |
| ⚪ Zinc    | `zinc-100 → zinc-600` | **Neutral** — text, structure, "later"         | Everything non-semantic                          |

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
- **Emphasis pill** (overdue): bump fill to `/15` and text to `-400` (`/20`
  dropped the light theme's deep-rose text to 4.4:1 against its own fill)
- **De-emphasized** ("later"/done): drop to `zinc` (`bg-zinc-800 text-zinc-500`)

States that mean none of the above stay **neutral**, however tempting a hue
is. Gift status (idea, reserved, bought), assignment roles, the Pets heading,
the Person/Pet picker and the Lists tab carry no accent: reserved reads
strongest (`bg-zinc-700/60 text-zinc-200`), bought steps back
(`bg-zinc-800 text-zinc-400`), and a selected segment fills with
`bg-zinc-700/40 text-zinc-100` unless the choice itself is a meaning (event
type). `e2e/tests/colour-meaning.spec.ts` keeps amber and teal off those
screens.

Text hierarchy: primary `text-zinc-100`, secondary `text-zinc-400`, tertiary /
captions `text-zinc-500`, and `zinc-600` for **non-text only** (icons, drag
grips, focus borders) or genuinely disabled controls.

**Every visible text clears WCAG AA in both themes** — 4.5:1, or 3:1 at 24px+.
`zinc-500` is tuned per theme to make that true for captions and eyebrows:
`132 132 141` in dark (4.8:1 on a `zinc-900` card; Tailwind's `113 113 122`
measured 3.7:1) and `108 108 117` in light (4.8:1 on the warm page). `zinc-600`
fails as text in both themes (2.3:1 dark, 2.6:1 light), which is why it is
reserved for non-text. Text on an accent fill uses `text-zinc-950`, which
inverts with the theme, never `text-white` (3.7:1 on `rose-500` in dark).
`e2e/tests/text-legibility.spec.ts` recomputes all of this from the live page
on every tab, in both themes.

---

## 6. Typography

Typeface: **Inter** (loaded from Google Fonts), with a system-ui fallback stack.
Weights used: **300 / 400 / 500 / 600** only.

| Role            | Classes                                                       |
| --------------- | ------------------------------------------------------------- |
| Page title      | `text-2xl font-light text-zinc-100`                           |
| Section eyebrow | `text-xs uppercase tracking-widest text-zinc-500`             |
| Card heading    | `text-xs font-medium uppercase tracking-widest text-zinc-500` |
| Body            | `text-sm text-zinc-200`                                       |
| Stat figure     | `text-xl font-light` (in its semantic accent)                 |
| Caption / meta  | `text-xs text-zinc-500`                                       |

Size floor: no text below **11px** (`text-[0.6875rem]`), including avatar
initials, badges, weekday letters and nav labels. Anything a reader must read
is `text-xs` (12px) or larger.

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
  from the bottom. Three ways out: pull the handle or header down (past 96px,
  or a quick flick, closes; less springs back), tap the backdrop, or press
  Escape. Forms never navigate to a new page.
- **Segmented control** — for small mutually-exclusive choices (event type,
  frequency). Selected segment fills with the relevant accent.
- **Adding things** — one pattern, everywhere:
  - **The add button** (`Fab.tsx`) is a tab's one primary create action,
    bottom-right above the nav, and it always opens a bottom sheet. Timeline,
    Money and Household have one; Overview has none. It steps aside while you
    scroll down and comes back on scroll up.
  - **More than one kind of thing to add** (Money: income, expense, a savings
    plan, a one-off contribution) opens a **chooser sheet** first: one row per
    kind, with a dot in its meaning colour and a one-line hint. Never a
    speed-dial of floating pills.
  - **Secondary adds inside a section** (`SectionAdd.tsx`) are a neutral
    `+ Label` text action at the right of the section header ("+ Add to
    savings", "+ New pot", "+ Add a gift"), and they open a sheet too.
  - **The one exception is Shopping**, where adding is typing a word: a field
    docked on top of the nav, Enter to add, no button and no sheet.
  - **Editing uses the same sheet and the same choices as adding.** A choice
    that can't change (an income event's type, set by its money stream) is
    shown as a fixed label, not as an extra option.
    `e2e/tests/add-pattern.spec.ts` checks the add buttons, the Money chooser and
    that new and edit offer the same event types.
- **Bottom nav** (`BottomNav.tsx`) — five destinations: Overview · Timeline ·
  Money Flow (hidden when a household turns Money off) · Lists · Household.
  **Edge-to-edge, not a floating pill.** The pill version measured 381.9px and
  clipped ~9px off each side of a 360px phone; a full-width bar cannot overflow
  at any viewport, which is the whole point of the shape.
  **Equal slots (`flex-1 basis-0`), not content-sized tabs.** Sizing each tab to
  its own label put every destination's centre wherever that label's length
  happened to fall: centre-to-centre spacing varied by 20.3px in English and
  33.3px in Italian. `justify-evenly` does not fix this — it equalises the gaps
  _between_ boxes, and unequal boxes with equal gaps still land on an uneven
  pitch. Equal slots put all five on one pitch, identically in every language.
  Icons are 24px with a 4px gap to a `text-[0.65rem]` label; below 360px the
  labels drop out entirely rather than ellipsise, and `truncate` above that is
  a safety net so no future translation can push the bar off-screen.
  Active item brightens to `zinc-100` on a `zinc-700` chip — deliberately one
  step stronger than the `zinc-800`-on-`zinc-900` used for selected segments
  elsewhere (`Lists.tsx`), because at nav scale that pair is nearly invisible;
  inactive items sit back at `zinc-400`, the lightest step that still clears
  4.5:1 against the bar in both themes (6.96:1 dark, 7.70:1 light — `zinc-500`
  managed only 3.69:1 dark, which is why it isn't used here despite being §5's
  caption token). Weights are 500 active / 400 inactive, one step below the
  600/500 pair they replaced: semibold pushed `Huishouden` to 69.7px and
  `Panoramica` to 68.6px, which left about a pixel between the label and the
  screen edge. The chip fill, the `zinc-100` lift and the accent dot carry the
  active state; the weight step is the fourth signal, not the only one. The row
  keeps `px-1` so the outermost active chip's rounded corners are not sliced
  off by the screen edge.
  **The account control lives in the header, not the bar.** Six items do not
  fit: the widest label is ~70px, five of those is 350px of a 360px screen, and
  a 44px avatar has nowhere to go. It keeps the merged notification badge (an
  unread count as a small rose badge on the avatar's corner) — only its
  position moved, and from a header its menu opens downward, which is the
  direction it wanted anyway.
  The bar is ~59px tall plus `pb-safe`, and `App.tsx`'s `main` padding and the
  pages' FAB offsets are sized against that — they move together if the bar is
  ever resized. None of these numbers are maintained by eye:
  `e2e/tests/nav-geometry.spec.ts` measures the bar at 320/360/390/430px in all
  six languages every CI run and asserts the centre pitch is even to within
  1px, no label is ellipsised, no label or chip comes within 4px of the screen
  edge whichever tab is active, and no contrast falls under AA; it also stands
  up a synthetic safe-area inset to check the content padding and FAB still
  clear a taller bar. The suite's own default viewport is 360×780 — the
  clipping bug survived three hand checks because every one of them ran at 390.
- **Buttons**:
  - Primary: `bg-zinc-100 text-zinc-900 rounded-xl py-2.5 text-sm font-medium`
  - Secondary: `border border-zinc-800 text-zinc-300 rounded-xl hover:border-zinc-700`
  - Destructive: rose text, **two-tap confirm** (tap once to arm, again to commit).
- **Touch targets** — every button and link answers a tap of at least 44×44,
  however small it looks. `index.css` gives each one an invisible hit area
  centred on it that never shrinks below 44px, so a 20px check circle or a
  `text-xs` link keeps its look; text fields get a real 44px minimum height.
  Don't add `overflow-hidden` to a control, since it clips that hit area.
  `e2e/tests/touch-targets.spec.ts` measures every control on every tab and
  in an open sheet.
- **Folding lists** — a group of per-person lists (other people's gift lists)
  folds each one to a single row: name over a neutral summary ("3 gifts ·
  1 reserved") and a chevron. Tapping opens it in place; a lone list is
  simply open. Per-list actions (share, add) appear only when it's open, and
  share is an icon in the row, not a loose text link.
- **Activity glance** (Overview, "Around the house") — only what other people
  did, never who did it, and never your own actions; hidden in a one-person
  household. Each row is a quiet verb, a dot, then the item as written
  ("Finished · Fix bicycle brakes"), so an item never gets glued into a
  sentence with the wrong casing.
- **Timeline** — the month grid stays on top but compact: each week is one
  44px row, so at 390×844 the first list rows show without scrolling. A
  "Today" link appears beside the month name only while another month is
  showing. With no day picked, open events read in three groups, Overdue
  (its label in rose), Next 7 days and Later; a picked day lists just that
  day.
- **Settings in plain words** — never show a raw code (`EUR`, `de-DE`,
  `Europe/Berlin`). Picking a country sets currency, date and number format
  and timezone together, shown as one line ("Euro (€) · German (Germany) ·
  Berlin time") with a "Change" link that unfolds the individual fields,
  whose options are written out too. Names come from `Intl` in the UI
  language (`frontend/src/lib/region.ts`), so they need no translation.
- **Avatar** — circle with initials on a `zinc-800` ground (`rounded-full`),
  used for household members. Falls back to initials when no `avatar_url`.

---

## 8. Iconography & motion

- **Icons**: thin line icons only, `stroke-width: 1.5`, sized `h-4 w-4` to
  `h-6 w-6` (the bottom nav sits at the top of that range), in `currentColor`.
  Heroicons "outline" style is the reference. Never filled/duotone icons.
- **Notification badge** (`public/badge.svg` → `badge-96.png`) — the one asset
  that must be **transparent with an opaque mark**, never a filled plate.
  Android builds the status-bar icon from the alpha channel alone: colour is
  discarded and whatever is opaque gets tinted flat white. `icon.svg` opens
  with a full-bleed background rect and so has no alpha at all, which is why
  pointing `badge` at the app icon drew a plain white square on the phone.
  The badge is the monogram only — no wordmark, no emerald rule, since a
  second colour cannot survive the flattening — at `stroke-width: 12` in a
  96px box, heavier than scaling `icon.svg` down would give: at 24dp the
  scaled-down stroke goes faint, and much heavier closes the counters where
  the diagonals meet the upright. `sw.ts` keeps the full-colour app icon for
  `icon`, which is the large in-body image and wants to be opaque.
  `e2e/tests/pwa-assets.spec.ts` asserts both the alpha and the wiring.
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
