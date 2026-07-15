import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseUpstreamLock } from "../src/upstream-lock.js";
import { buildUpdatedLock, markCompatibilityPending, replaceProvenance } from "../src/upstream-update.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "upstream.lock.json");
const current = parseUpstreamLock(await readFile(lockPath, "utf8"));
const encodedPackage = encodeURIComponent(current.codingAgent.package).replace("%40", "@");
const registryUrl = `https://registry.npmjs.org/${encodedPackage}/latest`;

const response = await fetch(registryUrl, {
  headers: { accept: "application/json", "user-agent": "bangboo-upstream-check/0.1.0" },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
const metadata = (await response.json()) as { name?: unknown; version?: unknown };
if (metadata.name !== current.codingAgent.package || typeof metadata.version !== "string") {
  throw new Error("Unexpected npm registry metadata for coding-agent runtime");
}

if (metadata.version === current.codingAgent.version) {
  console.log(`Upstream is current at ${current.tag} (${current.commit}).`);
  process.exit(0);
}

const tag = `v${metadata.version}`;
const { stdout } = await execFileAsync("git", [
  "ls-remote",
  "--tags",
  current.repository,
  `refs/tags/${tag}`,
  `refs/tags/${tag}^{}`,
]);
const refs = stdout
  .trim()
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => line.split(/\s+/u) as [string, string]);
const commit = refs.find(([, ref]) => ref.endsWith("^{}"))?.[0] ?? refs[0]?.[0];
if (!commit) throw new Error(`Could not resolve upstream tag ${tag}`);

const updated = buildUpdatedLock(current, metadata.version, commit);
if (!process.argv.includes("--write")) {
  console.log(`Upstream update available: ${current.tag} -> ${updated.tag} (${updated.commit}).`);
  process.exitCode = 2;
} else {
  await writeFile(lockPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  const patchFiles = (await readdir(join(root, "patches")))
    .filter((name) => name.endsWith(".patch"))
    .map((name) => join(root, "patches", name));
  const compatibilityReport = join(root, "UPSTREAM_COMPATIBILITY.md");
  for (const path of [...patchFiles, join(root, "README.md"), join(root, "NOTICE"), compatibilityReport]) {
    const content = await readFile(path, "utf8");
    const updatedContent = replaceProvenance(content, current, updated);
    await writeFile(path, path === compatibilityReport ? markCompatibilityPending(updatedContent) : updatedContent, "utf8");
  }
  console.log(`Updated upstream lock and provenance to ${updated.tag} (${updated.commit}).`);
}
