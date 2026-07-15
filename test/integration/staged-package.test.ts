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
});
