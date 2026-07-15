import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function currentFixture(runtime: ExtensionAPI): void {
  runtime.registerFlag("current-fixture", {
    description: "Loaded through the current compatibility alias",
    type: "boolean",
  });
}
