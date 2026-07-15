import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrandViolations, type BrandViolation } from "../src/brand-audit.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, ".bangboo-build", "upstream", "packages", "coding-agent", "src");
const files = [
  "../CHANGELOG.md",
  "cli/args.ts",
  "cli/startup-ui.ts",
  "config.ts",
  "core/export-html/template.html",
  "core/project-trust.ts",
  "core/provider-attribution.ts",
  "core/session-manager.ts",
  "core/system-prompt.ts",
  "main.ts",
  "modes/interactive/components/extension-editor.ts",
  "modes/interactive/components/first-time-setup.ts",
  "modes/interactive/components/settings-selector.ts",
  "modes/interactive/interactive-mode.ts",
  "package-manager-cli.ts",
  "utils/pi-user-agent.ts",
  "utils/version-check.ts",
];

try {
  await access(sourceRoot);
} catch {
  throw new Error("Staged source not found. Run npm run stage first.");
}

const allowedByFile: Record<string, RegExp[]> = {
  "package-manager-cli.ts": [/source === "pi"/u],
  "core/session-manager.ts": [/pi-generated/u, /~\/\.pi/u, /pi session/u],
  "main.ts": [/successful `pi update`/u],
  "modes/interactive/components/extension-editor.ts": [/pi-extension-editor/u],
  "modes/interactive/interactive-mode.ts": [/gained a \.pi/u, /pi-clipboard/u, /\bin pi\)/u, /pi-editor/u],
  "utils/version-check.ts": [/pi-user-agent/u],
};
const violations: BrandViolation[] = [];
for (const file of files) {
  const path = join(sourceRoot, file);
  violations.push(
    ...findBrandViolations(relative(root, path), await readFile(path, "utf8"), allowedByFile[file] ?? []),
  );
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.path}:${violation.line}: ${violation.text}`);
  }
  process.exitCode = 1;
  throw new Error(`Brand audit found ${violations.length} violation(s)`);
}

console.log(`Brand audit passed for ${files.length} user-facing source files.`);
