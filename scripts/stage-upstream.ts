import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUpstreamLock } from "../src/upstream-lock.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache", "pi-upstream");
const stageDir = join(root, ".bangboo-build", "upstream");
const patchDir = join(root, "patches");
const packageDir = join(stageDir, "packages", "coding-agent");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[], cwd = root, allowFailure = false): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0 || allowFailure) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${String(code)}`}`));
    });
  });
}

async function copyOwnedFile(name: string): Promise<void> {
  const source = join(root, name);
  if (await exists(source)) {
    await copyFile(source, join(packageDir, name));
  }
}

async function stage(): Promise<void> {
  const lock = parseUpstreamLock(await readFile(join(root, "upstream.lock.json"), "utf8"));

  await mkdir(dirname(cacheDir), { recursive: true });
  if (!(await exists(join(cacheDir, ".git")))) {
    await run("git", ["clone", "--filter=blob:none", "--no-checkout", lock.repository, cacheDir]);
  } else {
    await run("git", ["remote", "set-url", "origin", lock.repository], cacheDir);
  }
  await run("git", ["fetch", "--force", "origin", lock.commit], cacheDir);

  await run("git", ["worktree", "remove", "--force", stageDir], cacheDir, true);
  await rm(stageDir, { recursive: true, force: true });
  await run("git", ["worktree", "prune"], cacheDir);
  await mkdir(dirname(stageDir), { recursive: true });
  await run("git", ["worktree", "add", "--detach", stageDir, lock.commit], cacheDir);

  const sourceManifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
  };
  if (sourceManifest.name !== lock.codingAgent.package || sourceManifest.version !== lock.codingAgent.version) {
    throw new Error(
      `Upstream package mismatch: expected ${lock.codingAgent.package}@${lock.codingAgent.version}, got ${String(sourceManifest.name)}@${String(sourceManifest.version)}`,
    );
  }

  const patches = (await readdir(patchDir)).filter((name) => name.endsWith(".patch")).sort();
  if (patches.length === 0) throw new Error("No Bangboo patches found");
  for (const patch of patches) {
    const path = join(patchDir, patch);
    await run("git", ["apply", "--check", path], stageDir);
    await run("git", ["apply", path], stageDir);
  }

  await Promise.all([copyOwnedFile("README.md"), copyOwnedFile("LICENSE"), copyOwnedFile("NOTICE")]);

  const bangbooManifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
    bangboo?: { runtimeVersion?: string; upstreamCommit?: string };
  };
  if (
    bangbooManifest.name !== "bangboo" ||
    bangbooManifest.version !== "0.1.0" ||
    bangbooManifest.bangboo?.runtimeVersion !== lock.codingAgent.version ||
    bangbooManifest.bangboo.upstreamCommit !== lock.commit
  ) {
    throw new Error("Staged Bangboo metadata does not match upstream.lock.json");
  }
}

async function build(): Promise<void> {
  await run("npm", ["ci", "--ignore-scripts"], stageDir);
  for (const workspace of ["packages/tui", "packages/ai", "packages/agent", "packages/coding-agent"]) {
    await run("npm", ["run", "build"], join(stageDir, workspace));
  }
}

async function pack(): Promise<void> {
  const artifacts = join(root, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await run("npm", ["pack", "--ignore-scripts", "--pack-destination", artifacts], packageDir);
}

const argumentsSet = new Set(process.argv.slice(2));
await stage();
if (argumentsSet.has("--build") || argumentsSet.has("--pack")) await build();
if (argumentsSet.has("--pack")) await pack();

console.log(`Bangboo staging ready at ${stageDir}`);
