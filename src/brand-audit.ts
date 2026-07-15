export interface BrandViolation {
  path: string;
  line: number;
  text: string;
}

const COMPATIBILITY_IMPORT = /@(?:earendil-works|mariozechner)\/pi-[A-Za-z0-9./_-]+/gu;
const COMPATIBILITY_ENV = /\bPI_[A-Z0-9_]+\b/gu;
const FORBIDDEN_PATTERNS = [/\bpi\b/iu, /~\/\.pi(?:\/|\b)/u, /(?:^|[^A-Za-z0-9_])\.pi\//u, /pi\.dev/iu];

export function findBrandViolations(path: string, content: string, allowedLines: RegExp[] = []): BrandViolation[] {
  const violations: BrandViolation[] = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (allowedLines.some((pattern) => pattern.test(line))) continue;
    const sanitized = line.replace(COMPATIBILITY_IMPORT, "").replace(COMPATIBILITY_ENV, "");
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(sanitized))) {
      violations.push({ path, line: index + 1, text: line.trim() });
    }
  }
  return violations;
}
