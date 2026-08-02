import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { hydrateModelData, resolvePiAiPackageVersion } from "../../src/model-data-hydration.js";

const packageName = "@earendil-works/pi-ai";

async function writeInstalledPackage(
  installRoot: string,
  manifest: { name: string; version: string },
  includeData = true,
): Promise<void> {
  const packageRoot = join(installRoot, "node_modules", "@earendil-works", "pi-ai");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), `${JSON.stringify(manifest)}\n`, "utf8");
  if (includeData) {
    const dataRoot = join(packageRoot, "dist", "providers", "data");
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, ".manifest.json"), '{"schemaVersion":3}\n', "utf8");
    await writeFile(join(dataRoot, "anthropic.json"), '{"messages":{"claude":{"id":"claude"}}}\n', "utf8");
  }
}

describe("model data hydration", () => {
  test("resolves the pi-ai version from the runtime lock", () => {
    expect(resolvePiAiPackageVersion({ [packageName]: "0.83.0" })).toBe("0.83.0");
    expect(resolvePiAiPackageVersion({ [packageName]: "0.84.0" })).toBe("0.84.0");
  });

  test("copies data from the exact installed pi-ai package", async () => {
    const root = await mkdtemp(join(tmpdir(), "bangboo-model-data-test-"));
    const stagePackageDir = join(root, "stage", "packages", "ai");

    await hydrateModelData({
      packageName,
      packageVersion: "0.83.0",
      stagePackageDir,
      installPackage: async (spec, installRoot) => {
        expect(spec).toBe("@earendil-works/pi-ai@0.83.0");
        await writeInstalledPackage(installRoot, { name: packageName, version: "0.83.0" });
      },
    });

    await expect(
      readFile(join(stagePackageDir, "src", "providers", "data", ".manifest.json"), "utf8"),
    ).resolves.toBe('{"schemaVersion":3}\n');
    await expect(
      readFile(join(stagePackageDir, "src", "providers", "data", "anthropic.json"), "utf8"),
    ).resolves.toContain('"claude"');
  });

  test("rejects an installed package whose version differs from the lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "bangboo-model-data-test-"));

    await expect(
      hydrateModelData({
        packageName,
        packageVersion: "0.83.0",
        stagePackageDir: join(root, "stage", "packages", "ai"),
        installPackage: async (_spec, installRoot) => {
          await writeInstalledPackage(installRoot, { name: packageName, version: "0.84.0" });
        },
      }),
    ).rejects.toThrow("expected @earendil-works/pi-ai@0.83.0, got @earendil-works/pi-ai@0.84.0");
  });

  test("rejects an installed package without a model data manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "bangboo-model-data-test-"));

    await expect(
      hydrateModelData({
        packageName,
        packageVersion: "0.83.0",
        stagePackageDir: join(root, "stage", "packages", "ai"),
        installPackage: async (_spec, installRoot) => {
          await writeInstalledPackage(installRoot, { name: packageName, version: "0.83.0" }, false);
        },
      }),
    ).rejects.toThrow(".manifest.json");
  });
});
