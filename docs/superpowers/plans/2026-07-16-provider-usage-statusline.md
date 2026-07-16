# Provider Usage Statusline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in footer indicator showing remaining Codex weekly quota and remaining Z.AI Coding Plan quota for the provider's actual window.

**Architecture:** Add a focused `ProviderUsageTracker` to the upstream session runtime. Provider responses feed Codex headers into it; settled Z.AI runs trigger an authenticated quota request. `AgentSession` emits normalized usage changes, while interactive mode publishes them through one existing footer status entry and remains responsible for layout.

**Tech Stack:** TypeScript, Vitest, Pi-compatible interactive runtime, Bangboo ordered patch series.

## Global Constraints

- Percentages mean remaining quota, are clamped to `0..100`, and are rounded to integers.
- Codex displays `(XX% weekly)` only for a true one-week response window.
- Z.AI displays its provider-reported window, never an assumed weekly label.
- No startup polling or background timer; refresh only after responses/settled runs.
- Quota failures must never affect agent execution or expose credentials.
- Support exactly `openai-codex`, `zai`, and `zai-coding-cn`.

---

### Task 1: Provider Usage Parsing and Tracking

**Files:**
- Create: `.bangboo-build/upstream/packages/coding-agent/src/core/provider-usage.ts`
- Create: `.bangboo-build/upstream/packages/coding-agent/test/provider-usage.test.ts`

**Interfaces:**
- Produces: `ProviderUsageTracker`, `ProviderUsage`, `parseCodexWeeklyUsage(headers)`, and `parseZaiUsage(payload)`.
- `ProviderUsageTracker` accepts injected `fetch`, credential resolver, and status callback dependencies so tests use real tracker behavior without network access.

- [ ] **Step 1: Write failing parser tests**

Cover Codex weekly-window selection, used-to-remaining conversion, malformed/non-weekly rejection, Z.AI explicit remaining percentage, consumed-percentage fallback, actual-window labels, rounding, and clamping. Assertions must include `expect(parseCodexWeeklyUsage(headers)).toEqual({ remainingPercent: 72, windowLabel: "weekly" })` and corresponding Z.AI `(5h)` data.

- [ ] **Step 2: Verify parser tests fail for the missing module**

Run: `cd .bangboo-build/upstream && npx vitest run packages/coding-agent/test/provider-usage.test.ts`

Expected: FAIL because `provider-usage.ts` does not exist.

- [ ] **Step 3: Implement minimal pure parsers**

Use finite-number guards, `Math.round(Math.min(100, Math.max(0, value)))`, exact weekly detection at `10080` minutes, and compact duration labels (`m`, `h`, `d`). Return `undefined` for invalid or inapplicable data.

- [ ] **Step 4: Verify parser tests pass**

Run the focused Vitest command from Step 2.

Expected: PASS with no skipped tests.

- [ ] **Step 5: Write failing tracker tests**

Test provider-isolated caching, unsupported-provider clearing, preserving the active provider's last valid value after transient failure, a short fetch timeout, credential-free no-op behavior, and single-flight Z.AI refreshes. Assert status copy exactly as `(72% weekly)` and `(72% 5h)`.

- [ ] **Step 6: Verify tracker tests fail for missing behavior**

Run the focused Vitest command.

Expected: FAIL on the first unimplemented tracker assertion.

- [ ] **Step 7: Implement the minimal tracker**

Add provider endpoint constants, an abortable Z.AI request, one in-flight promise, per-provider cached values, `selectProvider(provider)`, `handleResponse(provider, headers)`, `refreshSelectedProvider()`, and `dispose()`. Catch quota errors internally and never include API keys in errors or status.

- [ ] **Step 8: Verify all provider-usage tests pass**

Run the focused Vitest command.

Expected: PASS with no skipped tests.

### Task 2: Runtime and Footer Lifecycle Integration

