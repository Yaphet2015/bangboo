# 插件配置兼容层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 让 `bangboo install` 安装的 Pi 兼容插件在 Bangboo 进程及子进程中读取 `~/.bangboo/agent` 与 `.bangboo/`，并在首次安装时对写死 `.pi` 的插件给出非阻塞提醒。

**架构:** 在启动 bootstrap 中把 Pi 兼容环境变量重定向到 Bangboo 目录，并对接 `pi-subagents` 已有的 package-root / 二进制入口；随包附带一个 `pi-compat` facade 供其解析项目配置目录名。新增一个只读扫描器，仅在 `bangboo install` 成功后运行。所有运行时改动固化为 `patches/0007-plugin-config-compatibility.patch`。

**技术栈:** TypeScript、Vitest、Bangboo 有序补丁序列（staged upstream worktree）。

## 全局约束

- 设计依据：`docs/superpowers/specs/2026-07-21-plugin-config-compatibility-design.md`。
- 数据隔离 SSOT：不读取、复制、迁移、修改 `.pi`，不创建符号链接，不改写第三方插件文件。
- 运行时改动只发生在 staged 包 `packages/coding-agent/` 内，最终以单一 patch `0007` 表达；仓库根目录文件（`README.md`、`test/integration/built-cli.test.ts`、`test/fixtures/...`）直接编辑。
- Bangboo 值必须覆盖进程内已存在的同名 `PI_*` 变量。
- 扫描只在 `bangboo install` 成功后执行；`update` 任何形式都不扫描。
- 扫描非阻塞：命中或失败都不影响安装成功，不修改插件，不阻止加载。
- 扫描正则把 `.pi` 当作路径段/字符串字面量匹配，绝不可命中 `.pi-subagents`、`PI_CODING_AGENT_DIR`、`pi.dev`。
- 每个任务结束都要运行其“验证”命令，确认 GREEN 后再提交；禁止跳过测试（Rule 7）。
- **设计细化（需告知用户）：** 已批准的设计未完全覆盖 `pi-subagents` 前台子进程的 CLI 解析。本计划新增设置 `PI_SUBAGENT_PI_BINARY` 指向当前 Bangboo CLI，使前台与后台子进程都可靠地启动 Bangboo。这是对设计的实现级补充（Rule 5 已标明）。

### Patch 工作流（所有运行时任务共用）

- staged 树位于 `.bangboo-build/upstream/`，是锁定上游 commit 的 git worktree；`npm run stage` 会重建并按序应用 `patches/`。
- 任务 1 开始前先 `npm run build`（内部 stage + 安装依赖 + 编译），保证 staged 树存在、依赖就位、dist 已生成。
- 在该 worktree 内 `git add -A && git commit -m "baseline-0001-0006"`，建立“仅含 0001–0006”的基线提交。
- 任务 1–4 直接编辑 staged 源码/测试，并就地运行 staged 测试：`cd .bangboo-build/upstream/packages/coding-agent && npm test -- <文件>`。**严禁在此期间运行 `npm run stage`，否则会抹掉未固化的改动。**
- 任务 5 在同一 worktree 用 `git diff` 相对基线生成 `patches/0007`，再用 `npm run stage` 从零复演全序列并运行 `npm run verify`。

---

### Task 1: Bootstrap 重定向 Pi 兼容环境变量

**文件:**
- 新增: `.bangboo-build/upstream/packages/coding-agent/src/pi-compat-env.ts`
- 修改: `.bangboo-build/upstream/packages/coding-agent/src/bangboo.ts`
- 测试: `.bangboo-build/upstream/packages/coding-agent/test/pi-compat-env.test.ts`（新增）

**接口:**
- 产生: 纯函数 `applyPiCompatEnv(options)`，副作用为设置进程环境变量。`bangboo.ts` 在加载 CLI 前调用它。
- 消费: 调用方提供 `agentDir`、可选 `sessionDir`、可选 `cliEntry`、可选 `existsSync`。

