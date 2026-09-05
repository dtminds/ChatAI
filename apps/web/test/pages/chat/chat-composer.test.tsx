import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LexicalEditor } from "lexical";
import type { GroupMember, QuotedMessagePreviewContent } from "@/pages/chat/chat-types";
import { ChatComposer } from "@/pages/chat/components/chat-composer";
import { mediaUploadMocks, resetChatWorkbenchTestState } from "./workbench-test-utils";

function renderComposer(options: { isMobileLayout?: boolean; groupMembers?: GroupMember[]; currentSeatThirdUserId?: string; isGroupConversation?: boolean; quotedMessage?: QuotedMessagePreviewContent | null } = {}) {
  resetChatWorkbenchTestState();
  return render(
    <ChatComposer
      canConfigureSeatAIHosting={false}
      canConfigureSeatSemiAuto={false}
      canToggleConversationAIHosting={false}
      canSendMessage
      shouldShowConversationAIHostingControl={false}
      hasActiveFileUpload={false}
      groupMembers={options.groupMembers ?? []}
      currentSeatThirdUserId={options.currentSeatThirdUserId}
      inputEnterBehavior="send"
      isGroupConversation={options.isGroupConversation ?? false}
      isEmojiPickerOpen={false}
      isSending={false}
      isHistoryPanelOpen={false}
      isMobileLayout={options.isMobileLayout}
      historyKey="composer-test"
      onClearQuotedMessage={vi.fn()}
      onDraftChange={vi.fn()}
      onEmojiPickerOpenChange={vi.fn()}
      onEnterBehaviorChange={vi.fn()}
      onFileSelect={vi.fn()}
      onChangeSeatAgentMode={vi.fn()}
      onChangeFullAuto={vi.fn()}
      onOpenMaterialLibrary={vi.fn()}
      onOpenHistory={vi.fn()}
      onSegmentsChange={vi.fn()}
      onSendDraft={vi.fn()}
      placeholder="请输入消息……"
      quotedMessage={options.quotedMessage ?? null}
      composerRef={createRef<LexicalEditor>()}
    />,
  );
}

function placeCaretAtTextOffset(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.focus();
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
}

