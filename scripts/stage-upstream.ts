import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmCommand } from "../src/npm-command.js";
import { parseUpstreamLock } from "../src/upstream-lock.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache", "pi-upstream");
const stageDir = join(root, ".bangboo-build", "upstream");
const patchDir = join(root, "patches");
const packageDir = join(stageDir, "packages", "coding-agent");
let runtimeDependenciesBuilt = false;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[], cwd = root, allowFailure = false): Promise<void> {
  const resolved = command === "npm" ? resolveNpmCommand(args) : { command, args };
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(resolved.command, resolved.args, { cwd, stdio: "inherit", env: process.env });
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

async function buildRuntimeDependencies(): Promise<void> {
  if (runtimeDependenciesBuilt) return;
  await run("npm", ["run", "build"], join(stageDir, "packages", "tui"));
  await run("npm", ["exec", "--offline", "--", "tsgo", "-p", "tsconfig.build.json"], join(stageDir, "packages", "ai"));
  await run("npm", ["run", "build"], join(stageDir, "packages", "agent"));
  runtimeDependenciesBuilt = true;
}

async function stage(installDependencies: boolean, testUpstream: boolean): Promise<void> {
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

  // Install while coding-agent still has its upstream workspace name. Renaming it
  // first makes npm treat orchestrator's peer as an external registry dependency.
  if (installDependencies) {
    await run("npm", ["ci", "--ignore-scripts"], stageDir);
  }

  // Run the pristine upstream suite before branding changes its deliberate
  // identity and path expectations. Bangboo-specific behavior is tested after
  // patching by the repository integration suite.
  if (testUpstream) {
    await buildRuntimeDependencies();
    // A few upstream fs.watch/process-drain tests can miss an event under a
    // saturated CI runner. Two per-test retries filter those timing flakes
    // while preserving the suite as a hard gate for deterministic failures.
    await run("npm", ["test", "--", "--retry=2"], packageDir);
  }

  const patches = (await readdir(patchDir)).filter((name) => name.endsWith(".patch")).sort();
  if (patches.length === 0) throw new Error("No Bangboo patches found");
  for (const patch of patches) {
    const path = join(patchDir, patch);
    await run("git", ["apply", "--check", path], stageDir);
    await run("git", ["apply", path], stageDir);
  }

  await Promise.all([
    copyOwnedFile("README.md"),
    copyOwnedFile("LICENSE"),
    copyOwnedFile("NOTICE"),
    copyOwnedFile("CHANGELOG.md"),
  ]);

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
  await buildRuntimeDependencies();
  await run("npm", ["run", "build"], packageDir);
}

async function pack(): Promise<void> {
  const artifacts = join(root, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await run("npm", ["pack", "--ignore-scripts", "--pack-destination", artifacts], packageDir);
}

const argumentsSet = new Set(process.argv.slice(2));
const shouldBuild = argumentsSet.has("--build") || argumentsSet.has("--pack");
const shouldTestUpstream = argumentsSet.has("--upstream-test") || argumentsSet.has("--pack");
await stage(shouldBuild || shouldTestUpstream, shouldTestUpstream);
if (shouldBuild) await build();
if (argumentsSet.has("--pack")) await pack();

console.log(`Bangboo staging ready at ${stageDir}`);
