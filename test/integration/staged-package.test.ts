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
      version: "0.1.0",
      bin: { bangboo: "dist/bangboo.js" },
      piConfig: { name: "bangboo", configDir: ".bangboo" },
      pi: { extensions: [], skills: [], prompts: [], themes: [] },
      bangboo: {
        runtimeVersion: "0.80.7",
        upstreamTag: "v0.80.7",
        upstreamCommit: "818d67457cdd6b60bce6b121d16b23141c252dd8",
      },
    });
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

  test("includes built-in provider usage tracking", async () => {
    const source = await readFile(new URL("src/core/provider-usage.ts", packageRoot), "utf8");

    expect(source).toContain('"openai-codex"');
    expect(source).toContain('"zai"');
    expect(source).toContain('"zai-coding-cn"');
    expect(source).toContain('windowLabel: "weekly"');
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