describe("ChatComposer", () => {
  it("shows the quoted message preview and clears it through the callback", async () => {
    const onClearQuotedMessage = vi.fn();
    render(
      <ChatComposer
        canConfigureSeatAIHosting={false}
        canConfigureSeatSemiAuto={false}
        canToggleConversationAIHosting={false}
        canSendMessage
        shouldShowConversationAIHostingControl={false}
        hasActiveFileUpload={false}
        groupMembers={[]}
        inputEnterBehavior="send"
        isGroupConversation={false}
        isEmojiPickerOpen={false}
        isSending={false}
        isHistoryPanelOpen={false}
        historyKey="quote-composer-test"
        onClearQuotedMessage={onClearQuotedMessage}
        onDraftChange={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onEnterBehaviorChange={vi.fn()}
        onFileSelect={vi.fn()}
        onChangeSeatAgentMode={vi.fn()}
        onChangeFullAuto={vi.fn()}
        onOpenMaterialLibrary={vi.fn()}
        onOpenHistory={vi.fn()}
        onSegmentsChange={vi.fn()}
        onSendDraft={vi.fn()}
        placeholder="请输入消息……"
        quotedMessage={{
          contentType: "text",
          quoteMsgId: "quote-001",
          senderName: "客户",
          text: "请确认这个版本",
        }}
        composerRef={createRef<LexicalEditor>()}
      />,
    );

    expect(screen.getByTestId("composer-quote-preview")).toHaveTextContent("请确认这个版本");
    await userEvent.click(screen.getByRole("button", { name: "取消引用" }));
    expect(onClearQuotedMessage).toHaveBeenCalledTimes(1);
  });

  it("limits pasted text to the supported composer length", async () => {
    const user = userEvent.setup();
    const allowedText = "字".repeat(1000);

    renderComposer();

    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await user.click(composer);
    await user.paste(`${allowedText}多`);

    await waitFor(() => {
      expect(composer.textContent?.replaceAll("\u200B", "")).toBe(allowedText);
    });

    await user.type(composer, "余");

    expect(composer.textContent?.replaceAll("\u200B", "")).toBe(allowedText);
  });

  it("keeps pasted images outside the text limit and enables sending", async () => {
    const user = userEvent.setup();
    const clipboardImage = new File(["image-bytes"], "clipboard.png", {
      type: "image/png",
    });

    renderComposer();

    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await user.click(composer);
    await user.paste("字".repeat(1000));
    fireEvent.paste(composer, {
      clipboardData: { files: [clipboardImage] },
    });

    expect(await screen.findByRole("img", { name: "clipboard.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).not.toBeDisabled();
    expect(mediaUploadMocks.uploadWorkbenchImageFile).not.toHaveBeenCalled();
  });

  it("keeps consecutive pasted images inline without spacer text", async () => {
    const images = [1, 2].map(
      (index) => new File(["image-bytes"], `clipboard-${index}.png`, { type: "image/png" }),
    );

    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, { clipboardData: { files: images } });

    expect(await screen.findAllByRole("img")).toHaveLength(2);
    expect(composer.textContent?.replaceAll("\u200B", "")).toBe("");
  });

  it("disables local image insertion after five pasted images", async () => {
    const images = Array.from({ length: 5 }, (_, index) =>
      new File(["image-bytes"], `clipboard-${index + 1}.png`, { type: "image/png" }),
    );

    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, { clipboardData: { files: images } });

    expect(await screen.findAllByRole("img")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "打开图片菜单" }));
    expect(await screen.findByRole("menuitem", { name: "本地图片" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("ignores pasted images with unsupported mime types", async () => {
    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [new File(["image-bytes"], "clipboard.webp", { type: "image/webp" })],
      },
    });

    expect(composer.querySelector('img[alt="clipboard.webp"]')).toBeNull();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });

  it("clears a drag state when the pointer leaves before rerender", async () => {
    const image = new File(["image-bytes"], "dropped.png", { type: "image/png" });
    const dataTransfer = {
      dropEffect: "none",
      files: [image],
      items: [{ kind: "file", type: image.type }],
      types: ["Files"],
    };

    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    act(() => {
      fireEvent.dragEnter(composer, { dataTransfer });
      fireEvent.dragLeave(composer, { dataTransfer });
    });

    expect(screen.queryByTestId("chat-composer-image-drop-overlay")).not.toBeInTheDocument();
  });

  it("accepts only jpeg and png files from the image picker", () => {
    renderComposer();

    expect(screen.getByLabelText("选择图片")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,.jpg,.jpeg,.png",
    );
  });

  it("limits pasted composer images to five", async () => {
    const images = Array.from({ length: 6 }, (_, index) =>
      new File(["image-bytes"], `clipboard-${index + 1}.png`, { type: "image/png" }),
    );

    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, { clipboardData: { files: images } });

    expect(await screen.findAllByRole("img")).toHaveLength(5);
    expect(screen.queryByRole("img", { name: "clipboard-6.png" })).not.toBeInTheDocument();
  });

  it("scrolls to the bottom when a pasted image finishes loading", async () => {
    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    Object.defineProperty(composer, "scrollHeight", { configurable: true, value: 960 });
    composer.scrollTop = 120;
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [new File(["image-bytes"], "clipboard.png", { type: "image/png" })],
      },
    });

    const image = await screen.findByRole("img", { name: "clipboard.png" });
    fireEvent.load(image);
    await waitFor(() => expect(composer.scrollTop).toBe(960));
  });

  it("removes a pasted image and clears the sendable state", async () => {
    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    fireEvent.paste(composer, {
      clipboardData: {
        files: [new File(["image-bytes"], "clipboard.png", { type: "image/png" })],
      },
    });

    await screen.findByRole("img", { name: "clipboard.png" });
    await userEvent.click(screen.getByRole("button", { name: "移除图片 clipboard.png" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "clipboard.png" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  });

  it("renders pasted WeChat emoji tokens as images", async () => {
    renderComposer();
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    await userEvent.paste("好的[打脸]");

    expect(await screen.findByRole("img", { name: "[打脸]" })).toBeInTheDocument();
  });

  it("exposes the history entry from the mobile composer toolbar", async () => {
    const onOpenHistory = vi.fn();
    render(
      <ChatComposer
        canConfigureSeatAIHosting={false}
        canConfigureSeatSemiAuto={false}
        canToggleConversationAIHosting={false}
        canSendMessage
        shouldShowConversationAIHostingControl={false}
        hasActiveFileUpload={false}
        groupMembers={[]}
        inputEnterBehavior="send"
        isGroupConversation={false}
        isEmojiPickerOpen={false}
        isSending={false}
        isHistoryPanelOpen={false}
        isMobileLayout
        historyKey="mobile-composer-test"
        onClearQuotedMessage={vi.fn()}
        onDraftChange={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onEnterBehaviorChange={vi.fn()}
        onFileSelect={vi.fn()}
        onChangeSeatAgentMode={vi.fn()}
        onChangeFullAuto={vi.fn()}
        onOpenMaterialLibrary={vi.fn()}
        onOpenHistory={onOpenHistory}
        onSegmentsChange={vi.fn()}
        onSendDraft={vi.fn()}
        placeholder="请输入消息……"
        quotedMessage={null}
        composerRef={createRef<LexicalEditor>()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("filters the current seat from mention candidates", async () => {
    renderComposer({
      groupMembers: [
        { id: "seat", displayName: "当前客服", type: 0 },
        { id: "member", displayName: "客户", type: 0 },
      ],
      currentSeatThirdUserId: "seat",
      isGroupConversation: true,
    });
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    await userEvent.paste("@");
    const listbox = await screen.findByRole("listbox", { name: "选择群成员" });
    expect(screen.queryByRole("option", { name: "当前客服" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "客户" })).toBeInTheDocument();
    expect(listbox).toBeInTheDocument();
  });

  it("inserts a selected mention with spacing after existing text", async () => {
    renderComposer({
      groupMembers: [{ id: "member", displayName: "客户", type: 0 }],
      isGroupConversation: true,
    });
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    await userEvent.paste("请@");
    await userEvent.click(
      await screen.findByRole("option", { name: "客户" }),
    );

    expect(composer).toHaveTextContent("请 @客户");
  });

  it("opens mention candidates at a middle caret position", async () => {
    renderComposer({
      groupMembers: [{ id: "member", displayName: "客户", type: 0 }],
      isGroupConversation: true,
    });
    const composer = screen.getByRole("textbox", { name: "请输入消息……" });
    await userEvent.click(composer);
    await userEvent.paste("前文 后文");
    placeCaretAtTextOffset(composer, 2);
    await userEvent.keyboard("@");

    expect(await screen.findByRole("option", { name: "客户" })).toBeInTheDocument();
  });
});
