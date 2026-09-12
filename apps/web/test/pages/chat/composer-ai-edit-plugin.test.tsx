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
import { RequestNormalizedError } from "@/lib/request";
import { ComposerAiEditPlugin } from "@/pages/chat/components/composer/composer-ai-edit-plugin";
import {
  ComposerEmojiNode,
  ComposerImageNode,
  ComposerLiteAttachmentNode,
  ComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import { $insertComposerText } from "@/pages/chat/components/composer/lexical-utils";

const { rewriteComposerTextMock, toastErrorMock } = vi.hoisted(() => ({
  rewriteComposerTextMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/pages/chat/api/workbench-service", () => ({
  getWorkbenchService: () => ({
    rewriteComposerText: rewriteComposerTextMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
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
    expect(screen.queryByRole("textbox", { name: "自定义 AI 助写要求" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "润色文案" })).not.toBeInTheDocument();
    const aiEditTrigger = screen.getByRole("button", { name: "打开 AI 助写菜单" });
    await user.hover(aiEditTrigger);
    expect(await screen.findByRole("tooltip", { name: "AI 助写" })).toBeInTheDocument();
    await user.unhover(aiEditTrigger);
    await user.click(aiEditTrigger);
    expect(
      screen
        .getByTestId("composer-ai-edit-surface")
        .querySelector('button[aria-label="打开 AI 助写菜单"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "改变语气" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "俏皮" }));

    await waitFor(() => {
      expect(rewriteComposerTextMock).toHaveBeenCalledWith({
        action: "playful",
        content: "您好",
        conversationId: "conversation-1",
      }, { signal: expect.any(AbortSignal) });
    });
    await screen.findByText("您好呀");
    expect(screen.queryByText("AI 助写建议")).not.toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "打开 AI 助写菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "润色文案" }));
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

  it("closes and invalidates an in-flight result when editing becomes unavailable", async () => {
    rewriteComposerTextMock.mockReset();
    toastErrorMock.mockReset();
    let resolveRewrite: ((value: { content: string }) => void) | undefined;
    rewriteComposerTextMock.mockImplementation(
      () =>
        new Promise<{ content: string }>((resolve) => {
          resolveRewrite = resolve;
        }),
    );
    const user = userEvent.setup();
    const initialConfig = {
      namespace: "composer-ai-edit-can-edit-switch-test",
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
    await user.click(screen.getByRole("button", { name: "打开 AI 助写菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "润色文案" }));
    await screen.findByText("正在生成");

    rerender(
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable aria-label="消息输入" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SeedComposerText />
        <ComposerAiEditPlugin canEdit={false} conversationId="conversation-1" />
      </LexicalComposer>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("composer-ai-edit-surface")).not.toBeInTheDocument();
    });

    resolveRewrite?.({ content: "不可用期间的旧结果" });
    await Promise.resolve();
    expect(screen.queryByText("不可用期间的旧结果")).not.toBeInTheDocument();

    rerender(
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={<ContentEditable aria-label="消息输入" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <SeedComposerText />
        <ComposerAiEditPlugin canEdit conversationId="conversation-1" />
      </LexicalComposer>,
    );

    const nextTextWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nextTextNode = nextTextWalker.nextNode();
    const nextRange = document.createRange();
    nextRange.setStart(nextTextNode!, 0);
    nextRange.setEnd(nextTextNode!, nextTextNode!.textContent?.length ?? 0);
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    fireEvent(document, new Event("selectionchange"));

    await screen.findByTestId("composer-ai-edit-surface");
  });

  it("shows a length-specific error for an oversized AI response", async () => {
    rewriteComposerTextMock.mockReset();
    toastErrorMock.mockReset();
    rewriteComposerTextMock.mockRejectedValue(
      new RequestNormalizedError({
        code: "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG",
        message: "AI 助写结果超过字数限制",
      }),
    );
    const user = userEvent.setup();

    render(
      <LexicalComposer
        initialConfig={{
          namespace: "composer-ai-edit-too-long-test",
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
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, textNode!.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await screen.findByTestId("composer-ai-edit-surface");
    await user.click(screen.getByRole("button", { name: "打开 AI 助写菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "润色文案" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("内容超过字数限制，请缩短后重试");
    });
  });

  it("waits until mouse selection ends before showing the AI entry", async () => {
    render(
      <LexicalComposer
        initialConfig={{
          namespace: "composer-ai-edit-pointer-selection-test",
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

    fireEvent.mouseDown(editor, { button: 0 });
    fireEvent(document, new Event("selectionchange"));
    expect(screen.queryByTestId("composer-ai-edit-surface")).not.toBeInTheDocument();

    fireEvent.mouseUp(document, { button: 0 });

    await screen.findByTestId("composer-ai-edit-surface");
  });

  it("aborts an in-flight rewrite when the user stops generation", async () => {
    rewriteComposerTextMock.mockReset();
    toastErrorMock.mockReset();
    let requestSignal: AbortSignal | undefined;
    let resolveRewrite: ((value: { content: string }) => void) | undefined;
    rewriteComposerTextMock.mockImplementation(
      (_request, options?: { signal?: AbortSignal }) => {
        requestSignal = options?.signal;
        return new Promise<{ content: string }>((resolve) => {
          resolveRewrite = resolve;
        });
      },
    );
    const user = userEvent.setup();

    render(
      <LexicalComposer
        initialConfig={{
          namespace: "composer-ai-edit-cancel-test",
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
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.setEnd(textNode!, textNode!.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    await screen.findByTestId("composer-ai-edit-surface");
    await user.click(screen.getByRole("button", { name: "打开 AI 助写菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "润色文案" }));
    await screen.findByText("正在生成");

    await user.click(screen.getByRole("button", { name: "终止生成" }));

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.queryByText("正在生成")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 AI 助写菜单" })).toBeInTheDocument();

    resolveRewrite?.({ content: "迟到的结果" });
    await Promise.resolve();
    expect(screen.queryByText("迟到的结果")).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
