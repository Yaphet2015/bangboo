import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const archiveArgument = process.argv[2];
if (!archiveArgument) throw new Error("Usage: npm run smoke:tarball -- <bangboo.tgz>");

const archive = resolve(archiveArgument);
await access(archive);
const buildManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const expectedVersion = buildManifest.version;
const root = await mkdtemp(join(tmpdir(), "bangboo-tarball-smoke-"));
const cleanPrefix = join(root, "clean-prefix");
const upgradePrefix = join(root, "upgrade-prefix");
const oldPackage = join(root, "old-package");

async function npm(args: string[], cwd = root): Promise<string> {
  const result = await execFileAsync("npm", args, { cwd, timeout: 180_000 });
  return result.stdout;
}

async function runInstalled(prefix: string): Promise<string> {
  const executable = join(prefix, "node_modules", ".bin", process.platform === "win32" ? "bangboo.cmd" : "bangboo");
  const result = await execFileAsync(executable, ["--version"], {
    env: { ...process.env, BANGBOO_OFFLINE: "1", NO_COLOR: "1" },
    timeout: 60_000,
  });
  return result.stdout.trim();
}

async function assertUninstalled(prefix: string): Promise<void> {
  try {
    await access(join(prefix, "node_modules", "bangboo"));
  } catch {
    return;
  }
  throw new Error(`bangboo remains installed under ${prefix}`);
}

try {
  await npm(["install", "--prefix", cleanPrefix, "--ignore-scripts", "--no-package-lock", archive]);
  const cleanVersion = await runInstalled(cleanPrefix);
  if (!cleanVersion.startsWith(`bangboo ${expectedVersion} `)) {
    throw new Error(`Unexpected clean install version: ${cleanVersion}`);
  }
  await npm(["uninstall", "--prefix", cleanPrefix, "--no-package-lock", "bangboo"]);
  await assertUninstalled(cleanPrefix);

  await mkdir(oldPackage, { recursive: true });
  await writeFile(
    join(oldPackage, "package.json"),
    `${JSON.stringify({ name: "bangboo", version: "0.0.0", bin: { bangboo: "old.js" }, files: ["old.js"] }, null, 2)}\n`,
    "utf8",
  );
  const oldEntry = join(oldPackage, "old.js");
  await writeFile(oldEntry, "#!/usr/bin/env node\nconsole.log('bangboo 0.0.0');\n", "utf8");
  await chmod(oldEntry, 0o755);
  await npm(["pack", "--ignore-scripts"], oldPackage);
  const oldArchive = join(oldPackage, "bangboo-0.0.0.tgz");

  await npm(["install", "--prefix", upgradePrefix, "--ignore-scripts", "--no-package-lock", oldArchive]);
  if ((await runInstalled(upgradePrefix)) !== "bangboo 0.0.0") throw new Error("Old-version fixture was not installed");
  await npm(["install", "--prefix", upgradePrefix, "--ignore-scripts", "--no-package-lock", archive]);
  const upgradedVersion = await runInstalled(upgradePrefix);
  if (!upgradedVersion.startsWith(`bangboo ${expectedVersion} `)) {
    throw new Error(`Upgrade did not install the tarball: ${upgradedVersion}`);
  }
  await npm(["uninstall", "--prefix", upgradePrefix, "--no-package-lock", "bangboo"]);
  await assertUninstalled(upgradePrefix);

  console.log(`Tarball smoke test passed for ${basename(archive)}.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
