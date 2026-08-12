# Native ACP Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bangboo acp`, a native ACP v1 stdio agent that lets bb run the installed Bangboo runtime with Bangboo credentials, models, sessions, extensions, and tools.

**Architecture:** Bangboo owns one `AgentSessionRuntime` per ACP process and exposes it through `@agentclientprotocol/sdk` 1.3.0. Protocol routing, runtime lifecycle, event translation, and permission policy are separate modules. Runtime changes are developed in the generated upstream checkout but shipped only as ordered patch `patches/0009-native-acp-mode.patch`; bb uses its existing `customAcpAgents` surface and receives no core code changes.

**Tech Stack:** TypeScript ESM, Node.js 22.19+, `@agentclientprotocol/sdk` 1.3.0, Bangboo/Pi-compatible runtime 0.83.0, Vitest 4, JSON-RPC over NDJSON stdio.

## Global Constraints

- Do not use or fall back to `pi`, `~/.pi`, or bb's built-in Pi provider.
- Preserve Bangboo isolation: global state under `~/.bangboo/agent`, project resources under `.bangboo/`.
- stdout contains ACP JSONL only; all diagnostics go to stderr.
- ACP protocol version is stable v1; do not import `@agentclientprotocol/sdk/experimental/v2`.
- Model selection uses standard `session/set_config_option` with category `model`; do not add legacy `session/set_model`.
- One active Bangboo session per ACP process; no fork, rename, archive, RPC UI bridge, or bb `auto` permission mode.
- Permission uncertainty fails closed. Extensions remain trusted local code and are not sandboxed.
- Do not commit `.bangboo-build/`; ship runtime source changes only through `patches/0009-native-acp-mode.patch`.
- Do not modify bb or bump `HOST_DAEMON_PROTOCOL_VERSION` in this plan.

## File Map

Runtime files carried by `patches/0009-native-acp-mode.patch`:

- `packages/coding-agent/src/modes/acp/acp-mode.ts` — stdio connection and ACP handler registration.
- `packages/coding-agent/src/modes/acp/session-host.ts` — Bangboo runtime creation, persistent new/load, model and thinking state.
- `packages/coding-agent/src/modes/acp/content.ts` — ACP prompt conversion and tool-kind/content normalization.
- `packages/coding-agent/src/modes/acp/event-mapper.ts` — pure Bangboo event to ACP update conversion.
- `packages/coding-agent/src/modes/acp/permission-gate.ts` — extension-backed tool permission broker and session approval cache.
- `packages/coding-agent/test/acp/*.test.ts` — focused protocol, runtime, mapper, and permission tests.
- `packages/coding-agent/src/main.ts`, `src/cli/args.ts`, `src/modes/index.ts` — CLI dispatch/help/exports.
- `packages/coding-agent/package.json`, root `package-lock.json` — exact ACP SDK dependency.
- `packages/coding-agent/docs/acp.md`, `README.md` — packaged usage and security docs.

Tracked Bangboo repository files:

- `patches/0009-native-acp-mode.patch` — all staged runtime changes above.
- `test/integration/staged-package.test.ts` — patch replay/source assertions.
- `test/integration/built-cli.test.ts` — built CLI ACP process smoke test.
- `test/integration/packed-cli.test.ts` — tarball dependency/help/initialize smoke test.
- `README.md`, `CHANGELOG.md` — distribution-level user documentation.

---

### Task 1: ACP Transport and CLI Entry

**Files:**
- Create in staged runtime: `packages/coding-agent/src/modes/acp/acp-mode.ts`
- Create in staged runtime: `packages/coding-agent/test/acp/acp-mode.test.ts`
- Modify in staged runtime: `packages/coding-agent/src/main.ts`
- Modify in staged runtime: `packages/coding-agent/src/cli/args.ts`
- Modify in staged runtime: `packages/coding-agent/src/modes/index.ts`
- Modify in staged runtime: `packages/coding-agent/package.json`
- Modify in staged runtime: `package-lock.json`
- Create/update tracked: `patches/0009-native-acp-mode.patch`

**Interfaces:**
- Produces `runAcpMode(options?: AcpModeOptions): Promise<void>`.
- Produces `createAcpAgentApp(options: AcpModeOptions): acp.AgentApp` for in-memory tests.
- `AcpModeOptions` initially carries `version?: string`; Task 2 extends it with `hostFactory`.

