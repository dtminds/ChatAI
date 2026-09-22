import { createRef } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LexicalEditor } from "lexical";
import { ChatComposer } from "@/pages/chat/components/chat-composer";

const composerRuntimeRenderMock = vi.hoisted(() => vi.fn());

vi.mock("@/pages/chat/components/composer/lexical-plugins", () => ({
  ComposerMaxLengthPlugin: () => null,
  ComposerRuntimePlugin: ({
    canSendMessage,
  }: {
    canSendMessage: boolean;
  }) => {
    composerRuntimeRenderMock(canSendMessage);
    return null;
  },
}));

describe("ChatComposer render scope", () => {
  beforeEach(() => {
    composerRuntimeRenderMock.mockClear();
  });

  it("skips equivalent parent renders and preserves required updates", () => {
    const props = {
      canConfigureSeatAIHosting: false,
      canConfigureSeatSemiAuto: false,
      canToggleConversationAIHosting: false,
      canSendMessage: true,
      shouldShowConversationAIHostingControl: false,
      collectedExpressions: [],
      groupMembers: [],
      hasActiveFileUpload: false,
      inputEnterBehavior: "send" as const,
      isEmojiPickerOpen: false,
      isGroupConversation: false,
      isSending: false,
      conversationId: "conv-001",
      historyKey: "conv-001",
      onClearQuotedMessage: vi.fn(),
      onDraftChange: vi.fn(),
      onEmojiPickerOpenChange: vi.fn(),
      onEnterBehaviorChange: vi.fn(),
      onFileSelect: vi.fn(),
      onChangeSeatAgentMode: vi.fn(),
      onChangeFullAuto: vi.fn(),
      onOpenMaterialLibrary: vi.fn(),
      onSegmentsChange: vi.fn(),
      onSendDraft: vi.fn(),
      placeholder: "请输入消息",
      quotedMessage: null,
      composerRef: createRef<LexicalEditor>(),
    };
    const { rerender } = render(<ChatComposer {...props} />);

    expect(composerRuntimeRenderMock).toHaveBeenCalledTimes(1);
    expect(composerRuntimeRenderMock).toHaveBeenLastCalledWith(true);

    rerender(<ChatComposer {...props} />);

    expect(composerRuntimeRenderMock).toHaveBeenCalledTimes(1);

    rerender(<ChatComposer {...props} canSendMessage={false} />);

    expect(composerRuntimeRenderMock).toHaveBeenCalledTimes(2);
    expect(composerRuntimeRenderMock).toHaveBeenLastCalledWith(false);

    rerender(
      <ChatComposer
        {...props}
        canSendMessage={false}
        conversationId="conv-002"
        historyKey="conv-002"
      />,
    );

    expect(composerRuntimeRenderMock).toHaveBeenCalledTimes(3);
  });
});
