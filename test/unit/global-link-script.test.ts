import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(import.meta.dirname, "../../package.json");

describe("global link script", () => {
	it("builds before linking the generated coding-agent package", () => {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.["link:global"]).toBe(
			"npm run build && npm --prefix .bangboo-build/upstream/packages/coding-agent link",
		);
	});
});
