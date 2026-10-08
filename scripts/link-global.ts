import { spawn } from "node:child_process";
import { rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmCommand } from "../src/npm-command.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(root, ".bangboo-build", "upstream", "packages", "coding-agent", "dist", "bangboo.js");

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}`));
    });
  });
}

// `npm link` packs the staged package and extracts the tarball over the staged
// directory, which drops src/ and test/ that the "files" field excludes. A
// plain symlink (or .cmd shim on Windows) gives the same live dev link without
// destroying the staged tree.
const resolved = resolveNpmCommand(["config", "get", "prefix"]);
const prefix = (await capture(resolved.command, resolved.args)).trim();
const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
const linkName = process.platform === "win32" ? "bangboo.cmd" : "bangboo";
const linkPath = join(binDir, linkName);

try {
  await stat(cliEntry);
} catch {
  throw new Error(`Built CLI not found at ${cliEntry}. Run npm run build first.`);
}

await rm(linkPath, { force: true });
if (process.platform === "win32") {
  await writeFile(linkPath, `@node "${cliEntry}" %*\r\n`);
} else {
  await symlink(cliEntry, linkPath);
}

console.log(`Linked ${linkPath} -> ${cliEntry}`);