- [ ] **Step 1: Prepare a reproducible patch-development baseline**

```bash
cd /Users/phaethon/workspace/personal/bangboo
npm run stage
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "baseline: patches 0001-0008"
git -C .bangboo-build/upstream tag -f bangboo-acp-base
```

Expected: generated upstream is clean and `bangboo-acp-base` contains patches 0001–0008. Never push this generated commit.

- [ ] **Step 2: Write failing transport tests**

Create `test/acp/acp-mode.test.ts` using the SDK's in-memory stream pair through `acp.client(...).connectWith(...)`. Assert:

```ts
expect(initialize.protocolVersion).toBe(acp.PROTOCOL_VERSION);
expect(initialize.agentInfo).toMatchObject({ name: "bangboo", version: "0.1.1" });
expect(initialize.agentCapabilities).toMatchObject({ loadSession: true });
```

Also spawn `main(["acp", "--help"])` behind an injected runner and assert no normal interactive startup occurs.

- [ ] **Step 3: Run the tests and confirm the missing mode**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/acp-mode.test.ts
```

Expected: FAIL because `modes/acp/acp-mode.ts` and `runAcpMode` do not exist.

- [ ] **Step 4: Add the exact SDK dependency and minimal ACP app**

Add exact dependency:

```json
"@agentclientprotocol/sdk": "1.3.0"
```

Regenerate the upstream lock without lifecycle scripts:

```bash
cd .bangboo-build/upstream
npm install --package-lock-only --ignore-scripts
```

Implement the stdio transport using Node web streams:

```ts
const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
);
const connection = createAcpAgentApp(options).connect(stream);
await connection.closed;
```

Register `initialize`, return `acp.PROTOCOL_VERSION`, `agentInfo: { name: APP_NAME, version: VERSION }`, `loadSession: true`, and image prompt support. Register no capability that has no handler.

- [ ] **Step 5: Dispatch `bangboo acp` before normal CLI bootstrap**

In `main()`, after Bangboo environment/offline setup but before settings, migrations, or normal argument parsing:

```ts
if (args[0] === "acp") {
  if (args.length === 2 && (args[1] === "--help" || args[1] === "-h")) {
    process.stderr.write("Usage: bangboo acp\nACP v1 over stdin/stdout.\n");
    return;
  }
  if (args.length !== 1) throw new Error(`Unexpected bangboo acp argument: ${args[1]}`);
  await runAcpMode();
  return;
}
```

Add `bangboo acp` to `printHelp()` and export `runAcpMode` from `modes/index.ts`. Help goes to stderr for this stdio-only subcommand.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/acp-mode.test.ts
npm --prefix .bangboo-build/upstream/packages/coding-agent run build
```

Expected: PASS; build emits `dist/modes/acp/acp-mode.js`.

- [ ] **Step 7: Capture and commit the cumulative patch**

```bash
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "feat: add ACP transport entry"
git -C .bangboo-build/upstream diff --binary bangboo-acp-base..HEAD > patches/0009-native-acp-mode.patch
git add patches/0009-native-acp-mode.patch
git commit -m "feat: add native ACP transport"
```

---

### Task 2: Persistent Sessions, Models, and Thinking

**Files:**
- Create in staged runtime: `packages/coding-agent/src/modes/acp/session-host.ts`
- Create in staged runtime: `packages/coding-agent/test/acp/session-host.test.ts`
- Modify in staged runtime: `packages/coding-agent/src/modes/acp/acp-mode.ts`
- Update tracked: `patches/0009-native-acp-mode.patch`

**Interfaces:**
- Produces `interface AcpSessionHost` with `newSession`, `loadSession`, `setConfigOption`, `prompt`, `cancel`, and `dispose`.
- Produces `createBangbooSessionHost(options: { client: acp.AgentContext; extensionFactories: InlineExtension[] }): AcpSessionHost`.
- Produces `buildSessionConfig(session, models): acp.SessionConfigOption[]`.
- `AcpModeOptions.hostFactory` accepts `(client: acp.AgentContext) => AcpSessionHost` for deterministic tests.

- [ ] **Step 1: Write failing lifecycle and model tests**

Use an injected fake `AcpSessionHost` for protocol routing and real `SessionManager` fixtures for path lookup. Cover:

