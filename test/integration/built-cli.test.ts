import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";
import { resolveNpmCommand } from "../../src/npm-command.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repositoryRoot, ".bangboo-build", "upstream", "packages", "coding-agent", "dist", "bangboo.js");
const extensionFixtures = join(repositoryRoot, "test", "fixtures", "extensions");
const packageFixtures = join(repositoryRoot, "test", "fixtures", "packages");
const stagedPackage = join(repositoryRoot, ".bangboo-build", "upstream", "packages", "coding-agent");

function stagedModuleUrl(...segments: string[]): string {
  return pathToFileURL(join(stagedPackage, ...segments)).href;
}

async function runCli(args: string[], cwd: string, home: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [cli, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      BANGBOO_OFFLINE: "1",
      NO_COLOR: "1",
    },
    timeout: 60_000,
  });
}

describe("built Bangboo CLI", () => {
  beforeAll(async () => {
    const npm = resolveNpmCommand(["run", "build"]);
    await execFileAsync(npm.command, npm.args, { cwd: repositoryRoot, timeout: 300_000 });
  }, 300_000);

  test("reports independent and runtime versions", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-project-"));

    const { stdout } = await runCli(["--version"], project, home);

    expect(stdout.trim()).toBe("bangboo 0.1.1 (runtime 0.80.7, upstream v0.80.7)");
  });

  test("enables Bangboo first-run setup without an experimental flag", async () => {
    const missingSettings = join(await mkdtemp(join(tmpdir(), "bangboo-first-run-")), "settings.json");
    const probe = `
      import { shouldRunFirstTimeSetup } from ${JSON.stringify(stagedModuleUrl("dist", "cli", "startup-ui.js"))};
      delete process.env.BANGBOO_CODING_AGENT_DIR;
      console.log(shouldRunFirstTimeSetup(process.argv[1]));
    `;
    const result = await execFileAsync(process.execPath, ["--input-type=module", "--eval", probe, missingSettings], {
      cwd: repositoryRoot,
      timeout: 30_000,
    });

    expect(result.stdout.trim()).toBe("true");
  });

  test.each([
    ["print", ["-p", "--help"]],
    ["json", ["--mode", "json", "--help"]],
    ["rpc", ["--mode", "rpc", "--help"]],
  ])("keeps %s mode help branded", async (_name, args) => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-project-"));
    const output = await runCli(args, project, home);
    const combined = `${output.stdout}\n${output.stderr}`;

    expect(combined).toContain("bangboo - AI coding agent");
    expect(combined).not.toMatch(/\bPi\b|~\/\.pi|pi\.dev/u);
  });

  test("exports a compatible session with Bangboo HTML identity", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-project-"));
    const session = join(project, "session.jsonl");
    const output = join(project, "export.html");
    await writeFile(
      session,
      `${JSON.stringify({ type: "session", version: 3, id: "bangboo-export", timestamp: new Date().toISOString(), cwd: project })}\n`,
      "utf8",
    );

    const result = await runCli(["--export", session, output], project, home);
    expect(result.stdout).toContain(`Exported to: ${output}`);
    const html = await readFile(output, "utf8");
    expect(html).toContain("<title>Bangboo Session Export</title>");
    expect(html).not.toMatch(/<title>.*\bPi\b/iu);
  });

  test("uses only the Bangboo registry and keeps sharing opt-in", async () => {
    const probe = `
      import { getLatestPiRelease } from ${JSON.stringify(stagedModuleUrl("dist", "utils", "version-check.js"))};
      import { getShareViewerUrl } from ${JSON.stringify(stagedModuleUrl("dist", "config.js"))};
      let calls = [];
      globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), userAgent: options?.headers?.["User-Agent"] });
        return { ok: true, json: async () => ({ name: "bangboo", version: "0.1.1" }) };
      };
      process.env.PI_OFFLINE = "1";
      const offline = await getLatestPiRelease("0.1.0");
      delete process.env.PI_OFFLINE;
      const online = await getLatestPiRelease("0.1.0");
      delete process.env.BANGBOO_SHARE_VIEWER_URL;
      delete process.env.PI_SHARE_VIEWER_URL;
      const shareDisabled = getShareViewerUrl("gist");
      process.env.BANGBOO_SHARE_VIEWER_URL = "https://share.example/session/";
      const shareEnabled = getShareViewerUrl("gist");
      console.log(JSON.stringify({ offline, online, calls, shareDisabled, shareEnabled }));
    `;
    const result = await execFileAsync(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: repositoryRoot,
      timeout: 30_000,
    });
    const output = JSON.parse(result.stdout) as {
      offline?: unknown;
      online: { packageName: string; version: string };
      calls: Array<{ url: string; userAgent: string }>;
      shareDisabled?: unknown;
      shareEnabled: string;
    };

    expect(output.offline).toBeUndefined();
    expect(output.online).toEqual({ packageName: "bangboo", version: "0.1.1" });
    expect(output.calls).toEqual([
      { url: "https://registry.npmjs.org/bangboo/latest", userAgent: expect.stringMatching(/^bangboo\/0\.1\.0 /u) },
    ]);
    expect(output.shareDisabled).toBeUndefined();
    expect(output.shareEnabled).toBe("https://share.example/session/#gist");
  });

  test("ignores .pi canaries and discovers both extension import generations", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-project-"));
    const canaryPath = join(project, ".pi", "settings.json");
    const globalCanaryPath = join(home, ".pi", "agent", "settings.json");
    await mkdir(join(project, ".pi"), { recursive: true });
    await writeFile(canaryPath, "PI_CANARY_DO_NOT_READ", "utf8");
    await mkdir(join(home, ".pi", "agent", "extensions"), { recursive: true });
    await writeFile(globalCanaryPath, "GLOBAL_PI_CANARY_DO_NOT_READ", "utf8");
    await writeFile(
      join(home, ".pi", "agent", "extensions", "canary.ts"),
      `export default function (runtime) { runtime.registerFlag("pi-canary", { description: "must not load", type: "boolean" }); }\n`,
      "utf8",
    );
    await mkdir(join(project, ".bangboo", "extensions"), { recursive: true });
    await mkdir(join(home, ".bangboo", "agent", "extensions"), { recursive: true });
    await cp(join(extensionFixtures, "current.ts"), join(project, ".bangboo", "extensions", "current.ts"));
    await cp(join(extensionFixtures, "legacy.ts"), join(home, ".bangboo", "agent", "extensions", "legacy.ts"));

    const { stdout, stderr } = await runCli(["--approve", "--help"], project, home);

    expect(`${stdout}\n${stderr}`).toContain("--current-fixture");
    expect(`${stdout}\n${stderr}`).toContain("--legacy-fixture");
    expect(`${stdout}\n${stderr}`).not.toContain("--pi-canary");
    expect(await readFile(canaryPath, "utf8")).toBe("PI_CANARY_DO_NOT_READ");
    expect(await readFile(globalCanaryPath, "utf8")).toBe("GLOBAL_PI_CANARY_DO_NOT_READ");
    expect(stdout).toContain("~/.bangboo/agent");
    expect(stdout).not.toMatch(/\bPi\b|~\/\.pi|pi\.dev/u);
  });

  test("installs, loads, and removes a manifest-free conventional package", async () => {
    const home = await mkdtemp(join(tmpdir(), "bangboo-home-"));
    const project = await mkdtemp(join(tmpdir(), "bangboo-project-"));
    const fixture = await mkdtemp(join(tmpdir(), "bangboo-package-"));
    await cp(join(packageFixtures, "conventional"), fixture, { recursive: true });
    const theme = JSON.parse(
      await readFile(join(stagedPackage, "src", "modes", "interactive", "theme", "dark.json"), "utf8"),
    ) as { name: string };
    theme.name = "conventional";
    await mkdir(join(fixture, "themes"), { recursive: true });
    await writeFile(join(fixture, "themes", "conventional.json"), `${JSON.stringify(theme, null, 2)}\n`, "utf8");

    const installed = await runCli(["install", fixture, "-l", "--approve"], project, home);
    expect(installed.stdout).toContain(`Installed ${fixture}`);

    const listed = await runCli(["list", "--approve"], project, home);
    expect(listed.stdout).toContain(fixture);
    expect(listed.stdout).toContain("Project packages:");

    const help = await runCli(["--approve", "--help"], project, home);
    expect(`${help.stdout}\n${help.stderr}`).toContain("--conventional-fixture");

    const resourceProbe = `
      import { DefaultResourceLoader, SettingsManager } from ${JSON.stringify(stagedModuleUrl("dist", "index.js"))};
      const cwd = process.argv[1];
      const agentDir = process.argv[2];
      const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
      const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
      await loader.reload();
      console.log(JSON.stringify({
        skills: loader.getSkills().skills.map((item) => item.name),
        prompts: loader.getPrompts().prompts.map((item) => item.name),
        themes: loader.getThemes().themes.map((item) => item.name),
      }));
    `;
    const resources = await execFileAsync(process.execPath, ["--input-type=module", "--eval", resourceProbe, project, join(home, ".bangboo", "agent")], {
      cwd: project,
      env: { ...process.env, HOME: home, USERPROFILE: home, BANGBOO_OFFLINE: "1" },
      timeout: 60_000,
    });
    expect(JSON.parse(resources.stdout)).toEqual({
      skills: expect.arrayContaining(["conventional"]),
      prompts: expect.arrayContaining(["conventional"]),
      themes: expect.arrayContaining(["conventional"]),
    });

    const removed = await runCli(["remove", fixture, "-l", "--approve"], project, home);
    expect(removed.stdout).toContain(`Removed ${fixture}`);
    expect((await runCli(["list", "--approve"], project, home)).stdout).not.toContain(fixture);
  }, 120_000);
});
