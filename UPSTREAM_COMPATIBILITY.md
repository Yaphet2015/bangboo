# Upstream compatibility

- Runtime: `0.80.7`
- Tag: `v0.80.7`
- Commit: `818d67457cdd6b60bce6b121d16b23141c252dd8`
- Status: validated

Validation covers the pristine upstream test suite before branding patches, patch replay checks, lower-runtime and Bangboo builds, brand/path/network assertions, current and historical extension imports, conventional package resources, packed installation, upgrade, executable entry, and uninstall smoke tests.

On macOS only, upstream regression `#5303` is excluded because its 50 ms shell-tick assertion is not reliable against the runtime's 100 ms idle grace on GitHub's ARM runners. The test runs and passes in both Linux jobs; all other upstream tests run on macOS.

On Windows only, nine pristine v0.80.7 test files are excluded because they encode POSIX-only permissions, signals, absolute paths, or glob behavior: `config.test.ts`, `footer-width.test.ts`, `interactive-mode-suspend.test.ts`, `package-command-paths.test.ts`, `sdk-session-manager.test.ts`, `2791-fswatch-error-crash.test.ts`, `3302-find-path-glob.test.ts`, `tools.test.ts`, and `trust-selector.test.ts`. Linux and macOS execute these files; Windows executes the rest of the upstream suite plus all Bangboo integration tests. The remaining Windows upstream files run serially. `footer-data-provider.test.ts` still runs on Windows, but in its own Vitest process, so its closed `fs.watch` handles cannot receive late libuv events while later Git-update fixtures replace unrelated temporary repositories.

Automated upgrade pull requests change the status to `pending CI validation`. A failing or conflicted upgrade remains a draft and must not be merged or published.
