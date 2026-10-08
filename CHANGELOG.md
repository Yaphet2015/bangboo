# Changelog

## Unreleased

- Upgraded the pinned upstream runtime to 1.1.0 (commit abe508e1) and aligned the Bangboo version with it.
- Swept the remaining legacy brand strings: the /bug command and report copy now name the upstream maintainers instead of the upstream name, exported bug-report archives and share gists use Bangboo names, and the share temp prefix is bangboo-branded. The four affected files joined the brand audit with allowlists for the two share-viewer wire-format identifiers.
- Removed the post-update hint that told npm installs to run the upstream installer script; the hint would have replaced Bangboo with the upstream CLI.
- Staging is now idempotent: a bare `npm run stage` (for example from the staged-package test) skips the worktree reset when the staged tree already mirrors the lock and no staging input changed, so the globally linked CLI keeps working between verifies. `--force` restores the always-reset behavior.
- `npm run link:global` links the built CLI through a dedicated script instead of `npm link`, which packed the staged package and extracted the tarball over the staged directory, dropping src/ and test/. All nine Bangboo patches were rebased: the runtime build order now mirrors upstream's restructured workspace (`agent-core` moved to `packages/agent`, `session-backends` was removed, `codemode`/`mcp`/`env` were added), the ACP SDK no longer needs hand-maintained `package-lock` surgery because nothing consumes the root lock after patching, and the brand sweep covers new v1.1.0 strings (the update-banner changelog link, the Radius login intro, and the Earendil announcement easter egg) with `verify-brand` allowlisting the remaining compatibility identifiers.
- Staging installs of the ACP SDK now pass `--min-release-age=0` because upstream's `.npmrc` gate would otherwise reject a runtime published less than two days ago.
- Extension version probes now resolve `@earendil-works/pi-coding-agent` to a `pi-compat/entry` facade one level below the version-stamped manifest, so extensions that sniff the runtime version (for example pi-web-access's dynamic tool activation) see 1.1.0 instead of Bangboo's own package version.

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
