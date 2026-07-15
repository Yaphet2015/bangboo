# Security

## Supported versions

Security fixes are provided for the latest published Bangboo version. Runtime provenance for each build is recorded in the package metadata and `upstream.lock.json`.

## Reporting a vulnerability

Please report suspected vulnerabilities through the repository's private security-reporting channel. Include the Bangboo version, operating system, Node.js version, reproduction steps, and whether the issue also occurs in the pinned upstream runtime. Do not include credentials, private session data, or exploit details in a public issue.

## Extension and skill trust

Bangboo community extensions are executable Node.js code. They run with the same filesystem, process, and network permissions as Bangboo. Skills and prompt packages can also influence commands proposed or executed by the model. Project trust controls whether project-local resources load; it is not a sandbox.

Review package source and lock versions before installation. Use `BANGBOO_OFFLINE=1` when no package, update, share, or other optional startup network access is desired. Model-provider calls are necessarily unavailable while operating fully offline.

Bangboo stores global credentials, settings, sessions, trust records, and package data under `~/.bangboo/agent/`, with project resources under `.bangboo/`. It does not use `~/.pi` or `.pi` as a compatibility fallback.
