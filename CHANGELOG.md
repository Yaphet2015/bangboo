# Changelog

## Unreleased

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
