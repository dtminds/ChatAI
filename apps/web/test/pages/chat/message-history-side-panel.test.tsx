import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GROUP_MEMBER_TYPE } from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import { MessageHistorySidePanel } from "@/pages/chat/components/message-history-side-panel";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";

describe("MessageHistorySidePanel", () => {
  it("uses a compact underline tab layout for history scopes", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: true,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        scrollMode="end"
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const tabs = screen.getByRole("tablist");
    const activeTab = screen.getByRole("tab", { name: "全部" });

    expect(screen.getByRole("complementary", { name: "聊天记录" })).toBeInTheDocument();
    expect(screen.getByText("聊天记录")).toHaveClass("text-sm");
    expect(screen.queryByText("测试客户")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭聊天记录" })).toBeInTheDocument();
    expect(tabs).toHaveClass("w-full", "justify-start", "border-b", "border-divider", "px-4");
    expect(tabs).not.toHaveClass("rounded-2xl", "bg-secondary/90", "grid");
    expect(activeTab).toHaveClass("border-b-2", "text-sm");
    expect(activeTab).not.toHaveClass("text-base", "text-lg");
  });

  it("renders the history filter controls in the header without search", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        scrollMode="end"
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText("搜索聊天记录")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送人" })).toHaveClass("h-8", "py-0", "text-[12px]");
    expect(screen.getByRole("button", { name: "日期" })).toHaveClass("h-8", "py-0", "text-[12px]");
  });

  it("renders sender options with avatars and the real account name in single conversations", async () => {
    const user = userEvent.setup();

    render(
      <MessageHistorySidePanel
        accountAvatarUrl="https://cdn.example.com/account.png"
        accountName="林洒"
        activeConversation={{
          ...createConversation(),
          customerAvatarUrl: "https://cdn.example.com/customer.png",
          thirdExternalUserId: "customer-1",
          thirdUserId: "seat-1",
        }}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送人" }));

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("当前客服")).not.toBeInTheDocument();
    const singleDialog = screen.getByRole("dialog");
    const singleAccountButton = within(singleDialog).getByRole("button", { name: /林洒/ });
    const singleCustomerButton = within(singleDialog).getByRole("button", { name: /测试客户/ });

    expect(singleAccountButton).toBeInTheDocument();
    expect(singleCustomerButton).toBeInTheDocument();
    expect(screen.getByTestId("history-sender-selected-icon")).toBeInTheDocument();
    expect(screen.queryByText("☑️")).not.toBeInTheDocument();
    expect(screen.queryByText("☐")).not.toBeInTheDocument();
    expect(within(singleAccountButton).getByText("林")).toBeInTheDocument();
    expect(within(singleCustomerButton).getByText("测")).toBeInTheDocument();
  });

  it("renders sender options with avatars and checkbox marks in group conversations", async () => {
    const user = userEvent.setup();

    render(
      <MessageHistorySidePanel
        activeConversation={{
          ...createConversation(),
          mode: "group",
        }}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[
          {
            avatarUrl: "https://cdn.example.com/member-1.png",
            displayName: "小林",
            id: "member-1",
            type: GROUP_MEMBER_TYPE.OWNER,
          },
          {
            avatarUrl: "https://cdn.example.com/member-emoji.png",
            displayName: "👨‍👩‍👧‍👦客服",
            id: "member-emoji",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
          {
            avatarUrl: "https://cdn.example.com/member-2.png",
            displayName: "睿白鸽",
            id: "member-2",
            type: GROUP_MEMBER_TYPE.NORMAL,
          },
        ]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送人" }));

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("当前客服")).not.toBeInTheDocument();
    expect(screen.getByTestId("history-sender-selected-icon")).toBeInTheDocument();
    expect(screen.queryByText("☑️")).not.toBeInTheDocument();
    expect(screen.queryByText("☐")).not.toBeInTheDocument();
    const groupDialog = screen.getByRole("dialog");
    const groupMemberButton = within(groupDialog).getByRole("button", { name: /小林/ });
    const emojiMemberButton = within(groupDialog).getByRole("button", { name: /👨‍👩‍👧‍👦客服/ });
    const anotherMemberButton = within(groupDialog).getByRole("button", { name: /睿白鸽/ });

    expect(within(groupMemberButton).getByText("小")).toBeInTheDocument();
    expect(within(emojiMemberButton).getByText("👨‍👩‍👧‍👦")).toBeInTheDocument();
    expect(within(anotherMemberButton).getByText("睿")).toBeInTheDocument();
  });

  it("closes the date picker after selecting a date", async () => {
    const user = userEvent.setup();
    const handleSetDay = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={handleSetDay}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "日期" }));

    expect(screen.queryByRole("button", { name: "清空" })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("gridcell", { name: "20" })).getByRole("button"),
    );

    expect(handleSetDay).toHaveBeenCalledWith("2026-05-20");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the date filter by clicking the selected date", async () => {
    const user = userEvent.setup();
    const handleSetDay = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ day: "2026-05-20", scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={handleSetDay}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "日期" }));

    expect(screen.queryByRole("button", { name: "清空" })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("gridcell", { name: "20", selected: true })).getByRole("button"),
    );

    expect(handleSetDay).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show empty state while loading history data", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();
  });

  it("keeps existing history items visible while loading more data", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [createTextMessage("message-loading", "已有消息")],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByText("已有消息")).toBeInTheDocument();
    expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();
  });

  it("renders all-scope messages in a compact linear history layout", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "老郁，我下午三点去「茶甜甜」这个客户这里拜访", {
              author: "余圆圆",
              sentAt: "2026-03-09 10:30:45",
            }),
            createTextMessage("message-2", "OK", {
              author: "郁佳杰",
              sentAt: "2025-12-31 09:08:07",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        scrollMode="end"
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyItems = screen.getAllByTestId("history-message-item");
    const compactText = screen.getAllByTestId("history-message-text")[0];

    expect(historyItems).toHaveLength(2);
    expect(historyItems[0]).toHaveClass("w-full", "max-w-full", "min-w-0", "items-start");
    expect(historyItems[0]).not.toHaveClass("justify-end", "justify-start");
    expect(screen.queryByRole("button", { name: "消息操作" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("text-message-bubble")).not.toBeInTheDocument();
    expect(screen.getByText("余圆圆")).toHaveClass("text-[13px]", "text-muted-foreground/80");
    expect(screen.getByText("3/9 10:30")).toHaveClass("text-xs", "text-muted-foreground/70");
    expect(screen.getByText("2025/12/31 09:08")).toHaveClass("text-xs", "text-muted-foreground/70");
    expect(screen.queryByText("10:30:45")).not.toBeInTheDocument();
    expect(compactText).toHaveTextContent("老郁，我下午三点去「茶甜甜」这个客户这里拜访");
    expect(compactText).toHaveClass("w-full", "max-w-full", "min-w-0", "break-words", "text-sm");
    expect(compactText).not.toHaveClass("w-max", "max-w-none", "whitespace-nowrap");
  });

  it("keeps long non-breaking history text inside the panel width", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createTextMessage(
              "message-long",
              "Welcome\u00a0to\u00a0BoomerHome\u00a0pet\u00a0service\u00a0platform!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyText = screen.getByTestId("history-message-text");

    expect(historyText.textContent).not.toContain("\u00a0");
    expect(historyText).toHaveClass("w-full", "max-w-full", "min-w-0", "[overflow-wrap:anywhere]");
    expect(historyText).not.toHaveClass("w-max", "max-w-none", "whitespace-nowrap");
  });

  it("renders WeChat emoji tokens as inline images in compact history text", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [createTextMessage("message-emoji", "收到[微笑]")],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyText = screen.getByTestId("history-message-text");
    const emoji = screen.getByRole("img", { name: "微笑" });

    expect(historyText).toHaveTextContent("收到");
    expect(historyText).not.toHaveTextContent("[微笑]");
    expect(emoji).toHaveAttribute("src", expect.stringContaining("/face/微笑.png"));
    expect(emoji).toHaveClass("inline-block", "size-6");
  });

  it("renders quote messages without chat bubble alignment in history", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createQuoteMessage({
              author: "范双飞test",
              quotedMessage: {
                contentType: "file",
                senderName: "余圆圆",
                title: "报价单.pdf",
              },
              text: "请看附件",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyItem = screen.getByTestId("history-message-item");
    const quoteText = screen.getByTestId("history-message-text");
    const quotePreview = screen.getByTestId("quote-generic-preview");
    const quoteIcon = screen.getByTestId("quote-file-attachment-icon");

    expect(historyItem).toHaveClass("items-start");
    expect(historyItem).not.toHaveClass("items-end", "justify-end");
    expect(quoteText).toHaveTextContent("请看附件");
    expect(quoteText).not.toHaveClass("rounded-", "bg-primary", "bg-muted");
    expect(screen.queryByTestId("text-message-bubble")).not.toBeInTheDocument();
    expect(quotePreview).toHaveClass("border-l-2", "text-[12px]");
    expect(quotePreview).toHaveTextContent("余圆圆");
    expect(quotePreview).toHaveTextContent("报价单.pdf");
    expect(screen.queryByText("引用消息不可用")).not.toBeInTheDocument();
    expect(quoteIcon).toHaveAttribute("data-icon-name", "file-empty-01");
  });

  it("renders the file tab as a compact list row layout", async () => {
    const user = userEvent.setup();
    const handleDownloadMessageFile = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createFileMessage("file-1", {
              extension: "xlsx",
              fileName: "2026年五一值班表.xlsx",
              fileSizeLabel: "16K",
              sourceLabel: "范双飞（饭饭）",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onDownloadMessageFile={handleDownloadMessageFile}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByText("2026年五一值班表.xlsx")).toHaveClass("truncate", "text-[14px]", "font-semibold");
    expect(screen.getByText("xlsx")).toBeInTheDocument();
    expect(screen.getByText("范双飞（饭饭）")).toBeInTheDocument();
    expect(screen.getByText(/16K/)).toBeInTheDocument();
    expect(screen.getByText("5/19")).toBeInTheDocument();
    expect(screen.queryByText("5/19 10:00")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载文件：2026年五一值班表.xlsx" }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下载文件：2026年五一值班表.xlsx" }));
    expect(handleDownloadMessageFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("text-message-bubble")).not.toBeInTheDocument();
  });

  it("renders file download state in the history file tab", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createFileMessageWithDownloadStatus("file-downloading", {
              downloadStatus: "ing",
              extension: "pdf",
              fileName: "转存中.pdf",
              fileSizeLabel: "16K",
              sourceLabel: "范双飞（饭饭）",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onDownloadMessageFile={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "文件下载中" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载文件：转存中.pdf" }))
      .not.toBeInTheDocument();
  });

  it("renders link history rows with preview images and opens the link", async () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createH5Message("h5-1", {
              title: "活动链接",
              description: "活动说明",
              previewImageUrl: "https://cdn.example.com/h5.png",
              url: "https://example.com/h5",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "h5" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByAltText("活动链接")).toHaveAttribute(
      "src",
      "https://cdn.example.com/h5.png",
    );
    expect(screen.getByText("活动链接")).toBeInTheDocument();
    const viewport = within(screen.getByTestId("history-message-viewport"));
    expect(viewport.queryByText("链接")).not.toBeInTheDocument();
    expect(viewport.queryByText("H5")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /活动链接/ })).toHaveAttribute(
      "href",
      "https://example.com/h5",
    );
    expect(screen.getByRole("link", { name: /活动链接/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: /活动链接/ })).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
  });

  it("renders mini-program history rows with cover images and no type text", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createMiniProgramMessage("mini-1", {
              appName: "商城小程序",
              coverImageUrl: "https://cdn.example.com/mini.png",
              title: "订单详情",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "mini-program" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByAltText("订单详情")).toHaveAttribute(
      "src",
      "https://cdn.example.com/mini.png",
    );
    expect(screen.getByText("订单详情")).toBeInTheDocument();
    const viewport = within(screen.getByTestId("history-message-viewport"));
    expect(viewport.queryByText("小程序")).not.toBeInTheDocument();
    expect(viewport.queryByText("MP")).not.toBeInTheDocument();
  });

  it("shows newer file messages before older ones in file tab", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createFileMessage("file-old", {
              extension: "pdf",
              fileName: "老文件.pdf",
              fileSizeLabel: "12K",
              sourceLabel: "范双飞（饭饭）",
              sentAt: "2026-05-18 10:00:00",
            }),
            createFileMessage("file-new", {
              extension: "pdf",
              fileName: "新文件.pdf",
              fileSizeLabel: "14K",
              sourceLabel: "范双飞（饭饭）",
              sentAt: "2026-05-19 10:00:00",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onDownloadMessageFile={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const titles = screen.getAllByText(/文件\.pdf$/);

    expect(titles[0]).toHaveTextContent("新文件.pdf");
    expect(titles[1]).toHaveTextContent("老文件.pdf");
  });

  it("uses reversed loader semantics in file tab", async () => {
    const user = userEvent.setup();
    const handleLoadMorePrev = vi.fn();
    const handleLoadMoreNext = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [
            createFileMessage("file-old", {
              extension: "pdf",
              fileName: "老文件.pdf",
              fileSizeLabel: "12K",
              sourceLabel: "范双飞（饭饭）",
              sentAt: "2026-05-18 10:00:00",
            }),
            createFileMessage("file-new", {
              extension: "pdf",
              fileName: "新文件.pdf",
              fileSizeLabel: "14K",
              sourceLabel: "范双飞（饭饭）",
              sentAt: "2026-05-19 10:00:00",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={handleLoadMoreNext}
        onLoadMorePrev={handleLoadMorePrev}
        onDownloadMessageFile={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "加载更多对话" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "加载更早的对话" })[0]).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多对话" }));
    await user.click(screen.getByRole("button", { name: "加载更早的对话" }));

    expect(handleLoadMorePrev).toHaveBeenCalledTimes(1);
    expect(handleLoadMoreNext).toHaveBeenCalledTimes(1);
  });

  it("renders the media tab as a three-column date grouped image wall", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createImageMessage("image-1", {
              alt: "图片 1",
              imageUrl: "https://example.com/image-1.png",
              sentAt: "2026-05-19 10:00:00",
            }),
            createImageMessage("image-2", {
              alt: "图片 2",
              imageUrl: "https://example.com/image-2.png",
              sentAt: "2026-05-19 11:00:00",
            }),
            createImageMessage("image-3", {
              alt: "图片 3",
              imageUrl: "https://example.com/image-3.png",
              sentAt: "2026-05-18 12:00:00",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "media" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByText("5/19")).toBeInTheDocument();
    expect(screen.getByText("5/18")).toBeInTheDocument();
    expect(screen.getAllByAltText(/图片 [123]/)).toHaveLength(3);
    expect(screen.getByAltText("图片 1")).toHaveClass("object-contain");
    expect(screen.queryByText("10:00:00")).not.toBeInTheDocument();
    expect(screen.queryByText("11:00:00")).not.toBeInTheDocument();
    expect(screen.queryByText("12:00:00")).not.toBeInTheDocument();
  });

  it("shows newer media groups before older ones in media tab", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createImageMessage("image-old", {
              alt: "旧图片",
              imageUrl: "https://example.com/image-old.png",
              sentAt: "2026-05-18 10:00:00",
            }),
            createImageMessage("image-new", {
              alt: "新图片",
              imageUrl: "https://example.com/image-new.png",
              sentAt: "2026-05-19 10:00:00",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "media" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const dateLabels = screen.getAllByText(/\d{1,2}\/\d{1,2}/);

    expect(dateLabels[0]).toHaveTextContent("5/19");
    expect(dateLabels[1]).toHaveTextContent("5/18");
  });

  it("uses reversed loader semantics in media tab", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [
            createImageMessage("image-old", {
              alt: "旧图片",
              imageUrl: "https://example.com/image-old.png",
              sentAt: "2026-05-18 10:00:00",
            }),
            createImageMessage("image-new", {
              alt: "新图片",
              imageUrl: "https://example.com/image-new.png",
              sentAt: "2026-05-19 10:00:00",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "media" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "加载更多对话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载更早的对话" })).toBeInTheDocument();
  });

  it("keeps long file names inside the history panel width", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createFileMessage("file-long", {
              extension: "docx",
              fileName: "智能应用可行性报告_gemini2.5pro_非常非常非常非常非常非常长的文件名.docx",
              fileSizeLabel: "431.68 KB",
              sourceLabel: "范双飞test",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const title = screen.getByText("智能应用可行性报告_gemini2.5pro_非常非常非常非常非常非常长的文件名.docx");

    expect(title).toHaveClass("min-w-0", "truncate");
    expect(title.closest(".grid")).toHaveClass("grid-cols-[auto_minmax(0,1fr)]", "w-full", "max-w-full", "min-w-0", "overflow-hidden");
  });

  it("keeps the viewport at the end when the panel opens", () => {
    const { rerender } = render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId("history-message-viewport");

    defineScrollMetric(viewport, "scrollHeight", 600);
    defineScrollMetric(viewport, "clientHeight", 300);

    rerender(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: true,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        scrollMode="end"
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(viewport.scrollTop).toBe(300);
  });

  it("does not force bottom alignment when the history is reloaded for a date change", () => {
    const { rerender } = render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId("history-message-viewport");

    defineScrollMetric(viewport, "scrollHeight", 600);
    defineScrollMetric(viewport, "clientHeight", 300);

    rerender(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: true,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
          ],
        }}
        activeHistoryFilters={{ scope: "all", day: "2026-05-19" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(viewport.scrollTop).toBe(0);
  });

  it("resets the viewport to the top when the history filter changes", () => {
    const { rerender } = render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [createTextMessage("message-1", "第一条")],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId("history-message-viewport");

    defineScrollMetric(viewport, "scrollHeight", 600);
    defineScrollMetric(viewport, "clientHeight", 300);
    viewport.scrollTop = 180;

    rerender(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [createTextMessage("message-2", "第二条")],
        }}
        activeHistoryFilters={{ scope: "all", day: "2026-05-19" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(viewport.scrollTop).toBe(0);
  });

  it("fills the sidebar slot without overlay shadow or fixed width", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const panel = screen.getByRole("complementary", { name: "聊天记录" });

    expect(panel).toHaveClass("absolute", "inset-0", "w-full", "border-l", "border-divider");
    expect(panel).not.toHaveClass("w-[420px]");
    expect(panel.className).not.toContain("shadow");
  });

  it("keeps the viewport anchored when older messages are prepended", async () => {
    const user = userEvent.setup();
    const handleLoadMorePrev = vi.fn();
    const conversation = createConversation();
    const { rerender } = render(
      <MessageHistorySidePanel
        activeConversation={conversation}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [
            createTextMessage("message-3", "第三条"),
            createTextMessage("message-4", "第四条"),
          ],
          nextCursor: "next",
          prevCursor: "prev",
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={handleLoadMorePrev}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );
    const viewport = screen.getByTestId("history-message-viewport");

    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = 120;

    await user.click(screen.getByRole("button", { name: "加载更早的对话" }));

    expect(handleLoadMorePrev).toHaveBeenCalledTimes(1);

    defineScrollMetric(viewport, "scrollHeight", 620);
    rerender(
      <MessageHistorySidePanel
        activeConversation={conversation}
        activeHistory={{
          hasNext: true,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
            createTextMessage("message-3", "第三条"),
            createTextMessage("message-4", "第四条"),
          ],
          nextCursor: "next",
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={handleLoadMorePrev}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(viewport.scrollTop).toBe(340);
  });

  it("triggers next history loading from the bottom loader", async () => {
    const user = userEvent.setup();
    const handleLoadMoreNext = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={handleLoadMoreNext}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "加载更多对话" }));

    expect(handleLoadMoreNext).toHaveBeenCalledTimes(1);
  });
});

function defineScrollMetric(
  element: HTMLElement,
  key: "clientHeight" | "scrollHeight",
  value: number,
) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
  });
}

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "测试客户",
    id: "conversation-1",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}