```ts
await expect(agent.newSession({ cwd: "relative", mcpServers: [] })).rejects.toMatchObject({ code: -32602 });
expect(newSession.configOptions?.find((o) => o.category === "model")?.currentValue).toBe("zai-coding-cn/glm-5");
expect(newSession.configOptions?.find((o) => o.category === "thought_level")?.currentValue).toBe("high");
```

Also assert non-empty `mcpServers` fail explicitly, loading an unknown ID fails, loading a session with another cwd fails, and model changes return refreshed config options.

- [ ] **Step 2: Verify failure**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/session-host.test.ts
```

Expected: FAIL because no session host exists.

- [ ] **Step 3: Implement runtime creation without duplicating CLI UI behavior**

Create a runtime factory using:

```ts
const settingsManager = SettingsManager.create(cwd, getAgentDir(), {
  projectTrusted: trustStore.get(cwd) === true,
});
const services = await createAgentSessionServices({
  cwd,
  agentDir: getAgentDir(),
  settingsManager,
  resourceLoaderOptions: { extensionFactories },
});
const created = await createAgentSessionFromServices({ services, sessionManager });
return { ...created, services, diagnostics: services.diagnostics };
```

New sessions use `SessionManager.create(cwd)`. Load resolves `SessionManager.list(cwd)` by exact `id`, verifies normalized cwd equality, then opens the exact `path`. Do not scan or read `~/.pi`.

Reject non-absolute cwd and non-empty MCP lists with `acp.RequestError.invalidParams(...)`. Reject runtime diagnostics of type `error` and missing authenticated model with actionable errors.

- [ ] **Step 4: Implement standard model and thought config options**

Represent model values as `${model.provider}/${model.id}`. Build flat select options from `await modelRuntime.getAvailable()`. Implement:

```ts
async setConfigOption({ sessionId, configId, value }) {
  if (configId === "model") await session.setModel(resolveAvailableModel(value));
  else if (configId === "thought_level") session.setThinkingLevel(validateLevel(value));
  else throw acp.RequestError.invalidParams({ configId }, "Unknown config option");
  return { configOptions: await buildSessionConfig(...) };
}
```

Offer exactly `session.getAvailableThinkingLevels()` for the selected model. Validate membership before calling `session.setThinkingLevel(value)` so unknown levels fail instead of being silently clamped.

- [ ] **Step 5: Register lifecycle handlers and safe shutdown**

Register `session/new`, `session/load`, and `session/set_config_option`. On connection close, `await host.dispose()`; disposal calls `session.abort()`, `settingsManager.flush()`, and `session.dispose()` exactly once.

- [ ] **Step 6: Run tests, regenerate the cumulative patch, and commit**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/acp-mode.test.ts test/acp/session-host.test.ts
npm --prefix .bangboo-build/upstream/packages/coding-agent run build
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "feat: add ACP session lifecycle"
git -C .bangboo-build/upstream diff --binary bangboo-acp-base..HEAD > patches/0009-native-acp-mode.patch
git add patches/0009-native-acp-mode.patch
git commit -m "feat: add ACP sessions and model controls"
```

---

### Task 3: Prompting, Streaming Events, and Cancellation

**Files:**
- Create in staged runtime: `packages/coding-agent/src/modes/acp/content.ts`
- Create in staged runtime: `packages/coding-agent/src/modes/acp/event-mapper.ts`
- Create in staged runtime: `packages/coding-agent/test/acp/content.test.ts`
- Create in staged runtime: `packages/coding-agent/test/acp/event-mapper.test.ts`
- Modify in staged runtime: `packages/coding-agent/src/modes/acp/session-host.ts`
- Modify in staged runtime: `packages/coding-agent/src/modes/acp/acp-mode.ts`
- Update tracked: `patches/0009-native-acp-mode.patch`

**Interfaces:**
- Produces `toBangbooPrompt(prompt: acp.ContentBlock[], imageSupported: boolean): { text: string; images: ImageContent[] }`.
- Produces `mapAgentSessionEvent(event: AgentSessionEvent): acp.SessionUpdate[]`.
- Produces `replaySessionHistory(sessionId: string, messages: AgentMessage[], client: acp.AgentContext): Promise<void>`.
- `AcpSessionHost.prompt(params): Promise<acp.PromptResponse>` serializes mapped notifications before resolving.

