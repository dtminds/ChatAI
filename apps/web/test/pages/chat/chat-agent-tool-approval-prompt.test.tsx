import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatAgentToolApprovalPrompt } from "@/pages/chat/components/chat-agent-tool-approval-prompt";

const approval = {
  decisionId: "decision-call-1",
  toolCall: {
    approvalMode: "human" as const,
    callId: "call-1",
    category: "business" as const,
    input: { orderId: "20984239842348" },
    name: "order.bind",
    summary: "绑定订单",
    type: "tool_call" as const,
  },
};

describe("ChatAgentToolApprovalPrompt", () => {
  it("shows read-only tool input and returns each approval decision", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onRedirect = vi.fn();
    const onReject = vi.fn();

    render(
      <ChatAgentToolApprovalPrompt
        approval={approval}
        onApprove={onApprove}
        onRedirect={onRedirect}
        onReject={onReject}
      />,
    );

    expect(screen.getByText("订单号")).toBeInTheDocument();
    expect(screen.getByText("20984239842348")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("20984239842348")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(onApprove).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "拒绝" }));
    expect(onReject).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "拒绝并告知其他方式" }),
    );
    const instructionInput = await screen.findByRole("textbox", {
      name: "告诉 AI 其他处理方式",
    });
    await user.type(instructionInput, "  先核对客户身份再绑定  ");
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(onRedirect).toHaveBeenCalledWith("先核对客户身份再绑定");
  });
});
