import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const settingsAvatarFiles = [
  "pages/chat/settings/pages/accounts-settings-page.tsx",
  "pages/chat/settings/pages/sub-accounts-settings-page.tsx",
];

describe("avatar URL source policy", () => {
  it("keeps settings account avatars on the shared AvatarImage path", () => {
    for (const relativePath of settingsAvatarFiles) {
      const content = readFileSync(join(sourceRoot, relativePath), "utf8");

      expect(content).toContain("AvatarImage");
      expect(content).not.toContain("normalizeAvatarUrl");
      expect(content).not.toContain("<img");
    }
  });
});
