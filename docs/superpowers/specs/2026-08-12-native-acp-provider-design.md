# Native ACP Provider Design

**Date:** 2026-08-12
**Status:** Approved

## Objective

Make bb run the installed Bangboo agent itself, without using bb's built-in Pi provider and without bundling Bangboo into bb. Bangboo will expose a native Agent Client Protocol (ACP) v1 server over stdin/stdout, launched by bb as `bangboo acp`.

The first release changes Bangboo only. Users register it through bb's existing `customAcpAgents` configuration. Automatic Bangboo discovery in bb is a later, separately scoped upstream change.

## Success Criteria

- bb can launch the system-installed Bangboo executable as an ACP provider.
- The launched process uses Bangboo's runtime, `~/.bangboo/agent` credentials and settings, project `.bangboo/` resources, extensions, and skills.
- No Pi process, Pi configuration, or bb Pi provider is used as an implementation or fallback.
- bb can discover models, create and restore sessions, select a model and thinking level, stream assistant and tool activity, cancel work, and enforce its supported ACP permission modes.
- ACP stdout contains only protocol JSONL. Diagnostics go to stderr.
- The packed npm CLI exposes and verifies `bangboo acp`.

## Architecture

```text
bb host daemon
  └─ starts: bangboo acp
       └─ Bangboo ACP mode
            ├─ @agentclientprotocol/sdk
            ├─ Bangboo AgentSessionRuntime
            ├─ ~/.bangboo/agent credentials and settings
            └─ current workspace and project .bangboo resources
```

Bangboo adds `@agentclientprotocol/sdk` and implements the agent side with the SDK's current fluent `agent()` API. The ACP mode directly creates and owns Bangboo `AgentSessionRuntime` instances. It does not translate ACP into Bangboo's existing RPC mode and does not launch another CLI process.

Bangboo is maintained as a pinned upstream runtime plus ordered patches. The implementation therefore ships as a new patch, initially `patches/0009-native-acp-mode.patch`, rather than direct edits to the generated `.bangboo-build/` checkout. Staging must replay the patch against the locked upstream source.

## CLI Surface

The canonical entry point is:

```bash
bangboo acp
```

It starts an ACP v1 server over stdin/stdout and runs until the client disconnects or terminates it. The command must appear in `bangboo --help`.

The first bb integration uses `~/.bb/config.json`:

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

An absolute executable path may be used when the host daemon's PATH does not include Bangboo. The resulting bb provider ID is `acp-bangboo`.

## ACP Lifecycle

### Initialization

`initialize` negotiates ACP protocol version 1 and returns Bangboo's name, version, and capabilities. A mismatched protocol version is rejected rather than partially accepted.

Bangboo does not advertise an ACP authentication flow in the first release. It resolves credentials through its normal isolated configuration under `~/.bangboo/agent` and its existing environment-variable support.

Advertised capabilities include:

- text prompts;
- image prompts when the selected Bangboo model supports images;
- persistent session loading;
- model selection;
- session configuration for thinking level.

Capabilities that are not implemented are omitted.

### Session Creation

`session/new` requires an absolute `cwd`. It creates a persistent Bangboo session through `AgentSessionRuntime`, using the supplied workspace and Bangboo's normal resource discovery. The response contains:

- Bangboo's session ID;
- available authenticated models and the current model;
- a model config option when required by ACP clients;
- a `thought_level` select option with values supported by the current model.

For bb compatibility, MCP server metadata supplied by the client is accepted but ignored. Bangboo must not connect to those servers, inject MCP extensions, or expose their tools.

### Session Loading

`session/load` restores the exact Bangboo session by ID for the requested `cwd`, rebinds runtime event subscriptions and extensions, and replays conversation updates as required by ACP v1 before responding.

A missing, corrupt, or workspace-incompatible session fails explicitly. Bangboo does not silently create a replacement. bb may apply its existing client-side fallback to a fresh session and display its own warning.

### Model and Thinking Selection

`session/set_config_option` is the canonical ACP v1 selection surface. A config option with category `model` resolves an advertised Bangboo `provider/model` value and calls `session.setModel()`. A config option with category `thought_level` maps to `session.setThinkingLevel()`. Unknown models and unsupported levels fail instead of being silently accepted or clamped. The returned config state refreshes available thinking values after model selection changes.

Bangboo does not implement the legacy non-standard `session/set_model` method. bb prefers the standard model config option when an agent advertises it and uses `session/set_model` only for older agents that expose session model state without a model config option.

### Prompting and Cancellation

`session/prompt` accepts ACP text blocks and images only when advertised. Unsupported content types return an invalid-params error. Accepted content is converted to Bangboo prompt input and passed to `session.prompt()`.

`session/cancel` calls `session.abort()`. Bangboo sends any final tool updates before completing the pending prompt with stop reason `cancelled`.

The initial implementation owns one active Bangboo session per ACP process. bb launches one ACP process per thread, so no multi-session scheduler is needed.

## Event Mapping

Bangboo subscriptions produce ACP `session/update` notifications:

| Bangboo event | ACP update |
| --- | --- |
| Assistant text delta | `agent_message_chunk` |
| Assistant thinking delta | `agent_thought_chunk` |
| Tool execution start | `tool_call` with `in_progress` status |
| Tool execution update | `tool_call_update` |
| Tool execution end | `tool_call_update` with `completed` or `failed` status |
| Edit/write result | Tool content containing an ACP `diff` block |
| Final session usage when available | `usage_update` |

