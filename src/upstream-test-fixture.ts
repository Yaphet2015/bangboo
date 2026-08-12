import { readFile, writeFile } from "node:fs/promises";

interface FixtureFileOperations {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

const defaultFileOperations: FixtureFileOperations = {
  read: (path) => readFile(path, "utf8"),
  write: (path, content) => writeFile(path, content, "utf8"),
};

export async function withTemporaryFileContents(
  path: string,
  transform: (original: string) => string,
  action: () => Promise<void>,
  fileOperations: FixtureFileOperations = defaultFileOperations,
): Promise<void> {
  const original = await fileOperations.read(path);
  const temporary = transform(original);

  try {
    await fileOperations.write(path, temporary);
    await action();
  } finally {
    await fileOperations.write(path, original);
  }
}
