import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const resourcesDirectory = join(process.cwd(), "src/lib/backend-v2/resources");
const resourceModules = readdirSync(resourcesDirectory).filter(
  (fileName) => /\.tsx?$/.test(fileName) && !fileName.includes(".test."),
);

describe("backend-v2 resource architecture", () => {
  it("routes every resource module through the contract-aware boundary", () => {
    for (const fileName of resourceModules) {
      const source = readFileSync(`${resourcesDirectory}/${fileName}`, "utf8");

      expect(source, `${fileName} must use resourceRequest`).toMatch(
        /from\s+["']\.\.\/resource-request["']/,
      );
      expect(
        source,
        `${fileName} must not import generic transport request`,
      ).not.toMatch(
        /import\s+(?:type\s+)?\{[^}]*\brequest\b[^}]*\}\s+from\s+["']\.\.\/transport["']/,
      );
      expect(
        source,
        `${fileName} must not namespace-import transport`,
      ).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+["']\.\.\/transport["']/);
    }
  });
});