- [ ] **Step 1: 建立基线提交**

运行：

```bash
npm run build
cd .bangboo-build/upstream
git add -A
git commit -m "baseline-0001-0006" --allow-empty
cd ../..
```

- [ ] **Step 2: 写失败测试**

新建 `.bangboo-build/upstream/packages/coding-agent/test/pi-compat-env.test.ts`：

```ts
import { afterEach, describe, expect, test } from "vitest";
import { applyPiCompatEnv } from "../src/pi-compat-env.ts";

afterEach(() => {
	delete process.env.PI_CODING_AGENT_DIR;
	delete process.env.PI_CODING_AGENT_SESSION_DIR;
	delete process.env.PI_SUBAGENT_PI_BINARY;
	delete process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT;
});

describe("applyPiCompatEnv", () => {
	test("redirects PI_CODING_AGENT_DIR and overrides any stale value", () => {
		process.env.PI_CODING_AGENT_DIR = "/old/.pi/agent";
		applyPiCompatEnv({ agentDir: "/home/u/.bangboo/agent" });
		expect(process.env.PI_CODING_AGENT_DIR).toBe("/home/u/.bangboo/agent");
	});

	test("sets the pi-subagents binary hint when a cli entry is provided", () => {
		applyPiCompatEnv({ agentDir: "/a", cliEntry: "/pkg/dist/bangboo.js" });
		expect(process.env.PI_SUBAGENT_PI_BINARY).toBe("/pkg/dist/bangboo.js");
	});

	test("points pi-subagents package root at the pi-compat facade when present", () => {
		const exists = (p: string) => p === "/pkg/pi-compat/package.json";
		applyPiCompatEnv({ agentDir: "/a", cliEntry: "/pkg/dist/bangboo.js", existsSync: exists });
		expect(process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT).toBe("/pkg/pi-compat");
	});

	test("leaves session dir untouched when no Bangboo session override is given", () => {
		applyPiCompatEnv({ agentDir: "/a" });
		expect(process.env.PI_CODING_AGENT_SESSION_DIR).toBeUndefined();
	});

	test("forwards the Bangboo session override when provided", () => {
		applyPiCompatEnv({ agentDir: "/a", sessionDir: "/custom/sessions" });
		expect(process.env.PI_CODING_AGENT_SESSION_DIR).toBe("/custom/sessions");
	});

	test("omits binary/package-root hints when cli entry is absent", () => {
		applyPiCompatEnv({ agentDir: "/a" });
		expect(process.env.PI_SUBAGENT_PI_BINARY).toBeUndefined();
		expect(process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT).toBeUndefined();
	});
});
```

- [ ] **Step 3: 运行测试确认 RED**

```bash
cd .bangboo-build/upstream/packages/coding-agent
npm test -- pi-compat-env.test.ts
```

预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现纯函数**

新建 `src/pi-compat-env.ts`：

```ts
import { existsSync as nodeExistsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ApplyPiCompatEnvOptions {
	/** Bangboo agent directory (e.g. ~/.bangboo/agent). */
	agentDir: string;
	/** Optional Bangboo session directory override. */
	sessionDir?: string;
	/** Absolute path to the Bangboo CLI entry (process.argv[1] after realpath). */
	cliEntry?: string;
	/** Injected for tests; defaults to node:fs existsSync. */
	existsSync?: (path: string) => boolean;
}

/**
 * Redirect Pi-compatible plugins to Bangboo's config directories. Bangboo
 * values always win over inherited PI_* variables so plugins never fall back
 * to ~/.pi. The user-dir override is general; the package-root + binary hints
 * cover pi-subagents' config-dir resolution and child-process spawn.
 */
export function applyPiCompatEnv(options: ApplyPiCompatEnvOptions): void {
	const { agentDir, sessionDir, cliEntry } = options;
	const existsSync = options.existsSync ?? nodeExistsSync;

	process.env.PI_CODING_AGENT_DIR = agentDir;
	if (sessionDir) {
		process.env.PI_CODING_AGENT_SESSION_DIR = sessionDir;
	}

	if (!cliEntry) return;
	process.env.PI_SUBAGENT_PI_BINARY = cliEntry;
	const compatRoot = resolve(dirname(cliEntry), "..", "pi-compat");
	if (existsSync(join(compatRoot, "package.json"))) {
		process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = compatRoot;
	}
}
```

