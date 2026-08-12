# Task 5 report

## Status

Blocked by external GitHub connectivity during final rerun. The deterministic path-sensitive upstream fixture was root-caused and stabilized, the official SDK 1.3 `client().connectWith(...)` process helper was implemented, and pack passed. Full required validation could not be completed after `git fetch` began failing with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`.

## Root-cause evidence

- Long staged path: focused upstream `renders outside AGENTS.md...` failed because the expected absolute path was wrapped after `read resource` at width 120.
- Short main-checkout path: the identical focused assertion passed.
- The fixture derived its synthetic outside-AGENTS path from `process.cwd()`, making its rendering assertion depend on checkout length. The staging runner now temporarily substitutes a stable temp fixture path only while running the pristine suite and restores the exact upstream source in `finally`; no test is excluded or weakened.

## Changes

- Replaced raw JSON-RPC ACP smoke traffic with official SDK 1.3 `client`, `ndJsonStream`, `methods.agent.initialize`, `PROTOCOL_VERSION`, and `connectWith` APIs.
- Resolve the SDK using Node dependency resolution from the tested package, supporting workspace-hoisted and packed installs.
- Explicitly close stdin after initialization and validate every captured stdout JSONL line.
- Stabilized the upstream synthetic outside-resource fixture at its source during pristine testing.

## Validation

Passed:
- `npm run typecheck`
- `npm test` (9 files, 21 tests)
- `npm run pack` (upstream: 180 files passed, 6 skipped; 1657 tests passed, 48 skipped; artifact produced)
- Direct official-SDK process smoke against built CLI (Bangboo 0.1.1, clean JSONL, stderr empty, exit 0)

Failed/external:
- Focused built/packed rerun: build setup failed at `git fetch --force origin 845d6ff...` with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github.com:443`. Packed smoke in the same concurrent run used the prior helper revision and timed out; the corrected helper subsequently passed direct built smoke but could not be rerun through pack without another network-dependent restage.

Not completed after external failure:
- full `npm run test:integration`
- `npm run verify`
- final `npm run build`
- final packed smoke
