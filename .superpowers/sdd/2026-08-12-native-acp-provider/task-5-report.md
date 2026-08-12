# Task 5 report

## Status

Partial / blocked release validation. Documentation, cumulative patch regeneration, clean patch replay, built ACP process verification, and repository unit/type validation were completed. Full pack/verify is blocked by a pre-existing upstream TUI snapshot assertion that fails because this worktree's absolute path wraps at width 120.

## Changes

- Documented exact bb `customAcpAgents` configuration, provider ID `acp-bangboo`, PATH guidance, state/trust, supported behavior, unsupported operations, MCP rejection, and trusted-extension boundary.
- Added staged manifest/source/docs assertions.
- Added built and packed CLI ACP JSONL process smoke tests that parse every stdout line, capture stderr independently, close stdin, assert Bangboo identity/version, and require exit 0.
- Regenerated cumulative patch 0009 and proved patches 0001–0009 replay from the locked checkout.
- Updated staging unit expectation for patch 0009.

## Validation

Passed:
- `npm run stage` (clean checkout; all nine patches apply)
- `npm run typecheck`
- `npm test` (9 files, 21 tests)
- focused built ACP smoke test (clean JSONL, identity/version, exit 0)
- `npm run build`

Blocked/failed:
- `npm run pack`: upstream suite reached 1656 passed, 48 skipped, then failed `test/tool-execution-component.test.ts` because the worktree's long absolute AGENTS.md path wraps at width 120. The assertion retries and fails identically. Packaging therefore did not produce a validated new tarball.
- Full `npm run test:integration` and `npm run verify` were not completed after that blocker.

## Risks

- Packed ACP smoke remains unexecuted because pack cannot pass the upstream path-sensitive test.
- The integration helper uses protocol-correct JSON-RPC JSONL directly rather than the SDK client builder after the SDK 1.3 builder callback API proved incompatible with the assumed convenience API.
- `.pi-subagents/` was pre-existing untracked and excluded.
