# Codex WebSocket Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show remaining OpenAI Codex weekly quota after settled WebSocket or SSE runs by querying Codex's authenticated usage endpoint.

**Architecture:** Extend the existing `ProviderUsageTracker` rather than changing transport code. After a settled `openai-codex` run, the tracker uses its existing credential resolver, abort lifecycle, single-flight promise, cache, and global `fetch` to query `/backend-api/wham/usage`; the global fetch retains Bangboo's `undici.EnvHttpProxyAgent` and system-proxy behavior. Keep SSE response-header parsing as an opportunistic immediate update.

**Tech Stack:** TypeScript, Vitest, Undici global fetch/proxy dispatcher, Bangboo ordered patch series.

## Global Constraints

- Use `https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer <OAuth access token>`.
- Do not require or derive `chatgpt-account-id`; a live proxy-aware probe confirmed the endpoint succeeds without it.
- Weekly windows have `limit_window_seconds === 604800`; inspect both `primary_window` and `secondary_window`.
- Percentages mean remaining quota, use `100 - used_percent`, are clamped to `0..100`, and rounded to integers.
- Use the existing global `fetch`; do not construct a proxy agent or dispatcher in provider-usage code.
- Preserve existing `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, and Bangboo `httpProxy` behavior.
- No startup request or timer; refresh only after settled runs.
- Failures must not affect model execution, expose credentials, or clear the last valid active-provider value.
- Keep existing Codex SSE-header and Z.AI behavior intact.

---

### Task 1: Parse and Refresh Codex Usage

**Files:**
- Modify: `.bangboo-build/upstream/packages/coding-agent/src/core/provider-usage.ts`
- Test: `.bangboo-build/upstream/packages/coding-agent/test/provider-usage.test.ts`

**Interfaces:**
- Produces: `parseCodexUsage(payload: unknown): ProviderUsage | undefined`.
- Extends: `ProviderUsageTracker.refreshSelectedProvider(): Promise<void>` to refresh `openai-codex` as well as Z.AI providers.
- Reuses: injected/default `fetchFn`, `getApiKey(provider)`, `timeoutMs`, provider cache, status callback, abort controller, and single-flight promise.

- [ ] **Step 1: Add failing parser tests for real Codex response shapes**

Add `parseCodexUsage` to the imports and add these tests to `packages/coding-agent/test/provider-usage.test.ts`:

```ts
	test("parses Codex primary weekly usage returned by the usage endpoint", () => {
		expect(parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: 13, limit_window_seconds: 604_800 },
				secondary_window: null,
			},
		})).toEqual({ remainingPercent: 87, windowLabel: "weekly" });
	});

	test("falls back to a Codex secondary weekly usage window", () => {
		expect(parseCodexUsage({
			rate_limit: {
				primary_window: { used_percent: 20, limit_window_seconds: 18_000 },
				secondary_window: { used_percent: 28.4, limit_window_seconds: 604_800 },
			},
		})).toEqual({ remainingPercent: 72, windowLabel: "weekly" });
	});

	test("ignores malformed and non-weekly Codex usage windows", () => {
		expect(parseCodexUsage({ rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18_000 } } })).toBeUndefined();
		expect(parseCodexUsage({ rate_limit: { primary_window: { used_percent: "nope", limit_window_seconds: 604_800 } } })).toBeUndefined();
	});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd .bangboo-build/upstream/packages/coding-agent
npm test -- provider-usage.test.ts
```

Expected: FAIL because `parseCodexUsage` is not exported.

- [ ] **Step 3: Implement the minimal Codex usage parser**

Add the endpoint constant and parser to `provider-usage.ts`:

```ts
const CODEX_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const WEEK_SECONDS = 604_800;

