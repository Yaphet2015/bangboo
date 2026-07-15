# Repository Guidelines

## Project Structure & Module Organization

This repository builds the `bangboo` CLI from a pinned upstream runtime instead of maintaining a full source fork.

- `src/` contains reusable TypeScript build modules; `scripts/` contains executable entry points.
- `patches/` is the ordered patch series applied to the upstream checkout; keep numeric prefixes sequential.
- `test/unit/` covers local modules. `test/integration/` verifies staging, builds, and packed CLI behavior. Samples live in `test/fixtures/`.
- `upstream.lock.json` records exact provenance. `.bangboo-build/`, `.cache/`, and `artifacts/` are generated and must not be committed.

## Build, Test, and Development Commands

Use Node.js 22.19 or newer and install reproducibly with `npm ci --ignore-scripts`.

- `npm test` — run fast unit tests.
- `npm run test:integration` — run tests that may stage or pack the upstream runtime.
- `npm run typecheck` — check strict TypeScript without emitting files.
- `npm run verify` — run type checking, all Vitest tests, and brand verification.
- `npm run stage` — fetch the locked upstream commit and apply every patch.
- `npm run build` — stage and compile the complete runtime.
- `npm run pack` — create `artifacts/bangboo-<version>.tgz` after upstream validation.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons, multiline trailing commas, and explicit types at public boundaries. This is native ESM; relative TypeScript imports use `.js` suffixes. Use `camelCase` for values, `PascalCase` for types, and kebab-case filenames such as `upstream-lock.ts`. No formatter or linter is configured, so follow nearby code.

## Testing Guidelines

Vitest discovers `test/**/*.test.ts` and runs files serially. Name tests by behavior; keep unit tests deterministic and isolated. Add integration coverage for patch replay, packaging, CLI execution, or cross-platform behavior. There is no numeric coverage threshold; demonstrate regressions with focused tests. Run `npm run verify` before a PR.

## Commit & Pull Request Guidelines

History follows Conventional Commit subjects such as `feat: build Bangboo coding agent` and `ci: fix cross-platform verification`. Keep commits focused and imperative. PRs should explain impact, list verification commands, and link issues. Include output or screenshots for visible CLI/TUI changes. Upstream upgrades must update the lock, replay patches, refresh provenance documents, and remain draft until the compatibility matrix passes.

## Security & Configuration

Never commit credentials, sessions, generated tarballs, or local `.bangboo/` data. Report vulnerabilities through the private channel described in `SECURITY.md`; do not open public issues with exploit details.
