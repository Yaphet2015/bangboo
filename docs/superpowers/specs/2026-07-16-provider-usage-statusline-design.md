# Provider Usage Statusline Design

## Goal

Show the active subscription provider's remaining quota in Bangboo's built-in footer without replacing the existing footer.

Supported providers:

- `openai-codex`
- `zai` (Z.AI Coding Plan Global)
- `zai-coding-cn` (Z.AI Coding Plan China)

The percentage always means **remaining quota**, not consumed quota.

## Display

The status is a compact parenthesized suffix on the existing footer status area:

- Codex weekly window: `(72% weekly)`
- Z.AI provider-reported five-hour window: `(72% 5h)`
- Other provider-reported windows use an honest compact label derived from their duration.

Percentages are clamped to `0..100` and rounded to the nearest integer. Bangboo must not label a non-weekly Z.AI quota as weekly.

The indicator is shown only when Bangboo has a valid quota value for the active supported provider. It is cleared when the user switches to an unsupported provider. A provider switch must not reuse another provider's cached value.

## Architecture

Implement this as Bangboo runtime behavior in a new ordered patch rather than as a user-installed extension. The patch adds a small provider-usage status module with three responsibilities:

1. Normalize provider-specific usage data into `{ remainingPercent, windowLabel }`.
2. Coordinate refreshes for the active model provider.
3. Publish or clear one footer status entry through the existing footer status mechanism.

The module remains independent from footer layout. The existing footer continues to own sanitization, ordering, width truncation, and rendering.

## Data Flow

### OpenAI Codex

After an `openai-codex` provider response, inspect the normalized response headers. Select the secondary/weekly Codex limit when its advertised window is one week. Convert `used-percent` to remaining percentage with `100 - usedPercent`.

Do not issue a separate Codex usage request. If the expected weekly headers are absent or invalid, leave the previous valid Codex value unchanged during that provider selection.

### Z.AI Coding Plans

After an agent run settles while `zai` or `zai-coding-cn` is active, resolve the provider credential through the existing model/auth registry and request that provider's quota-monitor endpoint:

- Global: `https://api.z.ai/api/monitor/usage/quota/limit`
- China: `https://open.bigmodel.cn/api/monitor/usage/quota/limit`

Parse the provider's quota response and choose the applicable token quota window. Prefer explicit remaining percentage data; otherwise derive remaining percentage from a valid consumed percentage. Derive the compact window label from response metadata rather than assuming it is weekly.

At most one Z.AI quota request may be active at a time. Refreshes happen after settled runs only; there is no startup request, interval, or background timer.

## Error Handling and Security

Quota reporting is optional UI metadata. Missing headers, unavailable credentials, non-success responses, timeouts, malformed JSON, schema changes, and cancellation must never fail or delay the model turn.

- Do not log, persist, or expose credentials.
- Do not include credentials in errors or status text.
- Apply a short request timeout.
- Preserve the last valid value for the currently selected provider after a transient refresh failure.
- Clear status on unsupported-provider selection.
- Dispose or abort in-flight quota work during session shutdown/reload.

## Testing

Use test-driven development in the staged upstream runtime. Focused tests cover:

- Codex weekly-header selection and used-to-remaining conversion.
- Ignoring Codex non-weekly or malformed limits.
- Parsing Z.AI remaining and consumed percentages.
- Honest Z.AI window-label formatting.
- Percentage rounding and clamping.
- Provider selection, provider-switch clearing, and stale-value isolation.
- Malformed/network failure behavior preserving the last valid active-provider value.
- Single-flight Z.AI refresh behavior.

Repository integration coverage verifies that the new patch applies cleanly, is included in the ordered series, and survives the normal Bangboo build/typecheck/brand verification flow.

## Success Criteria

1. After a successful Codex response with weekly quota headers, the footer shows `(XX% weekly)` where `XX` is remaining quota.
2. After a settled Z.AI Coding Plan run with valid quota data, the footer shows `(XX% <actual-window>)` for both Global and China providers.
3. Unsupported providers show no usage indicator.
4. Quota lookup or parsing failures never affect agent execution.
5. Focused tests and `npm run verify` pass without skipped tests.
