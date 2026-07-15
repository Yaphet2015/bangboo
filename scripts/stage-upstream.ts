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
    const testArguments = ["test", "--", "--retry=2"];
    // Upstream #5303 assumes a 50ms shell sleep always beats a 100ms idle
    // grace. That is not true on GitHub's macOS ARM runners even when files run
    // serially. Linux still executes this regression; Darwin excludes only the
    // platform-unreliable timing assertion and runs the rest of the suite.
    if (process.platform === "darwin") {
      testArguments.push("--exclude", "test/suite/regressions/5303-bash-output-truncation.test.ts");
    }
    if (process.platform === "win32") {
      // These pristine v0.80.7 tests encode POSIX permissions, signals, paths,
      // or glob semantics and fail consistently on GitHub's Windows runner.
      // Linux/macOS execute them; Windows still runs every other upstream file.
      // Serial execution avoids overlapping watcher fixture teardown. The
      // footer-data-provider suite must also run in its own Vitest process:
      // libuv can otherwise deliver a late Windows fs-event while later git
      // update tests are replacing unrelated temporary repositories.
      testArguments.push("--no-file-parallelism");
      const isolatedWindowsTests = ["test/footer-data-provider.test.ts"];
      const incompatibleWindowsTests = [
        "test/config.test.ts",
        "test/footer-width.test.ts",
        "test/interactive-mode-suspend.test.ts",
        "test/package-command-paths.test.ts",
        "test/sdk-session-manager.test.ts",
        "test/suite/regressions/2791-fswatch-error-crash.test.ts",
        "test/suite/regressions/3302-find-path-glob.test.ts",
        "test/tools.test.ts",
        "test/trust-selector.test.ts",
      ];
      for (const path of isolatedWindowsTests) testArguments.push("--exclude", path);
      for (const path of incompatibleWindowsTests) testArguments.push("--exclude", path);
      await run("npm", testArguments, packageDir);
      for (const path of isolatedWindowsTests) {
        await run("npm", ["test", "--", "--retry=2", "--no-file-parallelism", path], packageDir);
      }
      testArguments.length = 0;
    }
    if (testArguments.length > 0) await run("npm", testArguments, packageDir);
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