export function parseCodexUsage(payload: unknown): ProviderUsage | undefined {
	if (!payload || typeof payload !== "object") return undefined;
	const rateLimit = (payload as { rate_limit?: unknown }).rate_limit;
	if (!rateLimit || typeof rateLimit !== "object") return undefined;
	const windows = [
		(rateLimit as { primary_window?: unknown }).primary_window,
		(rateLimit as { secondary_window?: unknown }).secondary_window,
	];
	for (const value of windows) {
		if (!value || typeof value !== "object") continue;
		const window = value as Record<string, unknown>;
		const used = finiteNumber(window.used_percent);
		const seconds = finiteNumber(window.limit_window_seconds);
		if (used !== undefined && seconds === WEEK_SECONDS) {
			return { remainingPercent: normalizePercent(100 - used), windowLabel: "weekly" };
		}
	}
	return undefined;
}
```

- [ ] **Step 4: Run the focused test and verify parser GREEN**

Run the command from Step 2.

Expected: parser tests PASS; existing tracker tests remain green.

- [ ] **Step 5: Add failing tracker tests for Codex endpoint refresh and failure preservation**

Add tests equivalent to:

```ts
	test("refreshes Codex usage after a settled-provider refresh", async () => {
		const statuses: Array<string | undefined> = [];
		const fetchFn = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				rate_limit: { primary_window: { used_percent: 13, limit_window_seconds: 604_800 } },
			}),
		});
		const tracker = new ProviderUsageTracker({
			fetchFn,
			getApiKey: async () => "oauth-token",
			onStatus: (text) => statuses.push(text),
		});
		tracker.selectProvider("openai-codex");
		await tracker.refreshSelectedProvider();
		expect(statuses).toEqual([undefined, "(87% weekly)"]);
		expect(fetchFn).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/wham/usage",
			expect.objectContaining({ headers: { Authorization: "Bearer oauth-token" } }),
		);
	});

	test("preserves valid Codex status after a usage endpoint failure", async () => {
		const statuses: Array<string | undefined> = [];
		const tracker = new ProviderUsageTracker({
			fetchFn: vi.fn().mockRejectedValue(new Error("offline")),
			getApiKey: async () => "oauth-token",
			onStatus: (text) => statuses.push(text),
		});
		tracker.selectProvider("openai-codex");
		tracker.handleResponse("openai-codex", {
			"x-codex-secondary-used-percent": "28",
			"x-codex-secondary-window-minutes": "10080",
		});
		await tracker.refreshSelectedProvider();
		expect(statuses).toEqual([undefined, "(72% weekly)"]);
	});
```

The fetch assertion intentionally contains no `chatgpt-account-id`; the injected `fetchFn` proves provider-usage code uses the existing fetch boundary instead of creating a dispatcher.

- [ ] **Step 6: Run the focused test and verify RED**

Run the command from Step 2.

Expected: FAIL because `refreshSelectedProvider()` currently no-ops for `openai-codex`.

- [ ] **Step 7: Extend the existing refresh path minimally**

Replace endpoint and parser selection inside `refreshSelectedProvider()` with:

```ts
		const provider = this.selectedProvider;
		const endpoint = provider === "openai-codex" ? CODEX_USAGE_ENDPOINT : provider ? ZAI_ENDPOINTS[provider] : undefined;
		if (!provider || !endpoint) return Promise.resolve();
```

After `response.json()`, select the parser without changing fetch/proxy construction:

```ts
					const payload = await response.json();
					const usage = provider === "openai-codex" ? parseCodexUsage(payload) : parseZaiUsage(payload);
```

Keep the existing `Authorization` header, timeout, abort, catch, cache, stale-provider guard, and single-flight cleanup unchanged.

- [ ] **Step 8: Run focused and neighboring tests**

Run:

```bash
cd .bangboo-build/upstream
npx biome check --write --error-on-warnings packages/coding-agent/src/core/provider-usage.ts packages/coding-agent/test/provider-usage.test.ts
cd packages/coding-agent
npm test -- provider-usage.test.ts
cd ../..
npx tsgo --noEmit
```

Expected: target-file Biome checks, all provider-usage tests, and upstream typecheck PASS without skips.

- [ ] **Step 9: Commit the staged implementation checkpoint**

Do not commit `.bangboo-build/upstream` directly because it is generated. Record the passing focused-test output and proceed to Task 2, where the tested files are captured into patch `0006`.

### Task 2: Capture the Patch and Verify Distribution

**Files:**
- Modify: `patches/0006-provider-usage-statusline.patch`
- Modify: `CHANGELOG.md`
- Modify: `test/integration/staged-package.test.ts`

**Interfaces:**
- Consumes: tested `parseCodexUsage` and Codex refresh behavior from Task 1.
- Produces: a replayable ordered patch and repository-level assertion that the Codex usage endpoint ships in the staged runtime.

- [ ] **Step 1: Add a failing staged-package assertion**

Extend `includes built-in provider usage tracking` in `test/integration/staged-package.test.ts`:

```ts
    expect(source).toContain('"https://chatgpt.com/backend-api/wham/usage"');
    expect(source).toContain("parseCodexUsage");
