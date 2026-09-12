import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { describe, expect, it, vi } from "vitest";
import { ComposerAiEditPlugin } from "@/pages/chat/components/composer/composer-ai-edit-plugin";
import {
  ComposerEmojiNode,
  ComposerImageNode,
  ComposerLiteAttachmentNode,
  ComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import { $insertComposerText } from "@/pages/chat/components/composer/lexical-utils";

const { rewriteComposerTextMock } = vi.hoisted(() => ({
  rewriteComposerTextMock: vi.fn(),
}));

vi.mock("@/pages/chat/api/workbench-service", () => ({
  getWorkbenchService: () => ({
    rewriteComposerText: rewriteComposerTextMock,
  }),
}));

function SeedComposerText() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      $getRoot().clear();
      $insertComposerText("您好");
    }, { discrete: true });
  }, [editor]);

  return null;
}

describe("ComposerAiEditPlugin", () => {
  it("rewrites a selected text range and applies the accepted result", async () => {
    rewriteComposerTextMock.mockReset();
    rewriteComposerTextMock.mockResolvedValue({ content: "您好呀" });
    const user = userEvent.setup();

    render(
      <LexicalComposer
        initialConfig={{
          namespace: "composer-ai-edit-plugin-test",
          nodes: [
            ComposerEmojiNode,
            ComposerImageNode,
            ComposerLiteAttachmentNode,
            ComposerMentionNode,
          ],
          onError(error) {
            throw error;
          },
        }}
      >
        <PlainTextPlugin
          contentEditable={<ContentEditable aria-label="消息输入" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SeedComposerText />
        <ComposerAiEditPlugin canEdit conversationId="conversation-1" />
      </LexicalComposer>,
    );

    const editor = await screen.findByRole("textbox", { name: "消息输入" });
    await waitFor(() => expect(editor).toHaveTextContent("您好"));

    const textWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNode = textWalker.nextNode();
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, textNode!.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await screen.findByTestId("composer-ai-edit-surface");
    await user.click(screen.getByRole("button", { name: "润色表达" }));

    await waitFor(() => {
      expect(rewriteComposerTextMock).toHaveBeenCalledWith({
        action: "polish",
        content: "您好",
        conversationId: "conversation-1",
      });
    });
    await screen.findByText("AI 助写建议");

    await user.click(screen.getByRole("button", { name: "采用 AI 助写建议" }));

    await waitFor(() => expect(editor).toHaveTextContent("您好呀"));
  });

  it("closes the surface and ignores an in-flight result when the conversation changes", async () => {
    rewriteComposerTextMock.mockReset();
    let resolveRewrite: ((value: { content: string }) => void) | undefined;
    rewriteComposerTextMock.mockImplementation(
      () =>
        new Promise<{ content: string }>((resolve) => {
          resolveRewrite = resolve;
        }),
    );
    const user = userEvent.setup();
    const initialConfig = {
      namespace: "composer-ai-edit-conversation-switch-test",
      nodes: [
        ComposerEmojiNode,
        ComposerImageNode,
        ComposerLiteAttachmentNode,
        ComposerMentionNode,
      ],
      onError(error: Error) {
        throw error;
      },
    };

    const { rerender } = render(
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable aria-label="消息输入" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SeedComposerText />
        <ComposerAiEditPlugin canEdit conversationId="conversation-1" />
      </LexicalComposer>,
    );

    const editor = await screen.findByRole("textbox", { name: "消息输入" });
    await waitFor(() => expect(editor).toHaveTextContent("您好"));

    const textWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNode = textWalker.nextNode();
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, textNode!.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await screen.findByTestId("composer-ai-edit-surface");
    await user.click(screen.getByRole("button", { name: "润色表达" }));
    await screen.findByText("正在生成");

    rerender(
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable aria-label="消息输入" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SeedComposerText />
        <ComposerAiEditPlugin canEdit conversationId="conversation-2" />
      </LexicalComposer>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("composer-ai-edit-surface")).not.toBeInTheDocument();
    });

    resolveRewrite?.({ content: "旧会话结果" });
    await Promise.resolve();
    expect(screen.queryByText("旧会话结果")).not.toBeInTheDocument();
  });
});