- [ ] **Step 1: Write failing pure conversion tests**

Cover text concatenation, base64 image conversion, unsupported audio/resource rejection, and tool mapping:

```ts
expect(mapAgentSessionEvent({ type: "tool_execution_start", toolCallId: "c1", toolName: "bash", args: { command: "pwd" } }))
  .toEqual([{ sessionUpdate: "tool_call", toolCallId: "c1", kind: "execute", status: "in_progress", rawInput: { command: "pwd" }, title: "bash" }]);
```

Assert text and thinking deltas map separately, edit details containing `patch`/`diff` become ACP `diff` content, failures end with status `failed`, and the same tool ID is retained. Add a history replay test proving stored user and assistant messages are emitted in order with stable per-message IDs before `session/load` resolves; stored tool results must be represented without re-executing tools. Add a usage test that reads `session.getContextUsage()` after settlement and emits `usage_update` only when both `tokens` and `contextWindow` are non-null.

- [ ] **Step 2: Verify failure**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/content.test.ts test/acp/event-mapper.test.ts
```

- [ ] **Step 3: Implement content conversion and event mapping**

Map tool kinds exactly:

```ts
const TOOL_KIND = {
  read: "read", edit: "edit", write: "edit",
  grep: "search", find: "search", ls: "search", bash: "execute",
} as const;
```

Text blocks join with `\n\n`; image blocks become Bangboo `ImageContent`. Unsupported blocks throw `RequestError.invalidParams`. Mapper functions remain pure and never write stdout.

- [ ] **Step 4: Implement ordered prompt notification delivery**

For each prompt, subscribe before calling `session.prompt()` and serialize notifications:

```ts
let delivery = Promise.resolve();
const unsubscribe = session.subscribe((event) => {
  for (const update of mapAgentSessionEvent(event)) {
    delivery = delivery.then(() => client.notify(acp.methods.client.session.update, { sessionId, update }));
  }
});
try {
  await session.prompt(text, { images, source: "rpc" });
  await delivery;
  return { stopReason: "end_turn" };
} finally {
  unsubscribe();
}
```

After `agent_settled`, call `session.getContextUsage()` and emit ACP `usage_update` with `used: tokens` and `size: contextWindow` when both values are known; omit the update when Bangboo reports an unknown post-compaction token count. Map abort to `cancelled`, identifiable context exhaustion to `max_tokens`, and refusal to `refusal`; otherwise propagate a safe protocol error. Register `session/prompt` and `session/cancel`; cancel calls `session.abort()` and waits for prompt settlement. Complete `session/load` by calling `replaySessionHistory()` after runtime restoration and before returning its config state, as required by ACP v1.

- [ ] **Step 5: Test cancellation ordering**

Add a fake session that emits a final failed tool update after abort. Assert the update arrives before the prompt response `{ stopReason: "cancelled" }` and no update appears after response completion.

- [ ] **Step 6: Run tests and commit cumulative patch**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp
npm --prefix .bangboo-build/upstream/packages/coding-agent run build
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "feat: stream Bangboo turns over ACP"
git -C .bangboo-build/upstream diff --binary bangboo-acp-base..HEAD > patches/0009-native-acp-mode.patch
git add patches/0009-native-acp-mode.patch
git commit -m "feat: stream ACP prompts and tools"
```

---

### Task 4: Fail-Closed Tool Permissions

**Files:**
- Create in staged runtime: `packages/coding-agent/src/modes/acp/permission-gate.ts`
- Create in staged runtime: `packages/coding-agent/test/acp/permission-gate.test.ts`
- Modify in staged runtime: `packages/coding-agent/src/modes/acp/session-host.ts`
- Update tracked: `patches/0009-native-acp-mode.patch`

**Interfaces:**
- Produces `createAcpPermissionExtension(broker: AcpPermissionBroker): InlineExtension`.
- Produces `AcpPermissionBroker.request(event: ToolCallEvent): Promise<"allow" | "deny">` and `cancelPending(): void`.
- Session host injects this extension into `createAgentSessionServices(...resourceLoaderOptions.extensionFactories)`.

- [ ] **Step 1: Write failing permission policy tests**

Test all policy branches with a fake ACP client:

- `read`, `grep`, `find`, and `ls` execute without request;
- `edit`, `write`, `bash`, and unknown tools request permission;
- allow-once permits one call;
- allow-always caches by tool name for the ACP process session;
- reject, cancelled outcome, malformed response, thrown request, disconnect, and cancellation return `{ block: true }`;
- cancelling a prompt settles every pending permission request.

Assert the request includes `toolCallId`, title, mapped kind, and `rawInput`; bash exposes `rawInput.command` so bb can render the command.

- [ ] **Step 2: Verify failure**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp/permission-gate.test.ts
```

- [ ] **Step 3: Implement the extension gate**

Register a `tool_call` handler:

```ts
api.on("tool_call", async (event) => {
  if (READ_ONLY_TOOLS.has(event.toolName)) return undefined;
  const decision = await broker.request(event);
  return decision === "allow" ? undefined : { block: true, reason: "Tool execution denied by ACP client" };
});
```

Offer options with IDs `allow_once`, `allow_session`, and `deny`, using ACP kinds `allow_once`, `allow_always`, and `reject_once`. Cache only when the selected option is `allow_session`. Never persist approvals to Bangboo settings.

- [ ] **Step 4: Tie cancellation and shutdown to permission cleanup**

`session/cancel` and `dispose()` call `broker.cancelPending()` before abort/dispose. Any request whose client context signal aborts resolves deny. Ensure no unhandled rejected promise remains.

- [ ] **Step 5: Run ACP tests and commit cumulative patch**

```bash
npm --prefix .bangboo-build/upstream/packages/coding-agent test -- test/acp
npm --prefix .bangboo-build/upstream/packages/coding-agent run build
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "feat: gate ACP tool execution"
git -C .bangboo-build/upstream diff --binary bangboo-acp-base..HEAD > patches/0009-native-acp-mode.patch
git add patches/0009-native-acp-mode.patch
git commit -m "feat: enforce ACP tool permissions"
```

---

### Task 5: Documentation, Patch Replay, and Packaged CLI Verification

**Files:**
- Create in staged runtime: `packages/coding-agent/docs/acp.md`
- Modify in staged runtime: `packages/coding-agent/README.md`
- Modify tracked: `README.md`
- Modify tracked: `CHANGELOG.md`
- Modify tracked: `test/integration/staged-package.test.ts`
- Modify tracked: `test/integration/built-cli.test.ts`
- Modify tracked: `test/integration/packed-cli.test.ts`
- Finalize tracked: `patches/0009-native-acp-mode.patch`

**Interfaces:**
- Documents provider ID `acp-bangboo` and exact `customAcpAgents` configuration.
- Provides a process smoke client that uses `@agentclientprotocol/sdk` against built and packed Bangboo.

- [ ] **Step 1: Write failing repository integration assertions**

In staged-package tests assert:

```ts
expect(manifest.dependencies).toMatchObject({ "@agentclientprotocol/sdk": "1.3.0" });
await expect(readFile(new URL("src/modes/acp/acp-mode.ts", packageRoot), "utf8")).resolves.toContain("session/set_config_option");
```

In built and packed tests spawn `bangboo acp`, send an ACP `initialize` request, assert Bangboo identity/version, close stdin, and require exit code 0. Capture stderr separately and assert stdout parses entirely as JSONL.

- [ ] **Step 2: Run tests and confirm documentation/package gaps**

```bash
npm run test:integration -- test/integration/staged-package.test.ts test/integration/built-cli.test.ts test/integration/packed-cli.test.ts
```

Expected: FAIL until docs, final patch, and packaged dependency are present.

- [ ] **Step 3: Add packaged and distribution documentation**

Document this exact bb configuration:

```json
{
  "customAcpAgents": [
    {
      "id": "bangboo",
      "displayName": "Bangboo",
      "command": "bangboo",
      "args": ["acp"]
    }
  ]
}
```

State that an absolute command path is required when bb's host daemon PATH cannot resolve Bangboo. Document `~/.bangboo/agent`, saved project trust, supported model/thinking/cancel/permission behavior, unsupported fork/rename/archive/auto/RPC UI, non-empty MCP server rejection, and trusted-extension limitation.

- [ ] **Step 4: Regenerate patch and prove clean replay**

```bash
git -C .bangboo-build/upstream add -A
git -C .bangboo-build/upstream -c user.name=Bangboo -c user.email=dev@bangboo.local commit -m "docs: document native ACP mode"
git -C .bangboo-build/upstream diff --binary bangboo-acp-base..HEAD > patches/0009-native-acp-mode.patch
rm -rf .bangboo-build/upstream
npm run stage
```

Expected: patches 0001–0009 apply from the locked commit with no generated checkout edits.

- [ ] **Step 5: Run focused and full verification**

```bash
npm run typecheck
npm test
npm run test:integration
npm run verify
npm run build
npm run pack
```

Expected: every test runs with no skips; `artifacts/bangboo-0.1.1.tgz` is produced; no credential or session data appears in git status.

- [ ] **Step 6: Commit docs and integration verification**

```bash
git add patches/0009-native-acp-mode.patch README.md CHANGELOG.md \
  test/integration/staged-package.test.ts \
  test/integration/built-cli.test.ts \
  test/integration/packed-cli.test.ts