**Files:**
- Modify: `.bangboo-build/upstream/packages/coding-agent/src/core/agent-session.ts`
- Modify: `.bangboo-build/upstream/packages/coding-agent/src/core/sdk.ts`
- Modify: `.bangboo-build/upstream/packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `.bangboo-build/upstream/packages/coding-agent/test/provider-usage.test.ts`

**Interfaces:**
- Consumes: `ProviderUsageTracker` from Task 1.
- Produces: `AgentSession.handleProviderResponse(provider, headers)`, a normalized `{ type: "provider_usage"; text: string | undefined }` session event, and interactive lifecycle wiring to footer status key `bangboo-provider-usage`.

- [ ] **Step 1: Write failing integration tests**

Add focused tests proving: a Codex response event publishes `(72% weekly)`; `agent_settled` refreshes both `zai` and `zai-coding-cn`; model selection clears unsupported providers; and shutdown disposes in-flight work. Use injected tracker/fetch dependencies rather than live services.

- [ ] **Step 2: Verify integration tests fail**

Run: `cd .bangboo-build/upstream && npx vitest run packages/coding-agent/test/provider-usage.test.ts`

Expected: FAIL because runtime events do not yet drive the tracker.

- [ ] **Step 3: Integrate tracking with AgentSession**

Extend `AgentSessionEvent` with `{ type: "provider_usage"; text: string | undefined }`. Construct the tracker with `modelRegistry.getApiKeyForProvider` and a callback that emits this event. Add `handleProviderResponse(provider, headers)`, update tracker selection whenever the session model changes, refresh it when the session becomes settled, and dispose it during session shutdown.

- [ ] **Step 4: Route responses and wire interactive status**

In `sdk.ts`, retain a post-construction `AgentSession` reference and use the response callback's model argument to call `session.handleProviderResponse(model.provider, response.headers)` before invoking extension `after_provider_response` handlers. In interactive mode, handle `provider_usage` by calling `setExtensionStatus("bangboo-provider-usage", event.text)` and requesting a TUI render.

- [ ] **Step 5: Verify focused integration tests pass**

Run the focused Vitest command.

Expected: PASS with no skipped tests.

- [ ] **Step 6: Run upstream coding-agent typecheck and focused neighboring tests**

Run: `cd .bangboo-build/upstream && npm run check && npx vitest run packages/coding-agent/test/provider-usage.test.ts packages/coding-agent/test/footer-width.test.ts packages/coding-agent/test/interactive-mode-status.test.ts`

Expected: all commands PASS with no skipped tests attributable to this feature.

### Task 3: Capture the Runtime Patch and Verify Distribution

**Files:**
- Create: `patches/0006-provider-usage-statusline.patch`
- Modify: `CHANGELOG.md`
- Test: `test/unit/staging.test.ts`
- Test: `test/integration/staged-package.test.ts`

**Interfaces:**
- Consumes: tested upstream runtime changes from Tasks 1-2.
- Produces: replayable Bangboo patch `0006` and distribution-level regression assertions.

- [ ] **Step 1: Write a failing repository assertion**

Add a staging/unit assertion that the ordered patch series contains `0006-provider-usage-statusline.patch` and an integration assertion that staged runtime contains `provider-usage.ts` with all three supported provider IDs.

- [ ] **Step 2: Verify repository test fails**

Run: `npm test -- test/unit/staging.test.ts`

Expected: FAIL because patch `0006` is absent.

- [ ] **Step 3: Generate the ordered patch**

From `.bangboo-build/upstream`, generate a binary-safe git diff containing only Task 1-2 runtime and test changes and save it as `patches/0006-provider-usage-statusline.patch`. Confirm `git apply --check` succeeds against a clean checkout at the locked upstream commit.

- [ ] **Step 4: Update user-facing release notes**

Add one concise `CHANGELOG.md` entry stating that Bangboo's footer reports remaining Codex weekly quota and actual-window Z.AI Coding Plan quota.

- [ ] **Step 5: Verify focused repository tests pass**

Run: `npm test -- test/unit/staging.test.ts && npm run test:integration -- test/integration/staged-package.test.ts`

Expected: PASS with no skipped tests.

- [ ] **Step 6: Run full verification**

Run: `npm run stage && npm run verify && npm run test:upstream`

Expected: patch replay, typecheck, all repository tests, brand verification, and upstream tests PASS. Report any upstream skips explicitly rather than claiming an unqualified pass.

- [ ] **Step 7: Commit implementation**

```bash
git add patches/0006-provider-usage-statusline.patch CHANGELOG.md test/unit/staging.test.ts test/integration/staged-package.test.ts
git commit -m "feat: show provider quota in statusline"
```
