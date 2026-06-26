import { describe, expect, it } from "vitest";
import { CONVERSATION_CUSTODY_MODE } from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";
import {
  getCustodyHostingStatusLabel,
  isCustodyHostingBusy,
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
    expect(getCustodyHostingStatusLabel("thinking")).toBe("Agent 正在查看消息");
  });

  it("labels full-auto answer progress statuses", () => {
    expect(getCustodyHostingStatusLabel("waiting")).toBe(
      "Agent 正在等待客户是否还有新消息",
    );
    expect(getCustodyHostingStatusLabel("generating")).toBe("Agent 正在思考回复话术");
    expect(getCustodyHostingStatusLabel("sending")).toBe("Agent 回复已生成，正在发送");
    expect(getCustodyHostingStatusLabel("sent")).toBe(
      "Agent 已发送回复，正在等待用户消息",
    );
    expect(getCustodyHostingStatusLabel("failed")).toBe("Agent 遇到了一些问题");
    expect(getCustodyHostingStatusLabel("handoff")).toBe("Agent 已转人工处理");
    expect(getCustodyHostingStatusLabel("sendFailed")).toBe("Agent 回复发送失败");
    expect(getCustodyHostingStatusLabel("sendPartialFailed")).toBe(
      "Agent 回复部分发送失败",
    );
  });

  it("only uses white cancel button styling for active full custody", () => {
    expect(shouldUseFullCustodyCancelButton("active")).toBe(true);
    expect(shouldUseFullCustodyCancelButton("retrying")).toBe(false);
    expect(shouldUseFullCustodyCancelButton("thinking")).toBe(false);
    expect(shouldUseFullCustodyCancelButton("exited")).toBe(false);
  });

  it("treats in-progress full-auto statuses as busy", () => {
    expect(isCustodyHostingBusy("thinking")).toBe(true);
    expect(isCustodyHostingBusy("waiting")).toBe(true);
    expect(isCustodyHostingBusy("generating")).toBe(true);
    expect(isCustodyHostingBusy("sending")).toBe(true);
    expect(isCustodyHostingBusy("retrying")).toBe(true);

    expect(isCustodyHostingBusy("active")).toBe(false);
    expect(isCustodyHostingBusy("sent")).toBe(false);
    expect(isCustodyHostingBusy("failed")).toBe(false);
    expect(isCustodyHostingBusy("handoff")).toBe(false);
    expect(isCustodyHostingBusy("sendFailed")).toBe(false);
    expect(isCustodyHostingBusy("sendPartialFailed")).toBe(false);
    expect(isCustodyHostingBusy("exited")).toBe(false);
  });
});
