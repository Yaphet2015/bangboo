# Global Local Link Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible npm command that builds the current Bangboo runtime and links the generated CLI package globally.

**Architecture:** Keep the workflow in the root `package.json`: `link:global` composes the existing `build` script with npm's `--prefix` support, targeting the generated coding-agent package. A unit test locks the command ordering and generated-package path without coupling tests to the host's global npm prefix.

**Tech Stack:** npm scripts, TypeScript/ESM project tooling, Vitest.

## Global Constraints

- Use the existing build pipeline and lockfile; do not introduce a second build path.
- Link `.bangboo-build/upstream/packages/coding-agent`, which contains the `bangboo` bin after a successful build.
- Keep generated staging files ignored and do not add runtime model data or tarballs.
- Preserve the repository's Node.js `>=22.19.0` requirement.

---

### Task 1: Lock the npm script contract

**Files:**
- Create: `test/unit/global-link-script.test.ts`

**Interfaces:**
- Consumes: root `package.json` and its `scripts` object.
- Produces: a regression test requiring `build` to precede a global link of the generated coding-agent package.

- [x] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(import.meta.dirname, "../../package.json");

describe("global link script", () => {
	 it("builds before linking the generated coding-agent package", () => {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.["link:global"]).toBe(
			"npm run build && npm --prefix .bangboo-build/upstream/packages/coding-agent link",
		);
	});
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `./node_modules/.bin/vitest run test/unit/global-link-script.test.ts`

Expected: FAIL because `package.json` does not yet define `scripts["link:global"]`.

### Task 2: Add the build-then-link command

**Files:**
- Modify: `package.json` in the root `scripts` object.
- Test: `test/unit/global-link-script.test.ts`

**Interfaces:**
- Consumes: the existing `build` npm script.
- Produces: `npm run link:global`, which builds and then runs `npm link` with the generated package as its prefix.

- [x] **Step 1: Write the minimal implementation**

Add this entry to the root `package.json` scripts:

```json
"link:global": "npm run build && npm --prefix .bangboo-build/upstream/packages/coding-agent link"
```

- [x] **Step 2: Run the focused test to verify it passes**

Run: `./node_modules/.bin/vitest run test/unit/global-link-script.test.ts`

Expected: PASS.

### Task 3: Verify the real global link

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: `npm run link:global`.
- Produces: a global `bangboo` symlink resolving to the current generated package and reporting runtime `0.83.0`.

- [x] **Step 1: Run the end-to-end command**

Run: `npm run link:global`

Expected: the existing build succeeds, npm links one package, and the command exits with status 0.

- [x] **Step 2: Verify the link target and version**

Run:

```bash
link_path="$(npm root -g)/bangboo"
test "$(realpath "$link_path")" = "$PWD/.bangboo-build/upstream/packages/coding-agent"
bangboo --version
```

Expected: the resolved path is the generated coding-agent directory and output contains `runtime 0.83.0` and `upstream v0.83.0`.

- [x] **Step 3: Run the project checks**

Run: `npm test && npm run typecheck`

Expected: all unit tests and TypeScript checks pass.
