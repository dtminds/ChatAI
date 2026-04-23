import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("sends a message from the composer", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = screen.getByPlaceholderText("请输入消息……");
    await user.type(composer, "收到，我来帮你确认");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(composer).toHaveValue("");
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        type: "text",
        text: "收到，我来帮你确认",
      },
      role: "agent",
    });
  });

  it("switches conversation mode and shows the matching conversation", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await user.click(screen.getByRole("tab", { name: "群聊" }));

    expect(screen.getByRole("tab", { name: "群聊", selected: true })).toBeInTheDocument();
    expect(screen.getAllByText("营养群-4月减脂冲刺")).toHaveLength(2);
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeConversationId: "conv-004",
      activeMode: "group",
    });
  });
});
