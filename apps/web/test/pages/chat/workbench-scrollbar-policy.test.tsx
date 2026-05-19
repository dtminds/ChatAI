import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import {
  installChatWorkbenchTestEnvironment,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

describe("workbench scrollbar policy", () => {
  beforeEach(() => {
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("keeps the conversation list on the default behavior and shows the message scrollbar only while scrolling", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByTestId("conversation-list-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "hover",
    );
    expect(screen.getByTestId("message-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
  });

  it("keeps the chat workbench as a horizontal desktop layout below phone widths", async () => {
    render(<ChatWorkbenchPage />);

    await screen.findByRole("textbox", { name: "请输入消息……" });

    expect(screen.getByTestId("chat-workbench-scroll-container")).toHaveClass(
      "overflow-x-auto",
      "shadow",
    );
    expect(screen.getByTestId("chat-workbench-content")).not.toHaveClass("shadow");
    expect(screen.getByTestId("chat-workbench-content")).toHaveStyle({
      minWidth: "1100px",
    });
    expect(screen.getByTestId("chat-main-layout")).toHaveStyle({
      gridTemplateColumns: "256px minmax(0, 1fr)",
    });
  });
});
