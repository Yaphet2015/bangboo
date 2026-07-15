import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function conventionalFixture(runtime: ExtensionAPI): void {
  runtime.registerFlag("conventional-fixture", {
    description: "Loaded from a conventional package directory",
    type: "boolean",
  });
}
