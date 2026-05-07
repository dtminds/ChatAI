import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { ChatMode, Conversation } from "@/pages/chat/chat-types";

function createConversation({
  id,
  customerName,
  mode,
}: {
  id: string;
  customerName: string;
  mode: ChatMode;
}): Conversation {
  return {
    accountId: "account-1",
    customerAvatarUrl: `https://example.com/${id}.png`,
    customerId: `customer-${id}`,
    customerName,
    id,
    mode,
    preview: mode === "group" ? "包含：星云客户、运营客服" : "客户成功部 / 运营客服",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "2026-05-07 09:00:00",
  };
}

const conversations: Conversation[] = [
  ...Array.from({ length: 6 }, (_, index) =>
    createConversation({
      id: `single-${index + 1}`,
      customerName: `星云客户 ${index + 1}`,
      mode: "single",
    }),
  ),
  ...Array.from({ length: 11 }, (_, index) =>
    createConversation({
      id: `group-${index + 1}`,
      customerName: `星云群聊 ${index + 1}`,
      mode: "group",
    }),
  ),
  createConversation({
    id: "single-other",
    customerName: "丹阳草莓",
    mode: "single",
  }),
];

describe("ConversationListPanel", () => {
  it("closes search results when clicking outside the dropdown", async () => {
    const user = userEvent.setup();

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchInput = screen.getByPlaceholderText("搜索客户、群名称");
    await user.type(searchInput, "星云");

    expect(await screen.findByRole("dialog", { name: "搜索结果" })).toBeInTheDocument();

    await user.click(document.body);

    expect(searchInput).toHaveValue("");
    expect(screen.queryByRole("dialog", { name: "搜索结果" })).not.toBeInTheDocument();
  });

  it("shows grouped customer and group search results with expand and collapse controls", async () => {
    const user = userEvent.setup();
    const handleSelectConversation = vi.fn();
    const handleSelectMode = vi.fn();

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={handleSelectConversation}
        onSelectMode={handleSelectMode}
        searchableConversations={conversations}
      />,
    );

    await user.type(screen.getByPlaceholderText("搜索客户、群名称"), "星云");

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(
      within(searchbox).getByTestId("conversation-search-results-scroll-area"),
    ).toHaveAttribute("data-scrollbar-visibility", "scroll");
    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).getByText("群聊")).toBeInTheDocument();
    expect(
      within(searchbox).getByRole("button", { name: /星云客户 1/ }),
    ).toBeInTheDocument();
    expect(within(searchbox).getAllByText("星云")[0]).toHaveClass(
      "text-success",
      "px-0",
    );
    expect(within(searchbox).queryByText("星云客户 6")).not.toBeInTheDocument();
    expect(
      within(searchbox).getByRole("button", { name: /星云群聊 10/ }),
    ).toBeInTheDocument();
    expect(within(searchbox).queryByText("星云群聊 11")).not.toBeInTheDocument();
    expect(within(searchbox).getAllByRole("button", { name: "查看全部" })).toHaveLength(
      2,
    );
    expect(within(searchbox).queryByText("客户成功部 / 运营客服")).not.toBeInTheDocument();
    expect(within(searchbox).queryByText(/包含：/)).not.toBeInTheDocument();

    await user.click(within(searchbox).getAllByRole("button", { name: "查看全部" })[0]);

    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).queryByText("群聊")).not.toBeInTheDocument();
    expect(
      within(searchbox).getByRole("button", { name: /星云客户 6/ }),
    ).toBeInTheDocument();
    expect(within(searchbox).queryByRole("button", { name: "查看全部" })).not.toBeInTheDocument();
    expect(
      within(searchbox).getByTestId("conversation-search-expanded-scroll-area"),
    ).toHaveAttribute("data-scrollbar-visibility", "scroll");
    const expandedResults = within(searchbox).getByRole("list", {
      name: "联系人搜索结果",
    });
    expect(within(expandedResults).getByRole("button", { name: /星云客户 6/ })).toBeInTheDocument();
    expect(within(expandedResults).queryByText("联系人")).not.toBeInTheDocument();
    expect(within(expandedResults).queryByRole("button", { name: "收起" })).not.toBeInTheDocument();
    expect(within(searchbox).getByRole("button", { name: "收起" })).toBeInTheDocument();

    await user.click(within(searchbox).getByRole("button", { name: "收起" }));

    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).getByText("群聊")).toBeInTheDocument();
    expect(within(searchbox).queryByText("星云客户 6")).not.toBeInTheDocument();

    await user.click(within(searchbox).getByRole("button", { name: /星云客户 1/ }));

    expect(handleSelectMode).toHaveBeenCalledWith("single");
    expect(handleSelectConversation).toHaveBeenCalledWith("single-1");
    expect(screen.getByPlaceholderText("搜索客户、群名称")).toHaveValue("");
    expect(screen.queryByRole("dialog", { name: "搜索结果" })).not.toBeInTheDocument();
  });
});
