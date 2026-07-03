import { describe, expect, it } from "vitest";
import type { Conversation } from "@/pages/chat/chat-types";
import {
  getAgentHostingStatusLabel,
  isAgentHostingBusy,
  resolveAgentHostingStatus,
  shouldUsePrimaryAgentHostingAction,
} from "@/pages/chat/lib/chat-agent-hosting-status";

const baseConversation: Conversation = {
  accountId: "account-1",
  conversationAIHostingSwitch: false,
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

describe("chat agent hosting status helpers", () => {
  it("returns null for semi agent mode conversations", () => {
    expect(resolveAgentHostingStatus(baseConversation)).toBeNull();
  });

  it("returns exited status when agentHostingStatus is exited", () => {
    expect(
      resolveAgentHostingStatus({
        ...baseConversation,
        agentHostingStatus: "exited",
        conversationAIHostingSwitch: false,
      }),
    ).toBe("exited");
    expect(getAgentHostingStatusLabel("exited")).toBe("当前已退出全托管模式");
  });

  it("returns active status for full agent mode conversations by default", () => {
    expect(
      resolveAgentHostingStatus({
        ...baseConversation,
        conversationAIHostingSwitch: true,
      }, true),
    ).toBe("active");
  });

  it("uses conversation agentHostingStatus when provided", () => {
    expect(
      resolveAgentHostingStatus({
        ...baseConversation,
        agentHostingStatus: "thinking",
        conversationAIHostingSwitch: true,
      }, true),
    ).toBe("thinking");
    expect(getAgentHostingStatusLabel("thinking")).toBe("Agent 正在查看消息");
  });

  it("labels full-auto answer progress statuses", () => {
    expect(getAgentHostingStatusLabel("waiting")).toBe(
      "Agent 正在等待客户补充消息",
    );
    expect(getAgentHostingStatusLabel("generating")).toBe("Agent 正在思考回复话术");
    expect(getAgentHostingStatusLabel("sending")).toBe("Agent 回复已生成，正在发送");
    expect(getAgentHostingStatusLabel("sent")).toBe(
      "Agent 已发送回复，本轮对话结束",
    );
    expect(getAgentHostingStatusLabel("failed")).toBe("Agent 遇到了一些问题");
    expect(getAgentHostingStatusLabel("handoff")).toBe("Agent 已转人工处理");
    expect(getAgentHostingStatusLabel("sendFailed")).toBe("Agent 回复发送失败");
    expect(getAgentHostingStatusLabel("sendPartialFailed")).toBe(
      "Agent 回复部分发送失败",
    );
  });

  it("only uses white cancel button styling for active full agent mode", () => {
    expect(shouldUsePrimaryAgentHostingAction("active")).toBe(true);
    expect(shouldUsePrimaryAgentHostingAction("retrying")).toBe(false);
    expect(shouldUsePrimaryAgentHostingAction("thinking")).toBe(false);
    expect(shouldUsePrimaryAgentHostingAction("exited")).toBe(false);
  });

  it("treats in-progress full-auto statuses as busy", () => {
    expect(isAgentHostingBusy("thinking")).toBe(true);
    expect(isAgentHostingBusy("waiting")).toBe(false);
    expect(isAgentHostingBusy("generating")).toBe(true);
    expect(isAgentHostingBusy("sending")).toBe(true);
    expect(isAgentHostingBusy("retrying")).toBe(true);

    expect(isAgentHostingBusy("active")).toBe(false);
    expect(isAgentHostingBusy("sent")).toBe(false);
    expect(isAgentHostingBusy("failed")).toBe(false);
    expect(isAgentHostingBusy("handoff")).toBe(false);
    expect(isAgentHostingBusy("sendFailed")).toBe(false);
    expect(isAgentHostingBusy("sendPartialFailed")).toBe(false);
    expect(isAgentHostingBusy("exited")).toBe(false);
  });
});
