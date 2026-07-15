import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";
import { resolveNpmCommand } from "../../src/npm-command.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
let installRoot: string;
let installedPackage: string;
const packTimeout = process.platform === "win32" ? 900_000 : 300_000;

describe("packed Bangboo CLI", () => {
  beforeAll(async () => {
    const pack = resolveNpmCommand(["run", "pack"]);
    await execFileAsync(pack.command, pack.args, { cwd: repositoryRoot, timeout: packTimeout });
    const archives = (await readdir(join(repositoryRoot, "artifacts"))).filter((name) => name === "bangboo-0.1.0.tgz");
    expect(archives).toHaveLength(1);
    installRoot = await mkdtemp(join(tmpdir(), "bangboo-install-"));
    const install = resolveNpmCommand([
      "install",
      "--prefix",
      installRoot,
      "--ignore-scripts",
      "--no-package-lock",
      join(repositoryRoot, "artifacts", archives[0]!),
    ]);
    await execFileAsync(install.command, install.args, { timeout: 180_000 });
    installedPackage = join(installRoot, "node_modules", "bangboo");
  }, packTimeout);

  test("ships brand, license, and attribution documents", async () => {
    await expect(readFile(join(installedPackage, "README.md"), "utf8")).resolves.toContain("# Bangboo");
    await expect(readFile(join(installedPackage, "LICENSE"), "utf8")).resolves.toContain("MIT License");
    await expect(readFile(join(installedPackage, "NOTICE"), "utf8")).resolves.toContain("Pi runtime");
    await expect(readFile(join(installedPackage, "CHANGELOG.md"), "utf8")).resolves.toContain("# Changelog");
  });

  test("contains one coding-agent runtime and an executable bootstrap", async () => {
    const manifest = JSON.parse(await readFile(join(installedPackage, "package.json"), "utf8")) as {
      bin: Record<string, string>;
      dependencies: Record<string, string>;
      pi: Record<string, string[]>;
    };
    expect(manifest.bin).toEqual({ bangboo: "dist/bangboo.js" });
    expect(manifest.pi).toEqual({ extensions: [], skills: [], prompts: [], themes: [] });
    expect(manifest.dependencies["@earendil-works/pi-coding-agent"]).toBeUndefined();
    expect(manifest.dependencies).toMatchObject({
      "@earendil-works/pi-agent-core": "0.80.7",
      "@earendil-works/pi-ai": "0.80.7",
      "@earendil-works/pi-tui": "0.80.7",
    });

    const { stdout } = await execFileAsync(process.execPath, [join(installedPackage, "dist", "bangboo.js"), "--version"], {
      env: { ...process.env, BANGBOO_OFFLINE: "1" },
      timeout: 30_000,
    });
    expect(stdout.trim()).toBe("bangboo 0.1.0 (runtime 0.80.7, upstream v0.80.7)");
  });
});
