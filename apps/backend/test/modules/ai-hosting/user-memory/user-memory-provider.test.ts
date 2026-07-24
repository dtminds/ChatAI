import { describe, expect, it } from "vitest";
import { emptyUserMemoryDocument } from "../../../../src/modules/ai-hosting/user-memory/user-memory-domain.js";
import { buildUserMemoryPrompt } from "../../../../src/modules/ai-hosting/user-memory/user-memory-provider.js";

describe("user memory prompt", () => {
  it("contains only bounded memory context and message evidence, not customer identifiers", () => {
    const prompt = buildUserMemoryPrompt({ document: emptyUserMemoryDocument(), now: 1, messages: [{ sourceMessageId: 2, sessionId: 3, senderRole: "customer", occurredAt: 4, text: "偏好无糖" }] });
    const serialized = JSON.stringify(prompt);
    expect(serialized).toContain("偏好无糖");
    expect(serialized).not.toContain("thirdExternalUserId");
    expect(serialized).not.toContain('"uid"');
  });
});