- [ ] **Step 5: 运行测试确认 GREEN**

```bash
npm test -- pi-compat-env.test.ts
```

预期：PASS。

- [ ] **Step 6: 在 bootstrap 接线**

编辑 `src/bangboo.ts`，在现有 `compatibilityVariables` 循环之后、`await import("./cli.ts")` 之前加入 import：

```ts
import { realpathSync } from "node:fs";
import { getAgentDir } from "./config.ts";
import { applyPiCompatEnv } from "./pi-compat-env.ts";
```

并加入调用：

```ts
let bangbooCliEntry: string | undefined;
try {
	if (process.argv[1]) bangbooCliEntry = realpathSync(process.argv[1]);
} catch {
	// Best-effort entry resolution.
}
applyPiCompatEnv({
	agentDir: getAgentDir(),
	sessionDir: process.env.BANGBOO_CODING_AGENT_SESSION_DIR,
	cliEntry: bangbooCliEntry,
});
```

- [ ] **Step 7: 再次运行测试并提交**

```bash
npm test -- pi-compat-env.test.ts
cd ../..
git add .bangboo-build/upstream/packages/coding-agent/src/pi-compat-env.ts \
        .bangboo-build/upstream/packages/coding-agent/src/bangboo.ts \
        .bangboo-build/upstream/packages/coding-agent/test/pi-compat-env.test.ts
git commit -m "feat: redirect pi-compat env to bangboo dirs"
```

---

### Task 2: pi-compat facade 与打包包含

**文件:**
- 新增: `.bangboo-build/upstream/packages/coding-agent/pi-compat/package.json`
- 修改: `.bangboo-build/upstream/packages/coding-agent/package.json`（`files` 数组）
- 测试: `.bangboo-build/upstream/packages/coding-agent/test/pi-compat-facade.test.ts`（新增）

**接口:**
- 产生: 静态 manifest `pi-compat/package.json`，`name` 为 `@earendil-works/pi-coding-agent`，`piConfig.configDir` 为 `.bangboo`，`bin.pi` 指向 `../dist/bangboo.js`，`main` 指向 `../dist/index.js`。
- 消费: `pi-subagents` 的 `resolveConfigDirNameFromPackageJson`（按包名匹配后读取 `piConfig.configDir`）。

- [ ] **Step 1: 写失败测试**

新建 `.bangboo-build/upstream/packages/coding-agent/test/pi-compat-facade.test.ts`：

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

describe("pi-compat facade", () => {
	test("declares the upstream coding-agent identity with bangboo config dir", async () => {
		const manifest = JSON.parse(
			await readFile(join(packageRoot, "pi-compat", "package.json"), "utf8"),
		) as Record<string, unknown>;
		expect(manifest.name).toBe("@earendil-works/pi-coding-agent");
		expect((manifest.piConfig as { configDir: string }).configDir).toBe(".bangboo");
		expect((manifest.bin as { pi: string }).pi).toBe("../dist/bangboo.js");
		expect(manifest.main).toBe("../dist/index.js");
	});
});
```

- [ ] **Step 2: 运行确认 RED**

```bash
cd .bangboo-build/upstream/packages/coding-agent
npm test -- pi-compat-facade.test.ts
```

预期：FAIL（`pi-compat/package.json` 不存在）。

- [ ] **Step 3: 新增 facade manifest**

新建 `pi-compat/package.json`：

```json
{
  "name": "@earendil-works/pi-coding-agent",
  "version": "0.0.0-compat",
  "private": true,
  "description": "Bangboo compatibility facade for Pi plugins that probe the coding-agent package identity.",
  "type": "module",
  "main": "../dist/index.js",
  "bin": {
    "pi": "../dist/bangboo.js"
  },
  "piConfig": {
    "name": "pi",
    "configDir": ".bangboo"
  }
}
```

- [ ] **Step 4: 让 tarball 包含 facade**

编辑 `packages/coding-agent/package.json` 的 `"files"` 数组，在 `\"dist\"` 之后加入 `\"pi-compat\"`：

