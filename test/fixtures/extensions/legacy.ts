import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function legacyFixture(runtime: ExtensionAPI): void {
  runtime.registerFlag("legacy-fixture", {
    description: "Loaded through the legacy compatibility alias",
    type: "boolean",
  });
}