```

- [ ] **Step 2: Confirm the repository assertion is RED against the current patch**

First preserve the tested staged files outside the generated tree:

```bash
cp .bangboo-build/upstream/packages/coding-agent/src/core/provider-usage.ts /tmp/bangboo-provider-usage.ts
cp .bangboo-build/upstream/packages/coding-agent/test/provider-usage.test.ts /tmp/bangboo-provider-usage.test.ts
npm run test:integration -- test/integration/staged-package.test.ts
```

Expected: FAIL because a fresh staged runtime from the current `0006` patch lacks the Codex usage endpoint.

- [ ] **Step 3: Regenerate patch 0006 against patches 0001-0005**

Create a temporary checkout from the locked upstream baseline, apply and commit patches 0001-0005 as the diff base, apply the old 0006, replace the two tested files, and generate the replacement patch:

```bash
ROOT="$PWD"
LOCKED_COMMIT=$(node -p 'require("./upstream.lock.json").commit')
rm -rf /tmp/bangboo-patch-0006
git -C "$ROOT/.cache/pi-upstream" worktree prune
git -C "$ROOT/.cache/pi-upstream" worktree add --detach /tmp/bangboo-patch-0006 "$LOCKED_COMMIT"
for patch in "$ROOT"/patches/000{1..5}-*.patch; do
  git -C /tmp/bangboo-patch-0006 apply "$patch"
done
git -C /tmp/bangboo-patch-0006 add -A
git -C /tmp/bangboo-patch-0006 -c user.name=Bangboo -c user.email=build@bangboo.local commit -m "temporary patch base"
git -C /tmp/bangboo-patch-0006 apply "$ROOT/patches/0006-provider-usage-statusline.patch"
cp /tmp/bangboo-provider-usage.ts /tmp/bangboo-patch-0006/packages/coding-agent/src/core/provider-usage.ts
cp /tmp/bangboo-provider-usage.test.ts /tmp/bangboo-patch-0006/packages/coding-agent/test/provider-usage.test.ts
git -C /tmp/bangboo-patch-0006 add -N packages/coding-agent/src/core/provider-usage.ts packages/coding-agent/test/provider-usage.test.ts
git -C /tmp/bangboo-patch-0006 diff --binary > "$ROOT/patches/0006-provider-usage-statusline.patch"
```

Verify the generated patch contains only the intended original integration plus the new Codex parser/refresh/tests:

```bash
git -C /tmp/bangboo-patch-0006 diff --stat
grep -n "wham/usage\|parseCodexUsage" patches/0006-provider-usage-statusline.patch
```

Expected: patch stat lists the same five original files; grep finds the endpoint, parser, implementation call, and tests.

- [ ] **Step 4: Update release notes**

Add this bullet under `## 0.1.1` in `CHANGELOG.md`:

```markdown
- Fixed Codex quota reporting for the default WebSocket transport by refreshing the authenticated weekly usage endpoint through Bangboo's existing system-proxy-aware fetch path.
```

- [ ] **Step 5: Restage and run focused distribution verification**

Run:

```bash
npm run stage
npm test -- test/unit/staging.test.ts
npm run test:integration -- test/integration/staged-package.test.ts
npm run build
cd .bangboo-build/upstream/packages/coding-agent
npm test -- provider-usage.test.ts
```

Expected: patch replay PASS; repository unit/integration assertions PASS; provider-usage tests PASS without skips.

- [ ] **Step 6: Run full verification**

Run from the repository root:

```bash
npm run verify
npm run test:upstream
```

Expected: typecheck, all repository tests, brand verification, and upstream tests PASS. Report every skipped test explicitly; do not claim an unqualified pass if any test is skipped.

- [ ] **Step 7: Inspect final diff and commit**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: only `patches/0006-provider-usage-statusline.patch`, `CHANGELOG.md`, `test/integration/staged-package.test.ts`, and this implementation plan differ from the design-doc commit.

Commit:

```bash
git add patches/0006-provider-usage-statusline.patch CHANGELOG.md test/integration/staged-package.test.ts docs/superpowers/plans/2026-07-17-codex-websocket-quota.md
git commit -m "fix: show Codex quota with WebSocket transport"
```
