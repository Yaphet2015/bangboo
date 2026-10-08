import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = new URL("../../", import.meta.url);
const packageRoot = new URL("../../.bangboo-build/upstream/packages/coding-agent/", import.meta.url);

describe("staged Bangboo package", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, ["--import", "tsx", "scripts/stage-upstream.ts"], {
      cwd: repositoryRoot,
      timeout: 120_000,
    });
  }, 120_000);

  test("has independent npm and runtime metadata", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8")) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      name: "bangboo",
      version: "1.1.0",
      bin: { bangboo: "dist/bangboo.js" },
      repository: { type: "git", url: "git+https://github.com/Yaphet2015/bangboo.git" },
      piConfig: { name: "bangboo", configDir: ".bangboo" },
      pi: { extensions: [], skills: [], prompts: [], themes: [] },
      bangboo: {
        runtimeVersion: "1.1.0",
        upstreamTag: "v1.1.0",
        upstreamCommit: "abe508e1b89912adde45528136c3221eb69acdd7",
      },
      dependencies: { "@agentclientprotocol/sdk": "1.3.0" },
    });
  });

  test("mirrors the locked runtime version in the pi-compat facade", async () => {
    const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8")) as {
      bangboo?: { runtimeVersion?: string };
    };
    const facade = JSON.parse(
      await readFile(new URL("pi-compat/package.json", packageRoot), "utf8"),
    ) as { name?: string; version?: string; bin?: Record<string, string> };

    expect(facade.name).toBe("@earendil-works/pi-coding-agent");
    expect(facade.version).toBe(manifest.bangboo?.runtimeVersion);
    expect(facade.version).not.toBe("0.0.0-compat");
    expect(facade.bin?.pi).toBe("../dist/bangboo.js");
  });

  test("routes extension version probes through the pi-compat facade", async () => {
    // Extensions like pi-web-access sniff the runtime version via
    // import.meta.resolve("@earendil-works/pi-coding-agent") and read the
    // package.json one level above the resolved entry. The alias must point
    // inside pi-compat (whose manifest mirrors the runtime version), not at
    // the renamed host package (whose version is Bangboo's own).
    const loader = await readFile(new URL("src/core/extensions/loader.ts", packageRoot), "utf8");
    const entry = await readFile(new URL("pi-compat/entry/index.js", packageRoot), "utf8");

    expect(loader).toContain('"../../..", "pi-compat/entry/index.js"');
    expect(entry).toContain('"../../../dist/index.js"');
  });

  test("ships native ACP mode and its distribution documentation", async () => {
    await expect(readFile(new URL("src/modes/acp/acp-mode.ts", packageRoot), "utf8")).resolves.toContain(
      "session/set_config_option",
    );
    await expect(readFile(new URL("docs/acp.md", packageRoot), "utf8")).resolves.toContain('"customAcpAgents"');
    await expect(readFile(new URL("README.md", packageRoot), "utf8")).resolves.toContain("docs/acp.md");
  });

  test("boots through the Bangboo environment shim", async () => {
    const bootstrap = await readFile(new URL("src/bangboo.ts", packageRoot), "utf8");

    expect(bootstrap).toContain('process.env.BANGBOO_CODING_AGENT = "true"');
    expect(bootstrap).toContain('await import("./cli.ts")');
  });

  test("uses the Bangboo npm registry for self-update", async () => {
    const source = await readFile(new URL("src/utils/version-check.ts", packageRoot), "utf8");

    expect(source).toContain("https://registry.npmjs.org/bangboo/latest");
    expect(source).not.toContain("https://pi.dev/api/latest-version");
  });

  test("brands HTML exports and the shipped changelog", async () => {
    const template = await readFile(new URL("src/core/export-html/template.html", packageRoot), "utf8");
    const changelog = await readFile(new URL("CHANGELOG.md", packageRoot), "utf8");

    expect(template).toContain("<title>Bangboo Session Export</title>");
    expect(changelog).toContain("# Changelog");
    expect(changelog).not.toMatch(/\bPi\b|pi\.dev/u);
  });

  test("does not ship built-in provider usage tracking", async () => {
    await expect(readFile(new URL("src/core/provider-usage.ts", packageRoot), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("does not offer upstream telemetry controls", async () => {
    const firstRun = await readFile(
      new URL("src/modes/interactive/components/first-time-setup.ts", packageRoot),
      "utf8",
    );
    const settings = await readFile(
      new URL("src/modes/interactive/components/settings-selector.ts", packageRoot),
      "utf8",
    );
    const startup = await readFile(new URL("src/cli/startup-ui.ts", packageRoot), "utf8");
    const interactive = await readFile(new URL("src/modes/interactive/interactive-mode.ts", packageRoot), "utf8");

    expect(firstRun).toContain("Product analytics are disabled.");
    expect(firstRun).not.toContain("Share anonymous usage data");
    expect(settings).not.toContain('id: "install-telemetry"');
    expect(startup).toContain("isBangbooDistribution");
    expect(startup).not.toContain("areExperimentalFeaturesEnabled");
    expect(interactive).not.toContain("EarendilAnnouncementComponent");
  });
});
