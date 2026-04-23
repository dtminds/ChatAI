import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";

describe("ChatWorkbenchPage", () => {
  beforeEach(() => {
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("sends a message from the composer", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    const composer = await screen.findByPlaceholderText("请输入消息……");
    await user.type(composer, "收到，我来帮你确认");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(composer).toHaveValue("");
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        text: "收到，我来帮你确认",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
  });

  it("switches conversation mode and shows the matching conversation", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("tab", { name: "群聊" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "群聊", selected: true })).toBeInTheDocument();
      expect(useWorkbenchStore.getState()).toMatchObject({
        activeConversationId: "conv-004",
        activeMode: "group",
      });
    });
  });

  it("shows a retry icon before failed messages and retries on click", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByTitle("念都堂"));
    await user.type(screen.getByPlaceholderText("请输入消息……"), "这条消息会失败");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(async () => {
      await useWorkbenchStore.getState().pollWorkbench();
      expect(screen.getByRole("button", { name: "重试发送" })).toBeInTheDocument();
    });

    const beforeRetryId =
      useWorkbenchStore.getState().messagesByConversationId["conv-005"].at(-1)?.id;

    await user.click(screen.getByRole("button", { name: "重试发送" }));

    await waitFor(() => {
      const latestMessage =
        useWorkbenchStore.getState().messagesByConversationId["conv-005"].at(-1);

      expect(latestMessage).toMatchObject({
        status: "sending",
      });
      expect(latestMessage?.id).not.toBe(beforeRetryId);
    });
  });

  it("loads older messages from the history action", async () => {
    const user = userEvent.setup();

    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.queryByText("会话已由 德瑞可-小可 领取")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看历史" }));

    await waitFor(() => {
      expect(screen.getByText(/会话已由 德瑞可-小可 领取/)).toBeInTheDocument();
    });
  });
});
