import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConversationListPanel } from "@/pages/chat/components/conversation-list-panel";
import type { ChatMode, Conversation } from "@/pages/chat/chat-types";
import type {
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
} from "@chatai/contracts";

// ---------------------------------------------------------------------------
// Mock the Zustand store so the component can be rendered in isolation.
// The store singleton is shared globally in production but in tests we
// control it via vi.mock + per-test return values.
// ---------------------------------------------------------------------------
const mockSetSearchKeyword = vi.fn();
const mockSelectOrCreate = vi.fn();

const defaultStoreState = {
  searchKeyword: "",
  searchResults: null as {
    contacts: WorkbenchSearchContactResultDto[];
    groups: WorkbenchSearchGroupResultDto[];
  } | null,
  isSearchLoading: false,
  setSearchKeyword: mockSetSearchKeyword,
  selectOrCreateAndSelectConversation: mockSelectOrCreate,
};

let storeState = { ...defaultStoreState };

vi.mock("@/store/workbench-store", () => ({
  useWorkbenchStore: () => storeState,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createConversation({
  conversationAIHostingSwitch = false,
  customerBindType,
  id,
  customerName,
  mode,
  unread = 0,
}: {
  conversationAIHostingSwitch?: boolean;
  customerBindType?: number;
  id: string;
  customerName: string;
  mode: ChatMode;
  unread?: number;
}): Conversation {
  return {
    accountId: "account-1",
    conversationAIHostingSwitch,
    customerAvatarUrl: `https://example.com/${id}.png`,
    customerBindType: mode === "single" ? customerBindType ?? 1 : undefined,
    customerId: `customer-${id}`,
    customerName,
    id,
    mode,
    preview: mode === "group" ? "包含：星云客户、运营客服" : "客户成功部 / 运营客服",
    priority: "medium",
    quietFor: "刚刚",
    unread,
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

function makeContact(
  index: number,
  name: string,
): WorkbenchSearchContactResultDto {
  return {
    thirdExternalUserId: `ext-${index}`,
    name,
    realName: name,
    avatar: `https://example.com/c${index}.png`,
    conversationId: `conv-${index}`,
  };
}

function makeGroup(
  index: number,
  name: string,
): WorkbenchSearchGroupResultDto {
  return {
    thirdGroupId: `group-${index}`,
    name,
    avatar: `https://example.com/g${index}.png`,
    conversationId: `gconv-${index}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ConversationListPanel", () => {
  beforeEach(() => {
    storeState = { ...defaultStoreState };
    mockSetSearchKeyword.mockClear();
    mockSelectOrCreate.mockClear();
  });

  it("shows an empty state when the active mode has no conversations", () => {
    render(
      <ConversationListPanel
        activeMode="single"
        conversations={[]}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const emptyState = screen.getByRole("status", { name: "暂无数据" });

    expect(emptyState).toHaveTextContent("暂无数据");
    expect(emptyState.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("暂无单聊")).not.toBeInTheDocument();
    expect(screen.queryByText("当前账号下暂无单聊。")).not.toBeInTheDocument();
    expect(screen.queryByText("当前账号下暂无单聊占位数据。")).not.toBeInTheDocument();
  });

  it("shows loading instead of empty state when conversations are loading", () => {
    render(
      <ConversationListPanel
        activeMode="single"
        conversations={[]}
        isConversationLoading
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    expect(screen.getByRole("status", { name: "正在加载会话" })).toBeInTheDocument();
    expect(screen.getByText("正在加载会话")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "暂无数据" })).not.toBeInTheDocument();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
  });

  it("keeps inactive mode conversation cards mounted while switching tabs", () => {
    const { rerender } = render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const singleCard = screen.getByText("星云客户 1").closest(".group");

    expect(screen.queryByText("星云群聊 1")).not.toBeInTheDocument();

    rerender(
      <ConversationListPanel
        activeMode="group"
        conversations={conversations}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const groupCard = screen.getByText("星云群聊 1").closest(".group");

    expect(screen.getByText("星云客户 1")).not.toBeVisible();
    expect(screen.getByText("星云群聊 1")).toBeVisible();
    expect(screen.getByText("星云客户 1").closest(".group")).toBe(
      singleCard,
    );

    rerender(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    expect(screen.getByText("星云客户 1")).toBeVisible();
    expect(screen.getByText("星云群聊 1")).not.toBeVisible();
    expect(screen.getByText("星云群聊 1").closest(".group")).toBe(groupCard);
  });

  it("keeps the active tab underline when the tab also opens the view menu", () => {
    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    expect(screen.getByRole("tab", { name: "单聊视图" })).toHaveClass(
      "border-primary",
    );
  });

  it("filters single conversations from the compact view menu", async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();
    const viewConversations = [
      createConversation({
        conversationAIHostingSwitch: true,
        id: "single-ai",
        customerName: "AI托管客户",
        mode: "single",
        unread: 2,
      }),
      createConversation({
        id: "single-human",
        customerName: "人工接待客户",
        mode: "single",
      }),
      createConversation({
        id: "single-read",
        customerName: "已读客户",
        mode: "single",
      }),
      createConversation({
        id: "group-unread",
        customerName: "群聊未读",
        mode: "group",
        unread: 3,
      }),
    ];

    const { rerender } = render(
      <ConversationListPanel
        activeMode="single"
        activeView="all"
        conversations={viewConversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        onSelectView={onSelectView}
        searchableConversations={conversations}
      />,
    );

    expect(screen.getByText("AI托管客户")).toBeVisible();
    expect(screen.getByText("人工接待客户")).toBeVisible();
    expect(screen.getByText("已读客户")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));
    await user.click(screen.getByRole("menuitemradio", { name: "AI托管" }));

    expect(onSelectView).toHaveBeenCalledWith("ai");

    rerender(
      <ConversationListPanel
        activeMode="single"
        activeView="ai"
        conversations={viewConversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        onSelectView={onSelectView}
        searchableConversations={conversations}
      />,
    );

    expect(screen.getByText("AI托管客户")).toBeVisible();
    expect(screen.queryByText("人工接待客户")).not.toBeInTheDocument();
    expect(screen.queryByText("已读客户")).not.toBeInTheDocument();
    expect(screen.getByText("单聊 · AI托管")).toBeInTheDocument();
    expect(screen.getByLabelText("AI托管")).toBeInTheDocument();
  });

  it("shows mode unread dots and puts the unread total only in the unread menu item", async () => {
    const user = userEvent.setup();
    const viewConversations = [
      createConversation({
        id: "single-unread-a",
        customerName: "未读客户 A",
        mode: "single",
        unread: 80,
      }),
      createConversation({
        id: "single-unread-b",
        customerName: "未读客户 B",
        mode: "single",
        unread: 45,
      }),
      createConversation({
        id: "single-read",
        customerName: "已读客户",
        mode: "single",
      }),
      createConversation({
        id: "group-unread",
        customerName: "群聊未读",
        mode: "group",
        unread: 4,
      }),
    ];

    render(
      <ConversationListPanel
        activeMode="single"
        activeView="all"
        conversations={viewConversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        onSelectView={vi.fn()}
        searchableConversations={viewConversations}
      />,
    );

    expect(screen.getByTestId("conversation-mode-unread-dot-single")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-mode-unread-dot-group")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "单聊视图" })).not.toHaveTextContent("125");
    expect(
      screen
        .getByTestId("conversation-mode-unread-dot-single")
        .closest('[data-testid="conversation-mode-dropdown-icon-single"]'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));

    const unreadItem = screen.getByRole("menuitemradio", { name: "未读99+" });
    const unreadBadge = within(unreadItem).getByTestId("conversation-view-unread-count-single");
    expect(unreadBadge).toHaveTextContent("99+");
    expect(unreadBadge).toHaveClass("bg-destructive", "text-destructive-foreground");
    expect(within(unreadItem).getByTestId("conversation-view-label-single-unread")).toHaveClass("w-16");
    expect(screen.getByRole("menuitemradio", { name: "全部" })).not.toHaveTextContent("99+");
    expect(screen.getByRole("menuitemradio", { name: "AI托管" })).not.toHaveTextContent("99+");
    expect(screen.getByRole("menuitemradio", { name: "人工接待" })).not.toHaveTextContent("99+");
  });

  it("filters each mounted mode with its own selected view", () => {
    const viewConversations = [
      createConversation({
        conversationAIHostingSwitch: true,
        id: "single-ai",
        customerName: "AI托管客户",
        mode: "single",
      }),
      createConversation({
        id: "single-human",
        customerName: "人工接待客户",
        mode: "single",
      }),
      createConversation({
        id: "group-read",
        customerName: "已读群聊",
        mode: "group",
      }),
      createConversation({
        id: "group-unread",
        customerName: "未读群聊",
        mode: "group",
        unread: 3,
      }),
    ];

    const { rerender } = render(
      <ConversationListPanel
        activeMode="single"
        activeView="ai"
        conversationViews={{ group: "unread", single: "ai" }}
        conversations={viewConversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={viewConversations}
      />,
    );

    expect(screen.getByText("AI托管客户")).toBeVisible();
    expect(screen.queryByText("人工接待客户")).not.toBeInTheDocument();
    expect(screen.queryByText("未读群聊")).not.toBeInTheDocument();

    rerender(
      <ConversationListPanel
        activeMode="group"
        activeView="unread"
        conversationViews={{ group: "unread", single: "ai" }}
        conversations={viewConversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={viewConversations}
      />,
    );

    expect(screen.getByText("AI托管客户")).not.toBeVisible();
    expect(screen.queryByText("人工接待客户")).not.toBeInTheDocument();
    expect(screen.getByText("未读群聊")).toBeVisible();
    expect(screen.queryByText("已读群聊")).not.toBeInTheDocument();
  });

  it("omits AI hosting views when the active seat has not enabled hosting", async () => {
    const user = userEvent.setup();

    render(
      <ConversationListPanel
        activeMode="single"
        activeView="all"
        conversations={conversations}
        isSeatAIHostingEnabled={false}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        onSelectView={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "单聊视图" }));

    expect(screen.getByRole("menuitemradio", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "未读" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "AI托管" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "人工接待" })).not.toBeInTheDocument();
  });

  it("keeps group views limited to all and unread", async () => {
    const user = userEvent.setup();

    render(
      <ConversationListPanel
        activeMode="group"
        activeView="all"
        conversations={conversations}
        isSeatAIHostingEnabled
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        onSelectView={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "群聊视图" }));

    expect(screen.getByRole("menuitemradio", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "未读" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "AI托管" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "人工接待" })).not.toBeInTheDocument();
  });

  it("closes search results when clicking outside the dropdown", async () => {
    const user = userEvent.setup();

    // Simulate: user starts typing -> store updates searchKeyword
    storeState = { ...defaultStoreState };
    mockSetSearchKeyword.mockImplementation((kw: string) => {
      storeState = { ...storeState, searchKeyword: kw };
    });

    const { rerender } = render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchInput = screen.getByPlaceholderText("搜索客户、群名称");
    await user.type(searchInput, "星");

    // Store now has keyword set; force a re-render with non-empty keyword to open popover
    storeState = { ...storeState, searchKeyword: "星", isSearchLoading: true };
    rerender(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    expect(await screen.findByRole("dialog", { name: "搜索结果" })).toBeInTheDocument();

    // Simulate clearing the keyword (Popover onOpenChange calls setSearchKeyword(""))
    storeState = { ...storeState, searchKeyword: "" };
    await user.click(document.body);

    // setSearchKeyword should have been called with ""
    expect(mockSetSearchKeyword).toHaveBeenCalledWith("");
  });

  it("shows loading spinner while search is in progress", async () => {
    storeState = {
      ...defaultStoreState,
      searchKeyword: "星云",
      isSearchLoading: true,
      searchResults: null,
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(within(searchbox).getByText("正在搜索中...")).toBeInTheDocument();
  });

  it("shows empty message when no results found", async () => {
    storeState = {
      ...defaultStoreState,
      searchKeyword: "不存在的词",
      isSearchLoading: false,
      searchResults: { contacts: [], groups: [] },
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(within(searchbox).getByText("没有匹配的联系人或群聊。")).toBeInTheDocument();
  });

  it("shows grouped contact and group-member results with expand and collapse controls", async () => {
    const user = userEvent.setup();

    // 6 contacts + 11 group members → both "查看全部" buttons should appear
    const contacts = Array.from({ length: 6 }, (_, i) =>
      makeContact(i + 1, `星云客户 ${i + 1}`),
    );
    const groups = Array.from({ length: 11 }, (_, i) =>
      makeGroup(i + 1, `星云群聊 ${i + 1}`),
    );

    storeState = {
      ...defaultStoreState,
      searchKeyword: "星云",
      isSearchLoading: false,
      searchResults: { contacts, groups },
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(
      within(searchbox).getByTestId("conversation-search-results-scroll-area"),
    ).toHaveAttribute("data-scrollbar-visibility", "hover");

    // Section headings
    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).getByText("群聊")).toBeInTheDocument();

    // Contacts: first 5 visible, 6th hidden
    expect(within(searchbox).getByRole("button", { name: /星云客户 1/ })).toBeInTheDocument();
    expect(within(searchbox).queryByText("星云客户 6")).not.toBeInTheDocument();

    // Group members: first 10 visible, 11th hidden
    expect(within(searchbox).getByRole("button", { name: /星云群聊 10/ })).toBeInTheDocument();
    expect(within(searchbox).queryByText("星云群聊 11")).not.toBeInTheDocument();

    // Two "查看全部" buttons
    expect(within(searchbox).getAllByRole("button", { name: "查看全部" })).toHaveLength(2);

    // Expand contacts section
    await user.click(within(searchbox).getAllByRole("button", { name: "查看全部" })[0]);

    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).queryByText("群聊")).not.toBeInTheDocument();
    expect(within(searchbox).getByRole("button", { name: /星云客户 6/ })).toBeInTheDocument();
    expect(within(searchbox).queryByRole("button", { name: "查看全部" })).not.toBeInTheDocument();

    const expandedArea = within(searchbox).getByTestId(
      "conversation-search-expanded-scroll-area",
    );
    expect(expandedArea).toHaveAttribute("data-scrollbar-visibility", "hover");
    const expandedList = within(searchbox).getByRole("list", { name: "联系人搜索结果" });
    expect(within(expandedList).getByRole("button", { name: /星云客户 6/ })).toBeInTheDocument();
    expect(within(searchbox).getByRole("button", { name: "收起" })).toBeInTheDocument();

    // Collapse
    await user.click(within(searchbox).getByRole("button", { name: "收起" }));

    expect(within(searchbox).getByText("联系人")).toBeInTheDocument();
    expect(within(searchbox).getByText("群聊")).toBeInTheDocument();
    expect(within(searchbox).queryByText("星云客户 6")).not.toBeInTheDocument();

    // Click a contact item → should call selectOrCreateAndSelectConversation
    await user.click(within(searchbox).getByRole("button", { name: /星云客户 1/ }));
    expect(mockSelectOrCreate).toHaveBeenCalledWith(contacts[0]);
  });

  it("shows both remark and contact name when they differ", async () => {
    const contact = {
      ...makeContact(1, "王帅"),
      remark: "设计顾问",
    };
    storeState = {
      ...defaultStoreState,
      searchKeyword: "设计",
      isSearchLoading: false,
      searchResults: { contacts: [contact], groups: [] },
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(
      within(searchbox).getByRole("button", { name: /设计顾问（王帅）/ }),
    ).toBeInTheDocument();
  });

  it("shows only contact name when remark is empty or equal to name", async () => {
    const contacts = [
      {
        ...makeContact(1, "王帅"),
        remark: "王帅",
      },
      {
        ...makeContact(2, "李帅"),
        remark: "",
      },
    ];
    storeState = {
      ...defaultStoreState,
      searchKeyword: "帅",
      isSearchLoading: false,
      searchResults: { contacts, groups: [] },
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(within(searchbox).getByRole("button", { name: /^王帅$/ })).toBeInTheDocument();
    expect(within(searchbox).getByRole("button", { name: /^李帅$/ })).toBeInTheDocument();
    expect(within(searchbox).queryByText("王帅（王帅）")).not.toBeInTheDocument();
  });

  it("does not fall back to real name when search contact name is empty", async () => {
    const contact = {
      ...makeContact(1, ""),
      realName: "客户实名",
    };
    storeState = {
      ...defaultStoreState,
      searchKeyword: "客户",
      isSearchLoading: false,
      searchResults: { contacts: [contact], groups: [] },
    };

    render(
      <ConversationListPanel
        activeMode="single"
        conversations={conversations.filter((item) => item.mode === "single")}
        onSelectConversation={vi.fn()}
        onSelectMode={vi.fn()}
        searchableConversations={conversations}
      />,
    );

    const searchbox = await screen.findByRole("dialog", { name: "搜索结果" });
    expect(within(searchbox).getByRole("button", { name: /^未知客户$/ })).toBeInTheDocument();
    expect(within(searchbox).queryByText("客户实名")).not.toBeInTheDocument();
  });
});
