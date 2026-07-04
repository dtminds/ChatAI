import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import {
  installChatWorkbenchTestEnvironment,
  renderWithChatWorkbenchRouter,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";
import {
  mockViewportMediaQuery,
  restoreViewportMediaQuery,
} from "./media-query-test-utils";

describe("workbench scrollbar policy", () => {
  beforeEach(() => {
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  afterEach(() => {
    restoreViewportMediaQuery();
  });

  it("keeps the conversation list on the default behavior and shows the message scrollbar only while scrolling", async () => {
    renderWithChatWorkbenchRouter(<ChatWorkbenchPage />);

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
    renderWithChatWorkbenchRouter(<ChatWorkbenchPage />);

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

  it("uses a mobile IM flow with collapsed account rail on the list and full-width chat detail", async () => {
    const user = userEvent.setup();
    mockViewportMediaQuery({ width: 390 });

    renderWithChatWorkbenchRouter(<ChatWorkbenchPage />);

    await screen.findByTestId("conversation-card-conv-001");

    const mobileListLayout = screen.getByTestId("chat-mobile-list-layout");
    expect(mobileListLayout).toBeInTheDocument();
    expect(
      within(mobileListLayout).getByRole("navigation", { name: "侧栏导航" }),
    ).toBeInTheDocument();
    expect(
      within(mobileListLayout).queryByRole("button", { name: "展开侧栏" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "请输入消息……" })).not.toBeInTheDocument();

    await user.click(getConversationCardMainButton("conv-001"));

    expect(await screen.findByRole("textbox", { name: "请输入消息……" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回会话列表" })).toBeInTheDocument();
    expect(screen.queryByTestId("chat-mobile-list-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-mobile-detail-layout")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
    expect(screen.getByTestId("chat-mobile-detail-layout").firstElementChild).toHaveClass(
      "h-full",
      "min-h-0",
      "flex",
      "flex-col",
    );
    expect(within(screen.getByTestId("chat-mobile-detail-layout")).getByTestId("message-viewport")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-y-auto",
    );

    await user.click(screen.getByRole("button", { name: "返回会话列表" }));

    expect(await screen.findByTestId("chat-mobile-list-layout")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "请输入消息……" })).not.toBeInTheDocument();
  });
});

function getConversationCardMainButton(conversationId: string) {
  const card = screen.getByTestId(`conversation-card-${conversationId}`);
  const title = within(card).getByText("丹阳草莓，得利市大樱桃");
  const button = title.closest("button");

  if (!button) {
    throw new Error(`Conversation ${conversationId} main button not found`);
  }

  return button;
}
