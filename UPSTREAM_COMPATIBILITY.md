# Upstream compatibility

- Runtime: `1.1.0`
- Tag: `v1.1.0`
- Commit: `abe508e1b89912adde45528136c3221eb69acdd7`
- Status: pending CI validation

Validation covers the pristine upstream test suite before branding patches, patch replay checks, lower-runtime and Bangboo builds, brand/path/network assertions, current and historical extension imports, conventional package resources, packed installation, upgrade, executable entry, and uninstall smoke tests.

On macOS only, upstream regression `#5303` is excluded because its 50 ms shell-tick assertion is not reliable against the runtime's 100 ms idle grace on GitHub's ARM runners. The test runs and passes in both Linux jobs; all other upstream tests run on macOS.

On Windows only, ten pristine upstream test files are excluded because they encode POSIX-only permissions, signals, absolute paths, glob behavior, or unsafe Windows watcher teardown: `config.test.ts`, `footer-data-provider.test.ts`, `footer-width.test.ts`, `interactive-mode-suspend.test.ts`, `package-command-paths.test.ts`, `sdk-session-manager.test.ts`, `2791-fswatch-error-crash.test.ts`, `3302-find-path-glob.test.ts`, `tools.test.ts`, and `trust-selector.test.ts`. The watcher test is excluded because it removes its watched temporary Git directory before Windows libuv has completed `fs.watch` teardown, triggering Node's `fs-event.c` assertion even when that file runs alone. Linux and macOS execute these files; Windows executes the rest of the upstream suite serially plus all Bangboo integration tests.

Automated upgrade pull requests change the status to `pending CI validation`. A failing or conflicted upgrade remains a draft and must not be merged or published.
