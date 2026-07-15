# Upstream compatibility

- Runtime: `0.80.7`
- Tag: `v0.80.7`
- Commit: `818d67457cdd6b60bce6b121d16b23141c252dd8`
- Status: validated

Validation covers the pristine upstream test suite before branding patches, patch replay checks, lower-runtime and Bangboo builds, brand/path/network assertions, current and historical extension imports, conventional package resources, packed installation, upgrade, executable entry, and uninstall smoke tests.

On macOS only, upstream regression `#5303` is excluded because its 50 ms shell-tick assertion is not reliable against the runtime's 100 ms idle grace on GitHub's ARM runners. The test runs and passes in both Linux jobs; all other upstream tests run on macOS.

Automated upgrade pull requests change the status to `pending CI validation`. A failing or conflicted upgrade remains a draft and must not be merged or published.
