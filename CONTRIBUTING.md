# Contributing to Katei

Thanks for helping make Katei better. This guide covers how to get the app
running, how changes are shaped, and what a pull request needs before it can
merge.

## Ground rules

- Be kind and constructive. Everyone here follows the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security problems privately, as described in [SECURITY.md](SECURITY.md),
  never in a public issue.
- For anything larger than a small fix, open an issue first so the approach
  can be agreed before you invest time in it.

## Prerequisites

- Node.js 22 (the version is pinned in [`.nvmrc`](.nvmrc), so `nvm use` picks it up)
- PostgreSQL 16 for local development, or Docker to run everything in one container

## Running locally

The quickest route is Docker, which matches production exactly:

```bash
cp .env.example .env   # then set POSTGRES_PASSWORD
docker compose up --build
```

For day-to-day work, run the API and the Vite dev server separately against a
local database:

```bash
createdb katei && psql katei -f schema.sql
export DATABASE_URL=postgresql://localhost:5432/katei

# Terminal 1: API on :3000
cd backend && npm ci && npm run dev

# Terminal 2: SPA on :5173, proxying /api to :3000
cd frontend && npm ci && npm run dev
```

## Checks

CI runs all of these on every pull request. Running them locally first saves a
round trip.

| What | Command |
|---|---|
| Backend type check | `cd backend && npx tsc --noEmit` |
| Frontend type check and build | `cd frontend && npm run build` |
| Backend tests | `cd backend && npm test` (integration tests need `DATABASE_URL`; without it they skip) |
| End-to-end smoke suite | `cd e2e && npm ci && npx playwright test` against a running app (`E2E_BASE_URL`, default `http://localhost:3000`) |

The E2E suite runs at a 360 px wide viewport on purpose: it is the narrowest
mainstream phone width, and Katei is mobile first.

## Making changes

### Branches and commits

- Branch from `main` and open a pull request back into it. `main` is always
  deployable: every merge publishes `ghcr.io/jigle/katei:latest`.
- Write commits in [Conventional Commits](https://www.conventionalcommits.org/)
  style, which the history already follows:
  `feat(lists): …`, `fix(pwa): …`, `ci: …`, `docs: …`, `test: …`, `chore(deps): …`.
- Keep each commit to one logical change, with a subject that says what the user
  gets, not which file moved.

### UI and copy

- Follow [BRAND.md](BRAND.md) for colour, type, spacing, motion and voice.
- Check every screen you touch in light and dark mode, at 360 px wide.
- Every user-facing string goes through i18n and must be added to all six
  locale files: `frontend/src/locales/{en,de,fr,es,it,nl}.json`.

### Database

- `schema.sql` is applied on first boot only. A schema change must also be safe
  for existing installations, so describe in the PR how an existing database
  picks it up.

### Privacy

Katei keeps some data private to one household member (for example private money
streams and a person's own wishlist). Preserve those boundaries in both the API
and the UI, and cover new ones with a test.

## Pull requests

- Fill in the pull request template; it doubles as the review checklist.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a
  household would notice.
- Keep PRs small and focused. Several small PRs review faster than one large one.
- A PR merges once CI is green and it has been reviewed.

## Releasing

Every merge to `main` publishes `ghcr.io/jigle/katei:latest` and a
`sha-<commit>` tag. A versioned release adds stable, immutable tags on top:

1. Move the **Unreleased** entries in [CHANGELOG.md](CHANGELOG.md) under a new
   version heading (for example `## [1.2.0] - 2026-12-01`) and merge that PR.
2. Tag the merge commit on `main` and push the tag:

   ```bash
   git tag -a v1.2.0 -m "Katei 1.2.0" && git push origin v1.2.0
   ```

3. CI runs the full test suite, publishes `ghcr.io/jigle/katei:1.2.0` and
   `:1.2`, and creates a GitHub Release with generated notes.

Versions follow [Semantic Versioning](https://semver.org/): a major bump for a
change that needs action from people upgrading (for example a manual migration),
a minor bump for features, and a patch bump for fixes.

## Dependencies

Dependabot opens grouped update PRs every Monday. Playwright is pinned to an
exact version so browser installs stay reproducible; if a bump fails to install
its browser in CI, check that it supports the runner's Ubuntu release.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), the same license as the project.
