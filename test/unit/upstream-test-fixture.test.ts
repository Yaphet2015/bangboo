import { describe, expect, test, vi } from "vitest";
import { withTemporaryFileContents } from "../../src/upstream-test-fixture.js";

describe("withTemporaryFileContents", () => {
  test("restores the exact original when the temporary write fails", async () => {
    const writes: string[] = [];
    const original = "upstream fixture\n";
    const write = vi.fn(async (_path: string, content: string) => {
      writes.push(content);
      if (writes.length === 1) throw new Error("partial temporary write");
    });
    const action = vi.fn(async () => undefined);

    await expect(
      withTemporaryFileContents("fixture.ts", (content) => `${content}stabilized\n`, action, {
        read: async () => original,
        write,
      }),
    ).rejects.toThrow("partial temporary write");

    expect(writes).toEqual([`${original}stabilized\n`, original]);
    expect(action).not.toHaveBeenCalled();
  });

  test("restores the exact original when the guarded action fails", async () => {
    const writes: string[] = [];
    const original = "upstream fixture\n";

    await expect(
      withTemporaryFileContents(
        "fixture.ts",
        (content) => `${content}stabilized\n`,
        async () => {
          throw new Error("upstream tests failed");
        },
        {
          read: async () => original,
          write: async (_path, content) => {
            writes.push(content);
          },
        },
      ),
    ).rejects.toThrow("upstream tests failed");

    expect(writes).toEqual([`${original}stabilized\n`, original]);
  });
});