Tool call IDs remain stable from start through completion. Tool names map to ACP kinds as follows: read to `read`; edit/write to `edit`; grep/find/ls to `search`; bash to `execute`; unknown extension tools to `other`.

The pending `session/prompt` request completes only after the Bangboo agent turn and all tool activity settle. Normal completion maps to `end_turn`; abort maps to `cancelled`; model token exhaustion maps to `max_tokens` when distinguishable; refusal maps to `refusal`; otherwise an accepted-turn failure is returned as a protocol error with the original safe error summary.

## Permissions

ACP mode installs an internal Bangboo permission gate before agent-requested tools execute:

- read-only built-ins may execute without a permission request;
- `edit`, `write`, and `bash` request permission through `session/request_permission`;
- unknown extension tools request permission by default;
- denial, cancellation, malformed replies, client disconnection, and request failure block execution;
- pending permission requests are cancelled when the prompt or session stops.

The request includes a stable tool call ID, title, ACP kind, and raw command/input when safe and available. It offers allow-once, allow-for-session, and deny choices where the client can represent them. A per-session approval cache implements allow-for-session without changing persisted Bangboo settings.

bb's `full` mode automatically approves through its ACP bridge. bb's `accept-edits` mode surfaces approval according to bb policy. Bangboo does not advertise or emulate bb's `auto` mode.

This gate controls model-initiated tool calls. Bangboo extensions remain trusted local code and may execute arbitrary code while loading; ACP is not an extension sandbox. This limitation must be documented.

## Error Handling and Shutdown

- stdout is reserved exclusively for ACP JSONL frames;
- logs, startup diagnostics, extension warnings, and stack traces go to stderr;
- unknown methods return JSON-RPC method-not-found;
- malformed parameters return invalid-params;
- no authenticated model causes `session/new` to fail with actionable guidance;
- loading a missing or corrupt session fails without replacement;
- model and thinking selection failures identify the rejected value;
- tool permission uncertainty fails closed;
- client EOF or process termination aborts active work, settles pending permission requests, disposes the runtime, and flushes session/settings persistence where applicable.

Errors exposed over ACP include useful safe summaries but never credentials, authorization headers, or full environment dumps.

## Explicit First-Release Limits

The first release does not implement:

- ACP session fork;
- provider-native rename or archive;
- bb `auto` permission mode;
- Bangboo RPC extension-dialog/UI subprotocol bridging;
- multiple concurrent sessions in one Bangboo ACP process;
- bb core changes, automatic discovery, provider installation, or provider updating.

These match bb's current generic ACP boundary. Missing features must not be advertised.

## Testing

### Protocol Unit Tests

Use deterministic fake model/runtime dependencies to test:

- version negotiation and capability declaration;
- absolute-`cwd` validation;
- new and loaded sessions;
- missing and corrupt session errors;
- model discovery and selection;
- per-model thinking options and invalid levels;
- text and image prompts;
- text, thinking, usage, tool, diff, and failure event mapping;
- stable tool IDs;
- permission allow-once, allow-for-session, deny, cancel, malformed reply, and disconnect;
- cancellation ordering and stop reasons;
- stdout protocol purity.

Tests must encode that bb is running Bangboo's isolated runtime and that neither `~/.pi` nor bb's Pi bridge is consulted.

### Process Integration Tests

Build and spawn the staged `bangboo acp`, communicate through stdio using the official ACP client SDK, and exercise:

1. initialize;
2. session creation and model state;
3. a fake-model prompt with streamed text;
4. a tool call and permission decision;
5. cancellation;
6. process shutdown;
7. session loading in a new process.

No test requires external credentials or a paid provider.

### bb Compatibility Smoke Test

Exercise the packaged Bangboo CLI through bb's ACP client/bridge contract and verify model discovery, initial prompt, tool activity, stop, and resume. This may live as a bounded integration fixture in Bangboo initially; a later bb upstream change can add Bangboo to bb's known-agent coverage.

### Release Verification

Run:

```bash
npm run typecheck
npm test
npm run test:integration
npm run verify
npm run build
npm run pack
```

Install the generated tarball in an isolated prefix and confirm that `bangboo --help` lists `acp` and that an ACP initialize/new-session smoke test succeeds.

## Documentation

Update Bangboo's README and CLI help, and add an ACP integration guide covering:

- `bangboo acp`;
- bb `customAcpAgents` configuration;
- PATH versus absolute command paths;
- use of `~/.bangboo/agent` and `.bangboo/`;
- model authentication prerequisites;
- supported permissions and their security boundary;
- first-release limitations;
- troubleshooting protocol logs on stderr.

## Evolution

After the custom ACP integration is stable, a separate bb contribution may make Bangboo a known ACP agent by adding PATH detection, branding, documentation, provider CLI health, and optional multi-machine install/update support. It should continue launching the user's installed Bangboo executable.

Only demonstrated gaps that ACP cannot express justify a dedicated Bangboo RPC adapter in bb. Bangboo is not bundled into bb, and the two projects remain independently upgradable through the ACP contract.

Because the first release changes no bb server/daemon wire payload, it does not require a `HOST_DAEMON_PROTOCOL_VERSION` bump. A future bb change must reassess that requirement against its actual wire changes.