```json
  "files": [
    "dist",
    "pi-compat",
    "docs",
```

- [ ] **Step 5: 运行确认 GREEN**

```bash
npm test -- pi-compat-facade.test.ts pi-compat-env.test.ts
```

预期：PASS。

- [ ] **Step 6: 提交**

```bash
cd ../..
git add .bangboo-build/upstream/packages/coding-agent/pi-compat \
        .bangboo-build/upstream/packages/coding-agent/package.json \
        .bangboo-build/upstream/packages/coding-agent/test/pi-compat-facade.test.ts
git commit -m "feat: ship pi-compat facade manifest"
```

---

### Task 3: 兼容性扫描器纯函数（TDD）

**文件:**
- 新增: `.bangboo-build/upstream/packages/coding-agent/src/utils/plugin-compatibility-scan.ts`
- 测试: `.bangboo-build/upstream/packages/coding-agent/test/plugin-compatibility-scan.test.ts`

**接口:**
- 产生:

```ts
export interface CompatibilityFinding {
  path: string;     // 相对 package 根的路径
  line: number;     // 1-based
  column: number;   // 1-based
  excerpt: string;  // 命中行去除首尾空白后截断
}
export interface CompatibilityScanResult {
  findings: CompatibilityFinding[]; // 最多 maxFindings 条
  totalMatches: number;             // 全部命中数
  complete: boolean;                // 遍历/读取出错时为 false
}
export function scanPackageForHardcodedPi(
  root: string,
  options?: { maxFindings?: number },
): Promise<CompatibilityScanResult>;
```

- [ ] **Step 1: 写失败测试**

新建 `test/plugin-compatibility-scan.test.ts`：

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { scanPackageForHardcodedPi } from "../src/utils/plugin-compatibility-scan.ts";

