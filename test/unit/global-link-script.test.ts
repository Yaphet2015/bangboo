import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(import.meta.dirname, "../../package.json");

describe("global link script", () => {
	it("builds before linking, without npm link replacing the staged tree", () => {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			scripts?: Record<string, string>;
		};

		// npm link packs the staged package and extracts the tarball over the
		// staged directory, dropping src/ and test/ that the "files" field
		// excludes. The dedicated script symlinks the built CLI instead.
		expect(packageJson.scripts?.["link:global"]).toBe("npm run build && tsx scripts/link-global.ts");
	});
});
