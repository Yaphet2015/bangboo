# Task 5 report

## Status

Complete. A single bounded retry of the required validation sequence passed in full, including the packed official ACP SDK smoke and artifact creation.

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

Bounded retry completed in the required sequence on 2026-08-12:

- `npm run test:integration` — passed: 3 files, 22 tests. Both built and packed `serves ACP initialization as clean JSONL and exits when stdin closes` SDK smoke tests passed; the packed smoke completed in 1080 ms.
- `npm run verify` — passed: TypeScript typecheck, 12 Vitest files / 43 tests, and brand audit across 17 user-facing source files. The packed and built ACP SDK smoke tests also passed in this full run.
- `npm run build` — passed: fetched locked upstream commit `845d6ff1f6643aba440341cce877ce1c43ebbc39`, staged, installed, and built Bangboo 0.1.1 successfully.
- `npm run pack` — passed: pristine upstream suite reported 180 files passed / 6 skipped and 1657 tests passed / 48 skipped; package build and `npm pack` succeeded.
- Artifact confirmed at `artifacts/bangboo-0.1.1.tgz` (4.6 MiB displayed by `ls -lh`; npm reported 4.9 MB package size, 923 files).

## Review fix validation

The approved validation policy allows upstream/pre-existing skips when explicitly reported. A fresh `npm run pack` completed the pristine upstream suite with 1657 passed and 48 skipped tests, then built and packed `bangboo-0.1.1.tgz` successfully.

The fixture mutation is now entirely guarded by a reusable `withTemporaryFileContents` helper. Its failure-path tests model a partially mutated backing value after the temporary write rejects and assert that the final value exactly equals the original; they also cover failure of the guarded upstream action.

- `npm test -- --run test/unit/upstream-test-fixture.test.ts` — passed: 10 unit files / 23 tests, including both restoration cases; zero skips.
- `npm run typecheck` — passed.
- `npm run test:integration` — passed: 3 files / 22 repository integration tests; built and packed official ACP SDK initialization smoke tests passed; zero skips.
- `npm run pack` — passed: pristine upstream suite 180 files passed / 6 skipped and 1657 tests passed / 48 skipped; package build and pack succeeded.
- `npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp --reporter=verbose` — passed directly after staging installed dependencies: all 5 ACP test files and all 38 ACP tests executed, with zero skips.

Concerns:
- Dependency installation reports one high-severity npm audit finding; this did not fail the required validation.
- If restoration itself fails, that failure supersedes the original write/action error. This is intentionally fail-loud and avoids extra aggregation machinery, but can obscure the primary failure context.
- The supplied root-level `context.md` and `plan.md` paths were absent from the worktree; the tracked implementation plan and Task 5 report were available.
