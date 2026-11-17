# Changelog

All notable changes to Katei are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/) once versioned releases begin.

Until then, Katei is a rolling release: every merge to `main` publishes
`ghcr.io/jigle/katei:latest` plus an immutable `sha-<commit>` tag.

## [Unreleased]

### Added

- Contributor documentation: contributing guide, security policy, code of
  conduct and this changelog.
- Issue forms for bugs and feature requests, and a pull request template.
- Dependabot updates for npm packages, GitHub Actions and the Docker base image.
- A CI workflow that type-checks the backend and frontend and builds the Docker
  image on every pull request.
- Bottom sheets close when you pull them down by the handle or header.

### Changed

- Every button and link now answers a tap of at least 44×44 px, without
  changing how it looks.
- The Docker image now runs on Node.js 22, matching CI.