git commit -m "docs: document bb ACP integration"
```

---

### Task 6: Install and Configure the Local bb Integration

**Files:**
- Runtime installation: global npm Bangboo link
- User configuration: `~/.bb/config.json` (preserve every unrelated key)

**Interfaces:**
- Makes provider `acp-bangboo` discoverable by the user's local bb.

- [ ] **Step 1: Link the verified Bangboo build globally**

```bash
cd /Users/phaethon/workspace/personal/bangboo
npm run link:global
bangboo --version
bangboo --help | grep 'bangboo acp'
```

Expected: version identifies Bangboo 0.1.1/runtime 0.83.0 and help lists `acp`.

- [ ] **Step 2: Merge `customAcpAgents` without overwriting bb configuration**

Use a Node script that parses existing `~/.bb/config.json` or `{}`, removes only a previous entry with `id === "bangboo"`, and appends:

```json
{
  "id": "bangboo",
  "displayName": "Bangboo",
  "command": "/Users/phaethon/.nvm/versions/node/v24.18.0/bin/bangboo",
  "args": ["acp"]
}
```

Write atomically through a sibling temporary file and rename. Do not print config values other than the Bangboo entry.

- [ ] **Step 3: Refresh bb and verify provider discovery**

```bash
npx bb-app config refresh
npx --package bb-app bb provider list --json
npx --package bb-app bb provider models acp-bangboo --json
```

Expected: provider list contains `acp-bangboo`; model list contains authenticated Bangboo `provider/model` IDs and their supported reasoning levels. If bb is not running, restart it and rerun discovery rather than treating refresh failure as success.

- [ ] **Step 4: Run a real bb smoke thread**

Resolve IDs from CLI JSON rather than guessing them:

```bash
BB="npx --package bb-app bb"
STATUS_JSON="$($BB status --json)"
PROJECT_ID="$(printf '%s' "$STATUS_JSON" | node -e '
  let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => {
    const id = JSON.parse(s).project?.id;
    if (id) process.stdout.write(id);
  });
')"
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID="$($BB project list --include-personal --json | node -e '
    let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => {
      const projects = JSON.parse(s);
      if (!Array.isArray(projects) || !projects[0]?.id) process.exit(1);
      process.stdout.write(projects[0].id);
    });
  ')"
fi
MODEL_ID="$($BB provider models acp-bangboo --json | node -e '
  let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => {
    const models = JSON.parse(s);
    if (!Array.isArray(models) || !models[0]?.model) process.exit(1);
    process.stdout.write(models[0].model);
  });
')"
SPAWN_JSON="$($BB thread spawn --project "$PROJECT_ID" \
  --provider acp-bangboo --model "$MODEL_ID" \
  --permission-mode full --prompt "Reply only with: bangboo-acp-ok" --json)"
THREAD_ID="$(printf '%s' "$SPAWN_JSON" | node -e '
  let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => {
    const id = JSON.parse(s).id;
    if (!id) process.exit(1);
    process.stdout.write(id);
  });
')"
$BB thread wait "$THREAD_ID"
$BB thread output "$THREAD_ID"
```

Expected exact assistant output: `bangboo-acp-ok`. If no project or model is returned, stop and report that concrete blocker.

- [ ] **Step 5: Report deployment evidence**

Report the installed Bangboo version, provider/model discovery, smoke thread ID/output, repository commits, all verification commands, and any remaining ACP limitations. This task changes user configuration only and requires no repository commit.
