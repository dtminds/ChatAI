import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";

describe("workbench scrollbar policy", () => {
  it("keeps the conversation list on the default behavior and shows the message scrollbar only while scrolling", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByPlaceholderText("请输入消息……");

    expect(screen.getByTestId("conversation-list-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "hover",
    );
    expect(screen.getByTestId("message-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
  });
});
