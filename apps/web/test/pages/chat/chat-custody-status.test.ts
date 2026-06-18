import { describe, expect, it } from "vitest";
import { CONVERSATION_CUSTODY_MODE } from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";
import {
  getCustodyHostingStatusLabel,
  resolveCustodyHostingStatus,
  shouldUseFullCustodyCancelButton,
} from "@/pages/chat/lib/chat-custody-status";

const baseConversation: Conversation = {
  accountId: "account-1",
  custodyMode: CONVERSATION_CUSTODY_MODE.SEMI,
  customerAvatarUrl: "https://example.com/customer.png",
  customerId: "customer-1",
  customerName: "测试客户",
  id: "conversation-1",
  mode: "single",
  preview: "你好",
  priority: "medium",
  quietFor: "1天没聊了",
  unread: 0,
  updatedAt: "2026-05-07 09:00:00",
};

describe("chat custody status helpers", () => {
  it("returns null for semi custody conversations", () => {
    expect(resolveCustodyHostingStatus(baseConversation)).toBeNull();
  });

  it("returns exited status when custodyHostingStatus is exited", () => {
    expect(
      resolveCustodyHostingStatus({
        ...baseConversation,
        custodyHostingStatus: "exited",
        custodyMode: CONVERSATION_CUSTODY_MODE.SEMI,
      }),
    ).toBe("exited");
    expect(getCustodyHostingStatusLabel("exited")).toBe("当前已退出全托管模式");
  });

  it("returns active status for full custody conversations by default", () => {
    expect(
      resolveCustodyHostingStatus({
        ...baseConversation,
        custodyMode: CONVERSATION_CUSTODY_MODE.FULL,
      }),
    ).toBe("active");
  });

  it("uses conversation custodyHostingStatus when provided", () => {
    expect(
      resolveCustodyHostingStatus({
        ...baseConversation,
        custodyHostingStatus: "thinking",
        custodyMode: CONVERSATION_CUSTODY_MODE.FULL,
      }),
    ).toBe("thinking");
    expect(getCustodyHostingStatusLabel("thinking")).toBe("思考中...");
  });

  it("only uses white cancel button styling for active full custody", () => {
    expect(shouldUseFullCustodyCancelButton("active")).toBe(true);
    expect(shouldUseFullCustodyCancelButton("retrying")).toBe(false);
    expect(shouldUseFullCustodyCancelButton("thinking")).toBe(false);
    expect(shouldUseFullCustodyCancelButton("exited")).toBe(false);
  });
});
