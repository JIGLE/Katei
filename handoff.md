# Katei — Session handoff (Batch 6)

> Purpose: hand off in-flight work to a fresh chat/session. This file is
> committed so a re-cloned container can see it. **Delete it once the new
> session has picked up the thread.**

## What Katei is / how it ships
- Self-hosted household finance + obligations PWA. Deployed on TrueNAS, which
  pulls `ghcr.io/jigle/katei:latest`.
- **Pipeline:** commit → push to **`main`** → GitHub Actions (`.github/workflows/docker.yml`):
  the `test` job (backend `npm test` against a postgres:16 service) **gates** the
  `build` job (buildx → GHCR `latest`). The whole session has shipped this way —
  **each item is its own commit straight to `main`.** Keep doing that.
- Single-origin app: Fastify serves the built SPA from `./public` with a SPA
  fallback (`backend/src/app.ts`), frontend hits relative `/api` with cookie auth.
- Repo scope for tooling is `jigle/katei` only. Don't create PRs unless asked.
- Commit trailers used this session:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01JN7CNeauqYEebvzNcYFLzj`.
  Never put a raw model ID in commits/code.

## The plan we're executing
Approved plan file: **`/root/.claude/plans/i-want-to-use-radiant-emerson.md`**
("Katei — Batch 6"). It was produced from three read-only audits (security,
tests/CI, product+a11y) and approved by the user. Read it first — it has the
full audit findings with file:line refs and per-item detail.

**Batch 6 = four areas the user chose:** Security & hardening, Frontend + E2E
tests, Product depth, Accessibility & theme. Two scope decisions already made:
- Product depth = **search/filter + "assigned to me" everywhere** now; **defer
  first-class recurring events** (large, own batch later).
- CSRF posture = **lock CORS + `sameSite`** (single-origin self-host); no CSRF
  token plumbing unless the user later asks.

## Progress

### ✅ S1 — DONE, committed + pushed (commit `da4a001`)
Admin-guarded the settings router. Was: any logged-in member could
`GET /api/settings/backups/:name` (SQL dumps with every password hash) and
rotate the calendar token — the router had no role check.
- `backend/src/routes/settings.ts`: `requireAdmin` on backups (list/run/download),
  calendar token (GET + rotate), `PUT /preferences`, `PUT /notifications`,
  `POST /notifications/run`. Kept member-open: `GET /preferences`,
  `GET /notifications`, `POST /notifications/test` (own devices).
- `backend/src/routes/settings.test.ts`: member→403, admin→through. **99/99 pass.**
- `frontend/src/components/SettingsForm.tsx`: gates admin-only controls behind
  `user.role === 'admin'` (Data tab, household config sections + Save, lead-days).
  Non-admins keep Appearance (theme) + their own device push toggle/test. New i18n
  key `settings.themeDeviceHint` added to all six catalogs.

### ⏭ Remaining (in sequence — see plan for detail)
- **S2** Lock CORS: `backend/src/app.ts:31` `origin:true` → allowlist from a new
  `config.corsOrigins` (env `CORS_ORIGINS`, default empty = same-origin only).
- **S3** `@fastify/helmet@^11` (Fastify-4 major) with an SPA-fitting CSP; verify
  SPA/PWA/push SW/avatar `<img>` still load.
- **S4** Broaden rate limiting reusing `backend/src/lib/ratelimit.ts` `hit()`:
  register, password change, `GET /auth/invite/:code`, avatar upload, public
  calendar-token route. 429 + `Retry-After` like login (`auth.ts:~190`).
- **S5** Magic-byte avatar validation in `backend/src/lib/avatars.ts` / the upload
  handler (`users.ts:~119`): sniff JPEG `FF D8 FF` / PNG `89 50 4E 47…` after
  `toBuffer()`, reject mismatch, derive ext from sniffed type (currently mimetype-only).
- **T1** Playwright E2E smoke suite + a CI `e2e` job that `needs: test` and gates
  `build`. Boot strategy: build frontend → copy `dist` to `backend/public` → `tsc`
  backend → `node dist/index.js` with `DATABASE_URL`+`JWT_SECRET` → wait `/health`
  → run. Fresh DB → first `POST /api/auth/register` = admin (no invite).
  `@playwright/test` not yet a dep; **Chromium is pre-installed at
  `/opt/pw-browsers`** (`PLAYWRIGHT_BROWSERS_PATH` set) — do **not** run
  `playwright install`; use `executablePath`/`browserName: 'chromium'`.
- **P1** Search + type filters (Timeline/Money/Household) via a shared `SearchInput`.
  Backend already supports `?type=` (`events.ts:~40`) and `?user_id=`
  (`assignments.ts:~7`), currently unused by the UI.
- **P2** "Assigned to me" everywhere (promote the Timeline-only `mineOnly` at
  `Timeline.tsx:~106` into a shared helper; add a Mine toggle to Money + Overview).
- **A1** Global `:focus-visible` ring in `frontend/src/index.css` (there is none
  today; inputs use bare `focus:outline-none`).
- **A2** `Modal.tsx`: add `role="dialog"`/`aria-modal`/`aria-labelledby`, focus
  trap + restore, real body-scroll-lock (currently only Escape + backdrop click).
- **A3** `CalendarMonth.tsx`: make it a real `role="grid"` with roving-tabindex
  arrow-key nav + dated `aria-label`s + `aria-current`/`aria-selected` + event-count
  in the label (day cells are buttons but not a grid; dots invisible to AT).
- **A4** "Match system" theme: extend `Theme` in `frontend/src/lib/preferences.tsx`
  to `'dark'|'light'|'system'`, resolve via `matchMedia` with a live listener,
  update the pre-paint bootstrap in `frontend/index.html:~22` and the toggle in
  `SettingsForm.tsx:~314`. (This also finishes making theme feel per-device.)

Task list IDs: S1 #53 (done), S2 #54, S3 #55, S4 #56, S5 #57, T1 #58, P1 #59,
P2 #60, A1 #61, A2 #62, A3 #63, A4 #64.

## Dev environment / how to verify (learned this session)
- **Postgres:** `pg_ctlcluster 16 main start`. A `katei` login role exists
  (`PASSWORD 'katei' SUPERUSER`). Databases `katei_test` and `katei_dev` exist.
- **Backend tests:** from `backend/`:
  `DATABASE_URL='postgresql://katei:katei@localhost:5432/katei_test' JWT_SECRET='integration-test-secret' npm test`
  — the harness (`src/test-helpers.ts`) drops/recreates the schema from
  `schema.sql` then runs `migrate()`, so tests are self-contained. Currently **99 pass**.
- **⚠ Dev DB gotcha:** `npm run dev` runs `migrate()` but does **NOT** load
  `schema.sql`. A *fresh* `katei_dev` therefore errors `relation "users" does not
  exist`. Before `npm run dev` on a fresh DB, load the schema once:
  `PGPASSWORD=katei psql -U katei -h localhost -d katei_dev -f schema.sql`.
  (Tests don't hit this because `setupTestDb()` loads schema.sql for you.)
- **Run the app for UI checks:** backend from `backend/` with
  `DATABASE_URL=…katei_dev JWT_SECRET=dev-secret-key BACKEND_PORT=3000 npm run dev`;
  Vite from `frontend/` with `npm run dev` (proxies `/api` → :3000). First-run
  screen registers the admin. `tsx watch` respawns on kill — kill by PID
  (`ps aux | grep tsx`), not just `pkill npm`.
- **Playwright ad-hoc:** a global install exists at
  `/opt/node22/lib/node_modules/playwright` — import by absolute path
  (`.../playwright/index.mjs`) and launch with
  `executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox']`.
