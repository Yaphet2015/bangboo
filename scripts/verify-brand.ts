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
  "core/bug-report.ts",
  "core/export-html/template.html",
  "core/project-trust.ts",
  "core/provider-attribution.ts",
  "core/session-manager.ts",
  "core/slash-commands.ts",
  "core/system-prompt.ts",
  "main.ts",
  "modes/interactive/bug-report.ts",
  "modes/interactive/components/extension-editor.ts",
  "modes/interactive/components/first-time-setup.ts",
  "modes/interactive/components/settings-selector.ts",
  "modes/interactive/interactive-mode.ts",
  "modes/interactive/session-share.ts",
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
  "../CHANGELOG.md": [
    // Community plugin package names, not product branding.
    /pi-subagents/u,
    /pi-web-access/u,
  ],
  "package-manager-cli.ts": [
    /source === "pi"/u,
    // Intentional install-time compatibility warning that must reference .pi
    // to be meaningful; it is a developer-facing notice, not product branding.
    /Compatibility notice for/u,
    // Shared user-agent helper module name.
    /pi-user-agent/u,
    // Managed-install marker written by the upstream launcher; the layout is
    // a compatibility identifier, not user-facing branding.
    /pi-managed-install/u,
    // Upstream managed-installer API endpoint. Only reachable when a Pi
    // launcher sets PI_MANAGED_INSTALL_ROOT/PI_INSTALLER_API_BASE; Bangboo
    // ships no launcher, so the endpoint is dead code for Bangboo users. The
    // user-facing install.sh/ps1 migration hint was swept in patch 0004.
    /pi\.dev\/api\/installer/u,
  ],
  "config.ts": [
    // Upstream npm age-gate rationale references pi.dev release cadence;
    // comment-only, not user-facing branding.
    /pi\.dev advertises/u,
    // Codemode worker ships inside the upstream pi-codemode package.
    /pi-codemode/u,
    // Update-in-place detection references the upstream `pi update` command.
    /`pi update`/u,
  ],
  "core/bug-report.ts": [
    // Wire-format session entry type consumed by the share viewer.
    /pi\.bug-report/u,
    // Shared user-agent helper module name.
    /pi-user-agent/u,
  ],
  "core/session-manager.ts": [/pi-generated/u, /~\/\.pi/u, /pi session/u, /closing pi without chatting/u],
  "main.ts": [/successful `pi update`/u],
  "modes/interactive/components/extension-editor.ts": [/pi-extension-editor/u],
  "modes/interactive/interactive-mode.ts": [
    /gained a \.pi/u,
    /pi-clipboard/u,
    /\bin pi\)/u,
    /pi-editor/u,
    // The bundled π wordmark renderer lives in the upstream pi-logo module.
    /pi-logo\.ts/u,
  ],
  "modes/interactive/session-share.ts": [
    // Trailing entry customType is part of the shared session wire format.
    /pi\.share/u,
  ],
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