describe("scanPackageForHardcodedPi", () => {
	test("flags hardcoded ~/.pi and string .pi path joins", async () => {
		const root = await mkdtemp(join(tmpdir(), "scan-"));
		await mkdir(join(root, "extensions"), { recursive: true });
		await writeFile(
			join(root, "extensions", "index.ts"),
			`const a = join(homedir(), ".pi", "agent");\nconst b = "~/.pi/agent";\n`,
			"utf8",
		);
		const result = await scanPackageForHardcodedPi(root);
		expect(result.complete).toBe(true);
		expect(result.totalMatches).toBe(2);
		expect(result.findings).toHaveLength(2);
		expect(result.findings[0].path).toBe("extensions/index.ts");
		expect(result.findings[0].line).toBe(1);
		expect(result.findings[0].excerpt).toContain('".pi"');
	});

	test("does not flag .pi-subagents, PI_CODING_AGENT_DIR, docs, node_modules, maps", async () => {
		const root = await mkdtemp(join(tmpdir(), "scan-clean-"));
		await mkdir(join(root, "node_modules", "x"), { recursive: true });
		await mkdir(join(root, "docs"), { recursive: true });
		await writeFile(join(root, "node_modules", "x", "y.js"), 'const p = "~/.pi";\n', "utf8");
		await writeFile(join(root, "docs", "README.md"), "see ~/.pi/agent\n", "utf8");
		await writeFile(
			join(root, "ext.ts"),
			`const dir = process.env.PI_CODING_AGENT_DIR;\nconst art = ".pi-subagents";\nconst m = "x.pi";\n`,
			"utf8",
		);
		await writeFile(join(root, "built.js.map"), '{"sources":["~/.pi"]}\n', "utf8");
		const result = await scanPackageForHardcodedPi(root);
		expect(result.totalMatches).toBe(0);
		expect(result.findings).toEqual([]);
	});

	test("caps findings and still reports total", async () => {
		const root = await mkdtemp(join(tmpdir(), "scan-cap-"));
		await mkdir(join(root, "s"), { recursive: true });
		let file = "";
		for (let i = 0; i < 8; i++) file += `const x${i} = "~/.pi";\n`;
		await writeFile(join(root, "s", "a.ts"), file, "utf8");
		const result = await scanPackageForHardcodedPi(root, { maxFindings: 3 });
		expect(result.findings).toHaveLength(3);
		expect(result.totalMatches).toBe(8);
	});

	test("reports incomplete when the root cannot be traversed", async () => {
		const root = "__definitely_not_a_real_root__/missing";
		const result = await scanPackageForHardcodedPi(root);
		expect(result.complete).toBe(false);
		expect(result.totalMatches).toBe(0);
	});
});
```

- [ ] **Step 2: 运行确认 RED**

```bash
cd .bangboo-build/upstream/packages/coding-agent
npm test -- plugin-compatibility-scan.test.ts
```

预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现扫描器**

新建 `src/utils/plugin-compatibility-scan.ts`：

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface CompatibilityFinding {
	path: string;
	line: number;
	column: number;
	excerpt: string;
}
export interface CompatibilityScanResult {
	findings: CompatibilityFinding[];
	totalMatches: number;
	complete: boolean;
}

const SOURCE_EXTENSIONS = new Set([
	".ts", ".tsx", ".mts", ".cts",
	".js", ".jsx", ".mjs", ".cjs",
	".sh", ".py",
]);
const SKIP_DIRS = new Set([
	"node_modules", ".git", ".cache", "dist", "build", "build-output",
	"coverage", ".next", ".turbo", ".bangboo-build",
]);
const SKIP_NAME_PREFIXES = /^(?:readme|changelog|license|licence|notice|contributing|code_of_conduct)/i;
const SKIP_SUFFIXES = /\.(?:map|md|markdown|txt|json|lock|log)$/i;

// Matches `.pi` only when it is a path segment or a quoted string literal,
// never `.pi-subagents`, `.pion`, `config.pi`, `PI_...`, or `pi.dev`.
const HARDCODED_PI = /(?:^|[^A-Za-z0-9._-])\.pi(?=[\\/"'`]|$)/gu;

function truncateExcerpt(line: string): string {
	const trimmed = line.trim();
	return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
}

async function scanFile(
	filePath: string,
	root: string,
	maxFindings: number,
	findings: CompatibilityFinding[],
): Promise<number> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return 0;
	}
	const rel = relative(root, filePath);
	let matches = 0;
	const lines = content.split(/\r?\n/u);
	for (let i = 0; i < lines.length; i++) {
		HARDCODED_PI.lastIndex = 0;
		const line = lines[i];
		let match: RegExpExecArray | null;
		while ((match = HARDCODED_PI.exec(line)) !== null) {
			matches++;
			if (findings.length < maxFindings) {
				findings.push({
					path: rel,
					line: i + 1,
					column: match.index + 1,
					excerpt: truncateExcerpt(line),
				});
			}
		}
	}
	return matches;
}

