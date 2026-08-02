import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveNpmCommand } from "./npm-command.js";

export const PI_AI_PACKAGE_NAME = "@earendil-works/pi-ai";

export type PackageInstaller = (packageSpec: string, installRoot: string) => Promise<void>;

export interface HydrateModelDataOptions {
  packageName: string;
  packageVersion: string;
  stagePackageDir: string;
  installPackage?: PackageInstaller;
}

interface PackageManifest {
  name?: unknown;
  version?: unknown;
}

export function resolvePiAiPackageVersion(runtimePackages: Readonly<Record<string, string>>): string {
  const version = runtimePackages[PI_AI_PACKAGE_NAME];
  if (!version) throw new Error(`Upstream lock does not contain ${PI_AI_PACKAGE_NAME}`);
  return version;
}

async function installPackageWithNpm(packageSpec: string, installRoot: string): Promise<void> {
  const resolved = resolveNpmCommand([
    "install",
    "--ignore-scripts",
    "--no-package-lock",
    "--no-save",
    "--no-audit",
    "--no-fund",
    "--prefix",
    installRoot,
    packageSpec,
  ]);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm install ${packageSpec} failed with ${signal ?? `exit code ${String(code)}`}`));
    });
  });
}

function installedPackageRoot(installRoot: string, packageName: string): string {
  return join(installRoot, "node_modules", ...packageName.split("/"));
}

export async function hydrateModelData(options: HydrateModelDataOptions): Promise<void> {
  const packageSpec = `${options.packageName}@${options.packageVersion}`;
  const installPackage = options.installPackage ?? installPackageWithNpm;
  let installRoot: string | undefined;

  try {
    installRoot = await mkdtemp(join(tmpdir(), "bangboo-pi-ai-"));
    await installPackage(packageSpec, installRoot);

    const packageRoot = installedPackageRoot(installRoot, options.packageName);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as PackageManifest;
    if (manifest.name !== options.packageName || manifest.version !== options.packageVersion) {
      throw new Error(
        `expected ${packageSpec}, got ${String(manifest.name)}@${String(manifest.version)}`,
      );
    }

    const sourceDataDir = join(packageRoot, "dist", "providers", "data");
    await readFile(join(sourceDataDir, ".manifest.json"), "utf8");

    const targetDataDir = join(options.stagePackageDir, "src", "providers", "data");
    await rm(targetDataDir, { recursive: true, force: true });
    await mkdir(dirname(targetDataDir), { recursive: true });
    await cp(sourceDataDir, targetDataDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to hydrate model data from ${packageSpec}: ${message}`, { cause: error });
  } finally {
    if (installRoot) await rm(installRoot, { recursive: true, force: true });
  }
}
