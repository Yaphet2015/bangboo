# Changelog

## Unreleased

- Upgraded the pinned upstream runtime from 0.84.1 to 0.87.1 (commit f07218c4). All nine Bangboo patches were rebased: the bootstrap moved to `src/cli/setup.ts`, share handling moved to `session-share.ts`, runtime builds now include chord/durable/sqlite-node/server, and the brand sweep covers the new managed-installer strings.
- Staging installs of the ACP SDK now pass `--min-release-age=0` because upstream's `.npmrc` gate would otherwise reject a runtime published less than two days ago.
- Extension version probes now resolve `@earendil-works/pi-coding-agent` to a `pi-compat/entry` facade one level below the version-stamped manifest, so extensions that sniff the runtime version (for example pi-web-access's dynamic tool activation) see 0.87.1 instead of Bangboo's own package version.

- Fixed background pi-subagents children failing with "neither is available": staging now stamps the `pi-compat` facade with the locked upstream runtime version so the plugin's host peer-alias resolution (chord gate) matches the runtime, and the facade mirrors that version in tests.
- Removed built-in provider usage statusline. Use a user-installed provider usage extension instead.
- Added `setStatus(..., { align: "right" })` so footer statuses can sit under the provider and model.

## 0.1.1

- Added native ACP mode for bb and other ACP clients, including sessions, model/thinking selection, cancellation, and tool permission requests.
- Added footer reporting for remaining Codex weekly quota and actual-window Z.AI Coding Plan quota.
- Fixed Codex quota reporting for the default WebSocket transport by refreshing the authenticated weekly usage endpoint through Bangboo's existing system-proxy-aware fetch path.

## 0.1.0

- Introduced the independently versioned `bangboo` npm CLI.
- Added isolated `~/.bangboo/agent/` and `.bangboo/` data locations.
- Preserved current and historical community extension import compatibility.
- Disabled upstream product telemetry, announcements, update services, and default sharing.
- Added pinned-source staging, brand auditing, compatibility tests, scheduled upstream checks, and provenance publishing.
