# Bangboo

Bangboo is a branded terminal coding agent distributed as the `bangboo` npm CLI. Its agent loop, model providers, terminal UI, session format, and extension loader are built from a pinned Pi-compatible runtime while Bangboo keeps its own product identity and data directories.

The initial release is Bangboo `0.1.0`, built from runtime `0.80.7` at upstream tag `v0.80.7` and commit `818d67457cdd6b60bce6b121d16b23141c252dd8`.

## Install

Bangboo requires Node.js 22.19 or newer.

```bash
npm install --global --ignore-scripts bangboo
bangboo
```

Authenticate with a provider API key or run `/login`, then select a model with `/model`. The standard read, bash, edit, and write tools are available by default.

## Data isolation

Bangboo never falls back to Pi configuration:

| Scope | Location |
| --- | --- |
| Global settings, credentials, sessions, trust, and packages | `~/.bangboo/agent/` |
| Project settings, extensions, skills, prompts, and themes | `.bangboo/` |

Existing `~/.pi` and project `.pi` directories are not read, copied, migrated, or modified. Standard project context files such as `AGENTS.md`, `CLAUDE.md`, and `.agents/skills` retain their normal behavior.

## Commands

All upstream runtime modes remain available through the Bangboo command:

```bash
bangboo                         # interactive mode
bangboo -p "Review this code"   # print mode
bangboo --mode json            # JSON event stream
bangboo --mode rpc             # RPC over stdin/stdout
bangboo --help
```

Package management uses Bangboo's isolated directories:

```bash
bangboo install npm:@scope/package
bangboo install -l ./local-package
bangboo config
bangboo list
bangboo update                  # Bangboo only
bangboo update --extensions     # community packages only
bangboo update --all            # Bangboo and packages
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BANGBOO_CODING_AGENT_DIR` | Override `~/.bangboo/agent` |
| `BANGBOO_CODING_AGENT_SESSION_DIR` | Override session storage |
| `BANGBOO_OFFLINE` | Disable startup and package network operations |
| `BANGBOO_SHARE_VIEWER_URL` | Enable `/share` with an explicitly chosen viewer |
| `BANGBOO_PACKAGE_DIR` | Override packaged asset lookup |
| `BANGBOO_TIMING` | Enable runtime timing diagnostics |
| `BANGBOO_STARTUP_BENCHMARK` | Print startup benchmark details |
| `BANGBOO_EXPERIMENTAL` | Enable compatible experimental runtime features |
| `BANGBOO_CLEAR_ON_SHRINK` | Control terminal clearing when content shrinks |
| `BANGBOO_HARDWARE_CURSOR` | Control compatible hardware-cursor behavior |
| `BANGBOO_CODING_AGENT` | Product identification flag, set automatically to `true` |

Bangboo maps these variables to internal compatibility variables before loading the runtime. `BANGBOO_*` values win when both forms are set.

## Community package compatibility

Bangboo intentionally retains the Pi community package ABI. Existing packages continue to declare resources under the `pi` key in `package.json`, and extensions may import either current `@earendil-works/pi-*` modules or historical `@mariozechner/pi-*` aliases. Both resolve to the single runtime embedded in the Bangboo process.

```json
{
  "name": "my-agent-package",
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Extensions execute arbitrary code with the current user's permissions, and skills can instruct the model to run commands. Review third-party packages before installing them.

## Privacy and online services

Bangboo does not send Pi product telemetry, use Pi update endpoints, or configure a default session-sharing service. Version checks query only the npm registry entry for `bangboo`. `/share` remains disabled until `BANGBOO_SHARE_VIEWER_URL` is set. Provider requests and community extensions remain subject to their own privacy policies.

`BANGBOO_OFFLINE=1` or `--offline` disables startup version checks and package network operations.

## Development

The repository stores an exact upstream lock and a small ordered patch series instead of a permanent source fork.

```bash
npm install
npm test
npm run stage       # checkout and validate patches
npm run build       # compile the complete runtime
npm run pack        # create artifacts/bangboo-0.1.0.tgz
npm run verify
```

See `upstream.lock.json` for source provenance and [UPSTREAM_COMPATIBILITY.md](UPSTREAM_COMPATIBILITY.md) for validation status. An upstream upgrade must update the lock, replay every patch with `git apply --check`, and pass the full compatibility suite before release.

## License and attribution

Bangboo is distributed under the MIT License. It incorporates code from the Pi runtime under the same license. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Bangboo is an independent distribution and is not presented as the upstream project.
