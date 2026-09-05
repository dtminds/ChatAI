import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LexicalEditor } from "lexical";
import { ChatComposer } from "@/pages/chat/components/chat-composer";

function renderComposer() {
  return render(
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
      quotedMessage={null}
      composerRef={createRef<LexicalEditor>()}
    />,
  );
}

describe("ChatComposer", () => {
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
});