export async function scanPackageForHardcodedPi(
	root: string,
	options?: { maxFindings?: number },
): Promise<CompatibilityScanResult> {
	const maxFindings = options?.maxFindings ?? 5;
	const findings: CompatibilityFinding[] = [];
	let totalMatches = 0;
	let complete = true;

	async function walk(dir: string): Promise<void> {
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			complete = false;
			return;
		}
		await Promise.all(entries.map(async (name) => {
			if (SKIP_NAME_PREFIXES.test(name) || SKIP_SUFFIXES.test(name)) return;
			const child = join(dir, name);
			let s;
			try {
				s = await stat(child);
			} catch {
				complete = false;
				return;
			}
			if (s.isDirectory()) {
				if (SKIP_DIRS.has(name)) return;
				await walk(child);
			} else if (s.isFile()) {
				const dot = name.lastIndexOf(".");
				const ext = dot === -1 ? "" : name.slice(dot).toLowerCase();
				if (!SOURCE_EXTENSIONS.has(ext)) return;
				totalMatches += await scanFile(child, root, maxFindings, findings);
			}
		}));
	}

	await walk(root);
	return { findings, totalMatches, complete };
}
```

- [ ] **Step 4: 运行确认 GREEN**

```bash
npm test -- plugin-compatibility-scan.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
cd ../..
git add .bangboo-build/upstream/packages/coding-agent/src/utils/plugin-compatibility-scan.ts \
        .bangboo-build/upstream/packages/coding-agent/test/plugin-compatibility-scan.test.ts
git commit -m "feat: add plugin compatibility scanner"
```

---

### Task 4: 在 install 命令接线扫描器 + 仓库集成测试

**文件:**
- 修改: `.bangboo-build/upstream/packages/coding-agent/src/package-manager-cli.ts`
- 新增 fixture: `test/fixtures/packages/hardcoded-pi/package.json`、`test/fixtures/packages/hardcoded-pi/extensions/index.ts`（仓库根目录）
- 修改: `test/integration/built-cli.test.ts`（仓库根目录）

**接口:**
- 消费: `scanPackageForHardcodedPi`、`DefaultPackageManager.getInstalledPath()`、`chalk`。
- 产生: 安装成功后向 stderr 输出非阻塞黄色 warning（命中或扫描未完成）。

- [ ] **Step 1: 在 CLI 接线扫描器**

编辑 `src/package-manager-cli.ts`，在文件顶部 import 区加入：

```ts
import { scanPackageForHardcodedPi } from "./utils/plugin-compatibility-scan.ts";
```

并把 `install` 分支替换为（保留原 `installAndPersist` 与成功日志）：

```ts
		case "install":
			await packageManager.installAndPersist(source!, { local: options.local });
			console.log(chalk.green(`Installed ${source}`));
			await scanInstalledPackageCompatibility(packageManager, source!, Boolean(options.local));
			return true;