- **Frontend build/typecheck:** `cd frontend && npm run build` (runs tsc).
- **i18n:** six catalogs in `frontend/src/locales/{en,de,es,fr,it,nl}.json`; every
  new user-facing string goes in **all six** (see the `themeDeviceHint` add for the
  pattern — insert as the last `settings.*` key, keep JSON valid).

## Key gotchas / conventions
- Fastify is **4.x** → any new `@fastify/*` plugin must be the v4 major
  (helmet `^11`, rate-limit `^9`). `@fastify/multipart` is pinned `^8` (v9 needs Fastify 5).
- SQL is parameterized everywhere via `query()` (`db.ts`); dynamic UPDATE columns
  come from server-side whitelists — keep that pattern.
- Motion/theme are CSS-var driven in `frontend/src/index.css`
  (`--ease-*`, `--dur-*`); honor `prefers-reduced-motion`. Design rules live in
  `CLAUDE.md` + `BRAND.md` (Japandi dark/light, Inter, semantic accents:
  emerald=money, rose=critical, amber=time, teal=savings).
- Carryover: user should still device-test Web Push lock-screen delivery on their phone.

## Suggested first move in the new session
Read the plan file, then start **S2** (CORS lock) — small, isolated to
`backend/src/app.ts` + `config.ts` + one test. Continue S3→S5, then T1, P1/P2,
A1–A4, each its own commit to `main`.
