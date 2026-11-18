# Changelog

All notable changes to Katei are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/) once versioned releases begin.

Every merge to `main` publishes `ghcr.io/jigle/katei:latest` plus an immutable
`sha-<commit>` tag. Pushing a `vX.Y.Z` tag also publishes `:X.Y.Z` and `:X.Y`
images and a GitHub Release (see [CONTRIBUTING.md](CONTRIBUTING.md#releasing)).

## [Unreleased]

### Added

- Contributor documentation: contributing guide, security policy, code of
  conduct and this changelog.
- Issue forms for bugs and feature requests, and a pull request template.
- Dependabot updates for npm packages, GitHub Actions and the Docker base image.
- A CI workflow that type-checks the backend and frontend and builds the Docker
  image on every pull request.
- Bottom sheets close when you pull them down by the handle or header.

- Versioned releases: a `vX.Y.Z` tag publishes matching image tags and a GitHub
  Release. Images now carry OCI labels linking them to their source commit.

- ESLint and Prettier for the backend and frontend, checked in CI.

### Changed

- Every button and link now answers a tap of at least 44×44 px, without
  changing how it looks.
- Gift status, assignment roles, the Pets heading, the Person/Pet picker and
  the Lists tab are now neutral, so amber still only means time and teal only
  savings.
- Money's add button opens a "What are you adding?" sheet instead of floating
  pills, and includes a one-off contribution to savings.
- Section add actions ("+ Add to savings", "+ New pot", "+ Add a gift" and
  others) share one neutral look; the round + buttons on gift lists are gone.
- Editing an event offers the same three types as adding one; an income or
  savings event shows its type as fixed.
- Other people's gift lists fold to one summary row each and open on a tap;
  sharing is an icon in the list's header and "Add person" sits beside the
  Family & friends heading. The wishlist hint wraps instead of being cut off.
- Around the house no longer shows your own actions, hides in a one-person
  household, and shows each item as written ("Finished · Fix bicycle brakes").
- Settings show the region as one plain line ("Euro (€) · German (Germany) ·
  Berlin time") with a "Change" link instead of raw codes; picking a country
  sets all three. "Locale" is now "Date and number format".
- The Docker image now runs on Node.js 22, matching CI.
- End-to-end tests run on Playwright 1.64 and the current Ubuntu runner.