```

并在该文件内（例如紧邻 `reportSettingsErrors` 之后）新增辅助函数：

```ts
async function scanInstalledPackageCompatibility(
	packageManager: DefaultPackageManager,
	source: string,
	local: boolean,
): Promise<void> {
	const scope = local ? "project" : "user";
	let installedPath: string | undefined;
	try {
		installedPath = packageManager.getInstalledPath(source, scope) ?? undefined;
	} catch {
		installedPath = undefined;
	}
	// 本地单文件扩展没有安装副本，直接扫描源文件本身。
	if (!installedPath && (source.startsWith("/") || source.startsWith("./"))) {
		try {
			const fsStat = await import("node:fs/promises").then((m) => m.stat(source));
			installedPath = fsStat.isFile() ? source : undefined;
		} catch {
			installedPath = undefined;
		}
	}
	if (!installedPath) return;

	let result;
	try {
		result = await scanPackageForHardcodedPi(installedPath);
	} catch {
		console.warn(
			chalk.yellow(
				`Could not complete compatibility scan for ${source}. The package is installed, but Bangboo could not read all of its files.`,
			),
		);
		return;
	}
	if (!result.complete) {
		console.warn(
			chalk.yellow(`Compatibility scan for ${source} was incomplete; the package is installed.`),
		);
		return;
	}
	if (result.totalMatches === 0) return;

	console.warn(
		chalk.yellow(
			`\nCompatibility notice for ${source}:\nBangboo redirects supported Pi config lookups to ~/.bangboo, but this package hardcodes .pi in ${String(result.totalMatches)} place(s). It may read or write ~/.pi or a project .pi/ directory instead of Bangboo's directories. Consider reporting this to the package author and asking them to use CONFIG_DIR_NAME, the runtime config API, or PI_CODING_AGENT_DIR.`,
		),
	);
	for (const finding of result.findings) {
		console.warn(chalk.yellow(`  ${finding.path}:${finding.line}:${finding.column}`));
	}
	if (result.totalMatches > result.findings.length) {
		console.warn(
			chalk.yellow(`  ...and ${String(result.totalMatches - result.findings.length)} more.`),
		);
	}
	console.warn("");
}
```

- [ ] **Step 2: 新增硬编码 fixture**

新建 `test/fixtures/packages/hardcoded-pi/package.json`：

```json
{
  "name": "hardcoded-pi-fixture",
  "version": "0.0.0",
  "private": true,
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

新建 `test/fixtures/packages/hardcoded-pi/extensions/index.ts`：

```ts
import { join } from "node:path";
import { homedir } from "node:os";
// Deliberately hardcodes .pi to exercise the install-time scan.
const legacy = join(homedir(), ".pi", "agent");
export default function () {
	return { legacy };
}
```

- [ ] **Step 3: 写集成测试**

在 `test/integration/built-cli.test.ts` 的 `describe("built Bangboo CLI", () => {` 内末尾新增：

```ts
  test("warns on first install when a package hardcodes .pi", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-scan-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-scan-project-"));
    const fixture = await mkdtemp(join(tmpdir(), "bangboo-hardcoded-"));
    await cp(join(repositoryRoot, "test", "fixtures", "packages", "hardcoded-pi"), fixture, { recursive: true });

    const result = await runCli(["install", fixture, "-l", "--approve"], project, home);
    expect(result.stdout).toContain(`Installed ${fixture}`);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain("Compatibility notice");
    expect(combined).toContain("extensions/index.ts:4:");
  }, 120_000);

  test("does not warn when installing the safe conventional fixture", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-safe-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-safe-project-"));
    const fixture = await mkdtemp(join(tmpdir(), "bangboo-safe-pkg-"));
    await cp(join(packageFixtures, "conventional"), fixture, { recursive: true });

    const result = await runCli(["install", fixture, "-l", "--approve"], project, home);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).not.toContain("Compatibility notice");
  }, 120_000);
```

注意：`packageFixtures`、`repositoryRoot`、`cp`、`mkdtemp`、`join`、`tmpdir`、`runCli` 均已在文件顶部定义/import。

- [ ] **Step 4: 确认 staged 单元测试仍 GREEN**

集成测试需要 Task 5 固化 patch 后才能整体构建运行；本步骤先确认已就绪的 staged 单元测试：

```bash
cd .bangboo-build/upstream/packages/coding-agent
npm test -- plugin-compatibility-scan.test.ts pi-compat-facade.test.ts pi-compat-env.test.ts
cd ../..
```

- [ ] **Step 5: 提交**

```bash
git add .bangboo-build/upstream/packages/coding-agent/src/package-manager-cli.ts \
        test/fixtures/packages/hardcoded-pi \
        test/integration/built-cli.test.ts
git commit -m "feat: warn on hardcoded .pi during install"
```

---

### Task 5: 固化为 patch 0007 并全量验证

**文件:**
- 新增: `patches/0007-plugin-config-compatibility.patch`

**接口:** 产出可由 `npm run stage` 从零复演的完整补丁序列。

- [ ] **Step 1: 生成 patch 0007**

确认 staged 树当前为“基线 + Task 1–4 改动”（期间未运行过 `npm run stage`）。然后：

```bash
cd .bangboo-build/upstream
git add -A
git diff --cached HEAD > ../../patches/0007-plugin-config-compatibility.patch
git reset --hard HEAD
cd ../..
```

检查：`head -40 patches/0007-plugin-config-compatibility.patch` 应包含 `src/pi-compat-env.ts`、`src/bangboo.ts`、`pi-compat/package.json`、`src/utils/plugin-compatibility-scan.ts`、`src/package-manager-cli.ts`、`package.json`、以及新测试。

- [ ] **Step 2: 从零复演并运行 verify**

```bash
npm run stage
npm run verify
```

预期：`stage` 成功应用 0001–0007；`verify`（typecheck + 全部 Vitest + brand verification）全部通过，无跳过测试。

- [ ] **Step 3: 运行集成测试**

```bash
npm run test:integration
```

预期：包括 Task 4 的两个 install 扫描用例在内全部通过。

- [ ] **Step 4: 打包验证 facade 随 tarball 发布**

```bash
npm run pack
tar -tzf artifacts/bangboo-0.1.1.tgz | grep 'pi-compat/package.json'
```

预期：输出包含 `package/pi-compat/package.json`。

- [ ] **Step 5: 提交**

```bash
git add patches/0007-plugin-config-compatibility.patch
git commit -m "feat: encode plugin config compatibility as patch 0007"
```

---

### Task 6: README 文档

**文件:**
- 修改: `README.md`（仓库根目录，直接编辑）

- [ ] **Step 1: 更新 community package compatibility 小节**

在 README “Community package compatibility” 段落末尾追加：

```markdown
Bangboo redirects the Pi-compatible config entry points it supports (`PI_CODING_AGENT_DIR`, `pi-subagents`' package-root and binary hints, and the runtime `CONFIG_DIR_NAME`) to `~/.bangboo/agent` and project `.bangboo/`, so supported community packages read Bangboo's directories instead of falling back to `~/.pi`. This does not create a symlink or migrate existing `~/.pi` data.

On first `bangboo install`, Bangboo performs a read-only scan of the installed package for hardcoded `.pi` paths that would bypass this compatibility layer. If found, it prints a non-blocking notice listing the affected files. The scan does not modify the package, block installation, or constitute a security audit or compatibility guarantee. `bangboo update` does not rescan.
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: document plugin config compatibility and install scan"
```

---

## 自检

- **覆盖：** spec 的“启动环境兼容”→Task 1；“compatibility facade”→Task 2；“插件子进程”→Task 1（PI_SUBAGENT_PI_BINARY + 继承）；“首次安装扫描（时机/范围/输出）”→Task 3+4；“错误处理”→Task 3+4；“数据隔离/文档”→Task 6；打包→Task 5。成功标准 1–6 均有对应任务与验证命令。
- **占位符：** 无 TBD/TODO；每步含可执行命令或完整代码。
- **类型一致：** `scanPackageForHardcodedPi(root, options?) → { findings, totalMatches, complete }` 在 Task 3 定义、Task 4 消费，签名一致；`CompatibilityFinding` 字段 `path/line/column/excerpt` 在测试与实现一致；`applyPiCompatEnv(options)` 在 Task 1 定义、`bangboo.ts` 消费，签名一致。

## 风险与残留

- facade 仅对“按 `@earendil-works/pi-coding-agent` 包名探测 + 读取 `piConfig.configDir`”或“读取 `PI_*` 环境变量”的插件生效；完全写死 `.pi` 且无任何兼容入口的插件只能被扫描器提醒，不会被运行时纠正。
- `PI_SUBAGENT_PI_BINARY` 指向 `dist/bangboo.js`，在 Windows 上依赖该文件可经 shebang 执行；若 Windows 行为异常，需改为 `[nodeExec, bangbooJs]` 形式（pi-subagents 当前以单字符串 command 调用，故先采用单路径）。
