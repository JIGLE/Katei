---
name: design-award
description: >
  Drive Katei's design to an award-winning state through a repeatable
  audit-and-elevate loop: stage a realistic household, capture every screen in
  both themes, grade against a scorecard (craft, honesty, accessibility, and
  taste), fix findings one commit at a time, and verify end-to-end. Trigger on
  "award", "design audit", "elevate the design", "polish pass", "taste pass",
  or /design-award.
---

# design-award — Katei's audit-and-elevate loop

You are the design lead of a small studio whose signature is restraint. Katei
already has its identity — Japandi calm, `BRAND.md` tokens, the always-on rules
in `CLAUDE.md`. This skill doesn't restyle; it raises execution to the level
where the identity reads as inevitable. Judge every choice against that named
lineage — quiet, precise, domestic — never against nothing, and never toward
dashboard-SaaS or the AI-default cluster CLAUDE.md §2 lists.

**Two kinds of judgment run in parallel.** Rules catch errors: compute
whatever is computable (contrast, CVD separation, keyboard reach) and never
eyeball it. Taste decides between correct options: it gets its own section,
its own scorecard row, and its own written record below.

## The loop

Run the stages in order. One finding = one commit = one verified fix.

### 1. Stage
A realistic household, never an empty or synthetic-looking one:

```bash
service postgresql start
sudo -u postgres psql -c "DROP DATABASE IF EXISTS katei_e2e" -c "CREATE DATABASE katei_e2e OWNER katei"
PGPASSWORD=katei psql -h 127.0.0.1 -U katei -d katei_e2e -q -f schema.sql
(cd frontend && npm run build) && rm -rf backend/public && cp -r frontend/dist backend/public
(cd backend && npm run build && DATABASE_URL='postgres://katei:katei@127.0.0.1:5432/katei_e2e' \
  JWT_SECRET=dev PORT=3000 node dist/index.js &)  # wait on /health
node .claude/skills/design-award/scripts/seed.mjs
```

### 2. Capture
```bash
node .claude/skills/design-award/scripts/capture.mjs   # → .design-award/shots/
```
Every page, both themes, 390×844. Read every image — the harness also fails
loudly on page errors. Screenshots are the evidence; findings without a
screenshot or a code reference don't count.

### 3. Grade — the scorecard
Score each row 0–2 per screen (0 = fails, 1 = correct, 2 = award-level).
Target: ≥ 90% overall, no row at 0. Grade with tools where computable; for
color work load the **dataviz** skill and run its `validate_palette.js`
(don't hard-code its versioned path).

| Row | The bar at 2 |
|---|---|
| Craft & precision | Alignment intentional everywhere; `tabular-nums` on every number; spacing rhythm unbroken; no wrap/overflow at 390px in any of the six languages |
| Signature moment | Exactly one per screen, serving the screen's job (Overview greeting, Money's Net) — everything else recedes |
| Hierarchy honesty | Structure encodes meaning: cards mean grouping, numbering means sequence, eyebrows label truthfully |
| Microcopy | Active voice, user-named objects, consistent action names across a flow, no dead ends — every empty state invites the next action |
| Accessibility | Text ≥ 4.5:1 in BOTH themes (large ≥ 3:1); keyboard-complete; AT hears what sighted users see; reduced-motion honored |
| Motion restraint | Purposeful only; calm easing; no forwards-filling opacity/transform (stacking-context trap); nothing loops |
| i18n completeness | Every string in all six catalogs; grammar-safe forms (self-voice uses `_self` keys, never pronoun swaps) |
| Truthfulness | No number silently wrong: currency labels match the math, counts match the list below them, data isn't stale on PWA resume |
| **Taste & restraint** | Passes every taste test below; taste calls recorded |

### 4. Elevate
Follow CLAUDE.md's two-pass process: brainstorm the token plan → critique it
("would I produce this for any similar screen?") → build. Severity order:
truth bugs → accessibility → usefulness → craft → delight.

### 5. Verify
Re-drive the changed flow in the running app (both themes), then:
```bash
(cd backend && DATABASE_URL=postgres://katei:katei@127.0.0.1:5432/katei_test npm test)
# fresh katei_e2e + schema, boot, then:
(cd e2e && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NO_PROXY=localhost,127.0.0.1 npx playwright test)
```

### 6. Ship
One commit per finding, pushed to `main` (CI gates the GHCR image on tests +
smoke). Re-run Capture after the batch and compare against the "before" set.

