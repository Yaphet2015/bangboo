# Codex WebSocket Quota Design

## Goal

Show OpenAI Codex subscription quota in Bangboo's built-in footer when the active model uses either WebSocket or SSE transport.

This design supersedes the OpenAI Codex data-flow section of `2026-07-16-provider-usage-statusline-design.md`. The Z.AI design remains unchanged.

## Root Cause

Bangboo defaults provider transport to `auto`, and the `openai-codex` provider prefers WebSocket. The existing quota implementation only receives Codex quota metadata through the provider `onResponse` callback, which is invoked by the SSE path but not by the WebSocket path.

A live proxy-aware probe confirmed that the WebSocket handshake succeeds with status 101 but contains no `x-codex-*` quota headers. The handshake therefore cannot supply quota data.

A second proxy-aware probe confirmed that the authenticated Codex usage endpoint returns quota data:

- Endpoint: `https://chatgpt.com/backend-api/wham/usage`
- Authentication: `Authorization: Bearer <OAuth access token>`
- The endpoint succeeds without a `chatgpt-account-id` header.
- Weekly quota may be reported as `rate_limit.primary_window`; it must not be assumed to be the secondary window.

## Data Flow

After an agent run settles while `openai-codex` is selected, `ProviderUsageTracker` resolves the provider credential through the existing model registry and requests the Codex usage endpoint.

The parser examines `rate_limit.primary_window` and `rate_limit.secondary_window`, selects a valid weekly window whose `limit_window_seconds` is 604800, and converts `used_percent` to remaining percentage using `100 - usedPercent`. The existing percentage rounding and clamping rules remain unchanged.

The existing SSE response-header parser remains as an immediate opportunistic update path. A successful usage-endpoint refresh replaces that provider's cached value. Unsupported providers still clear the footer status.

There is no startup request or background timer. Refreshes occur only after settled Codex runs, matching the existing Z.AI refresh lifecycle. At most one provider quota request may be active at a time.

## Proxy and Networking

The implementation uses the runtime's existing global `fetch` and does not construct a separate dispatcher. This preserves Bangboo's existing `undici.EnvHttpProxyAgent` behavior and therefore follows:

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `NO_PROXY`
- Bangboo's `httpProxy` setting, which populates proxy environment variables when configured

The request uses the existing short timeout and abort lifecycle. It sends the OAuth access token only in the `Authorization` header and never logs, persists, or includes it in status text or errors.

## Error Handling

Quota is optional UI metadata. Missing credentials, non-success responses, timeouts, cancellation, malformed JSON, and schema changes must not fail or delay the model turn.

A failed refresh preserves the last valid value for the currently selected provider. A value fetched for a provider that is no longer selected is cached for that provider but not published into another provider's footer status.

## Testing

Focused staged-runtime tests cover:

- Parsing a weekly Codex `primary_window` response.
- Parsing a weekly Codex `secondary_window` response.
- Ignoring malformed and non-weekly windows.
- Used-to-remaining conversion, rounding, and clamping.
- Fetching the Codex usage endpoint after a settled-provider refresh.
- Sending the bearer token without requiring `chatgpt-account-id`.
- Using the supplied/global fetch function rather than creating a proxy dispatcher.
- Preserving the last valid Codex value after network or parsing failure.
- Existing single-flight, provider-switch isolation, SSE-header, and Z.AI behavior remaining intact.

Repository verification runs the focused staged-runtime test and `npm run verify` without skipped tests.

## Success Criteria

1. With `transport: "auto"` or `transport: "websocket"`, a settled `openai-codex` run publishes `(XX% weekly)` from the authenticated usage endpoint.
2. With `transport: "sse"`, existing response-header updates remain supported and the settled-run refresh also works.
3. The request follows Bangboo's existing system-proxy dispatcher configuration.
4. Quota failures never affect model execution and preserve the last valid active-provider value.
5. Focused tests and `npm run verify` pass without skipped tests.