function createTextMessage(
  id: string,
  text: string,
  overrides: Partial<Pick<ChatMessage, "author" | "sentAt">> = {},
): ChatMessage {
  return {
    author: overrides.author ?? "客户",
    content: {
      text,
      type: "text",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: overrides.sentAt ?? "2026-05-19 10:00:00",
    status: "read",
  };
}

function createImageMessage(
  id: string,
  overrides: {
    alt: string;
    imageUrl: string;
    sentAt: string;
  },
): ChatMessage {
  return {
    author: "客户",
    content: {
      alt: overrides.alt,
      imageUrl: overrides.imageUrl,
      type: "image",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: overrides.sentAt,
    status: "read",
  };
}

function createFileMessage(
  id: string,
  content: {
    extension: string;
    fileName: string;
    fileSizeLabel: string;
    sourceLabel?: string;
    sentAt?: string;
  },
): ChatMessage {
  return {
    author: content.sourceLabel ?? "客户",
    content: {
      ...content,
      type: "file",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: content.sourceLabel ?? "客户",
    },
    sentAt: content.sentAt ?? "2026-05-19 10:00:00",
    status: "read",
  };
}

function createFileMessageWithDownloadStatus(
  id: string,
  content: {
    downloadStatus?: "ing" | "finished" | "failed";
    extension: string;
    fileName: string;
    fileSizeLabel: string;
    sourceLabel?: string;
    sentAt?: string;
  },
): ChatMessage {
  return {
    author: content.sourceLabel ?? "客户",
    content: {
      downloadStatus: content.downloadStatus,
      extension: content.extension,
      fileName: content.fileName,
      fileSizeLabel: content.fileSizeLabel,
      sourceLabel: content.sourceLabel,
      type: "file",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: content.sourceLabel ?? "客户",
    },
    sentAt: content.sentAt ?? "2026-05-19 10:00:00",
    status: "read",
  };
}

function createH5Message(
  id: string,
  content: {
    description: string;
    previewImageUrl?: string;
    title: string;
    url?: string;
  },
): ChatMessage {
  return {
    author: "客户",
    content: {
      ...content,
      type: "h5",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: "2026-05-19 10:00:00",
    status: "read",
  };
}

function createMiniProgramMessage(
  id: string,
  content: {
    appName: string;
    coverImageUrl?: string;
    title: string;
  },
): ChatMessage {
  return {
    author: "客户",
    content: {
      ...content,
      type: "mini-program",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: "2026-05-19 10:00:00",
    status: "read",
  };
}

function createQuoteMessage({
  author,
  text,
  quotedMessage,
}: {
  author: string;
  quotedMessage?: NonNullable<ChatMessage & { content: { type: "quote" } }>["content"]["quotedMessage"];
  text: string;
}): ChatMessage {
  return {
    author,
    content: {
      quoteMsgId: "quote-1",
      quotedMessage,
      text,
      type: "quote",
    },
    conversationId: "conversation-1",
    id: "quote-message-1",
    role: "agent",
    sender: {
      id: "agent-1",
      name: author,
    },
    sentAt: "2026-05-19 10:12:00",
    status: "read",
  };
}