## Taste — how judgment is exercised

Calibration comes first: read what treatment each screen's occasion calls
for. A bill list is utilitarian — its craft is rhythm and legibility. The
Overview greeting is the app's one editorial moment. Over-designing the wrong
screen is a taste failure equal to under-designing the right one.

**Tests to run on every screen** (each is pass/fail; failures are findings):

- **Squint test** — blur your eyes (or downscale the screenshot): does the
  hierarchy survive? The most important thing must still be the most visible.
- **Remove-one-thing test** — delete the least-earning element mentally. If
  the screen improves, that element wasn't earning its place; cut it.
- **Swap test** — would this component look at home in a generic admin
  template? Then it's inherited, not chosen. Everything — neutrals, radii,
  spacing steps — must read as picked for this app.
- **Signature-vs-gimmick** — does the screen's bold moment serve its job, or
  decorate it? A count-up animation on the number people came to read serves;
  the same animation on a label decorates.
- **Silence test** — stage the screen with nothing due, nothing new. Does it
  feel calm (an earned quiet, an inviting next step) or merely empty?

**One risk, quiet elsewhere.** Each elevation pass may take exactly one
aesthetic risk where it serves the work. If the risk fights the ground,
soften it toward the palette rather than replacing it.

**Taste calls get named.** When judgment overrides a defensible alternative
(dropping a legend, hiding a filter until it earns its place, refusing a
feature's default treatment), one line of *why* goes in the commit body.
Taste that can't explain itself is fashion.

## Katei anti-patterns — if a screen matches an entry, it's wrong

Seeded from CLAUDE.md's anti-slop list plus audit history; extend it whenever
a new failure class is found and fixed.

- A dead-end state: any screen or panel that describes emptiness without
  offering the next action.
- The same card on two tabs: duplicated month-constant figures where one tab
  should summarize and link.
- A number in a prime slot that rarely changes: prime slots belong to what
  changes today.
- A legend the colors can't honor: dots or swatches promising an identity
  mapping that adjacent shades can't deliver (validate; don't argue).
- An aggregate that mixes currencies under one symbol.
- A control row that outweighs its content: filters and search must earn
  their place with volume.
- "0 assignments" energy: captions that state an absence nobody asked about.
- A bell that lies: attention surfaces disagreeing about what needs attention.
- Gray text on colored ground; pure black/white; new accent hues; nested
  cards; bounce easing (the CLAUDE.md §2 list, permanently in force).

## Repo facts that cost real time (institutional memory)

- **The app scrolls `<main>`, not `<body>`** — `fullPage` screenshots and
  `window.scrollTo` are silent no-ops. Scroll with
  `document.querySelector('main').scrollTo(...)` or element
  `scrollIntoViewIfNeeded`. Anything "locking" scroll must target `<main>`.
- **Zinc AND the semantic accents are CSS variables** (`frontend/src/index.css`,
  mapped in `tailwind.config.js`). Dark uses Tailwind's values; light remaps
  accents to deep (~700) steps. Any new accent step must be added to both
  themes and re-checked for contrast on white.
- **The SPA is served from `backend/public`** — after `npm run build` in
  `frontend/` (which typechecks via `tsc`), copy `dist` there. The server
  reads it from disk, so frontend redeploys don't need a restart.
- **Seed through the API**: on a fresh DB the first `POST /api/auth/register`
  becomes admin. `schema.sql` must be applied manually (the Docker init hook
  doesn't run outside compose).
- **Theme is a server preference** — flip via
  `PUT /api/settings/preferences { ...prefs, theme }`, restore afterwards.
  `localStorage['katei-theme']` is only the pre-paint cache.
- **Playwright**: run from `e2e/` with
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and
  `NO_PROXY=localhost,127.0.0.1`. The smoke registers the one first-run admin,
  so it needs a fresh database every run.
- **Every user-facing string** goes to all six catalogs
  (`frontend/src/locales/{en,de,fr,es,it,nl}.json`); count-bearing strings use
  `_one`/`_other` plurals; self-voice sentences use per-language `_self` keys.
- **Intl date wording differs by language** — don't assert exact date strings
  in tests without checking the actual `Intl` output for the UI language.

## Definition of done

Scorecard ≥ 90% with no row at 0 · backend `npm test` green · smoke suite
green on a fresh database · both-theme after-captures reviewed against the
before set · one commit per finding on `main`, taste calls named in the
commit bodies.
