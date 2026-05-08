import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";

describe("workbench scrollbar policy", () => {
  it("uses scroll-triggered overlay scrollbars in the conversation list and message detail", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.getByTestId("conversation-list-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
    expect(screen.getByTestId("message-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
  });
});
