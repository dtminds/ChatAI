import { createRef, useEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { describe, expect, it, vi } from "vitest";
import { AgentConditionalLogicField } from "@/pages/chat/ai-hosting/agent-components/agent-conditional-logic-field";
import { AiSkillDescriptionField } from "@/pages/chat/ai-hosting/ai-skill-description-field";
import {
  ComposerEmojiNode,
  ComposerImageNode,
  ComposerLiteAttachmentNode,
  ComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import { RESTORE_COMPOSER_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import { ComposerRuntimePlugin } from "@/pages/chat/components/composer/lexical-plugins";
import { HistoryPlugin } from "@/pages/chat/components/lexical-history";
import type { ConditionalLogicSegment } from "@/pages/chat/ai-hosting/agent-components/agent-settings.constants";
import type { SkillContentSegment } from "@/pages/chat/ai-hosting/ai-skill-resource";

function ControlledAgentField({
  historyKey,
  initialSegments,
}: {
  historyKey: string;
  initialSegments: ConditionalLogicSegment[];
}) {
  const [segments, setSegments] = useState(initialSegments);

  useEffect(() => {
    setSegments(initialSegments);
  }, [historyKey, initialSegments]);

  return (
    <AgentConditionalLogicField
      historyKey={historyKey}
      knowledgeBases={[
        { id: "kb-1", name: "测试知识库", status: "available" },
      ]}
      onChange={setSegments}
      segments={segments}
      skills={[]}
    />
  );
}

function ControlledSkillField({
  historyKey,
  initialSegments,
}: {
  historyKey: string;
  initialSegments: SkillContentSegment[];
}) {
  const [segments, setSegments] = useState(initialSegments);

  useEffect(() => {
    setSegments(initialSegments);
  }, [historyKey, initialSegments]);

  return (
    <AiSkillDescriptionField
      historyKey={historyKey}
      knowledgeBases={[]}
      onChange={setSegments}
      onSelectResource={vi.fn()}
      segments={segments}
      tools={[]}
      variables={[]}
    />
  );
}

function pressUndo(editor: HTMLElement) {
  editor.focus();
  fireEvent.keyDown(editor, {
    code: "KeyZ",
    ctrlKey: true,
    key: "z",
  });
}

function pressRedo(editor: HTMLElement) {
  editor.focus();
  fireEvent.keyDown(editor, {
    code: "KeyY",
    ctrlKey: true,
    key: "y",
  });
}

describe("Lexical editor history", () => {
  it("supports composer undo and redo without restoring replaced draft content", async () => {
    const user = userEvent.setup();
    const editorRef = createRef<LexicalEditor>();

    render(
      <LexicalComposer
        initialConfig={{
          namespace: "ComposerHistoryTest",
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
        <HistoryPlugin />
        <ComposerRuntimePlugin
          canSendMessage
          inputEnterBehavior="newline"
          isMentionPickerOpen={false}
          maxTextLength={1000}
          onDraftTextChange={vi.fn()}
          onEscapeMentionPicker={vi.fn()}
          onMoveMentionPicker={vi.fn()}
          onPasteImageFiles={vi.fn()}
          onSegmentsChange={vi.fn()}
          onSelectActiveMention={vi.fn()}
          onSendSegments={vi.fn()}
          registerEditor={(editor) => {
            editorRef.current = editor;
          }}
        />
      </LexicalComposer>,
    );

    await waitFor(() => expect(editorRef.current).not.toBeNull());
    const textbox = screen.getByRole("textbox", { name: "消息输入" });

    await user.click(textbox);
    await user.paste("待撤销内容");
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销内容"));

    pressUndo(textbox);
    await waitFor(() => expect(textbox).not.toHaveTextContent("待撤销内容"));

    pressRedo(textbox);
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销内容"));

    act(() => {
      editorRef.current?.dispatchCommand(RESTORE_COMPOSER_COMMAND, {
        segments: [{ text: "切换后草稿", type: "text" }],
      });
    });
    await waitFor(() => expect(textbox).toHaveTextContent("切换后草稿"));

    pressUndo(textbox);
    await waitFor(() => expect(textbox).toHaveTextContent("切换后草稿"));
  });

  it("supports Agent field undo and resets history when the Agent changes", async () => {
    const user = userEvent.setup();
    const firstSegments: ConditionalLogicSegment[] = [];
    const secondSegments: ConditionalLogicSegment[] = [
      { type: "text", value: "另一个 Agent 的指引" },
    ];
    const { rerender } = render(
      <ControlledAgentField
        historyKey="agent-1"
        initialSegments={firstSegments}
      />,
    );
    const textbox = screen.getByRole("textbox", { name: "行为指引描述" });

    await user.click(textbox);
    await user.paste("待撤销指引");
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销指引"));

    pressUndo(textbox);
    await waitFor(() => expect(textbox).not.toHaveTextContent("待撤销指引"));

    pressRedo(textbox);
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销指引"));

    await user.click(screen.getByRole("button", { name: "添加引用资源" }));
    await user.click(screen.getByRole("option", { name: "测试知识库" }));
    await waitFor(() => expect(textbox).toHaveTextContent("测试知识库"));

    rerender(
      <ControlledAgentField
        historyKey="agent-2"
        initialSegments={secondSegments}
      />,
    );
    const nextTextbox = screen.getByRole("textbox", { name: "行为指引描述" });
    await waitFor(() => expect(nextTextbox).toHaveTextContent("另一个 Agent 的指引"));

    pressUndo(nextTextbox);
    await waitFor(() => expect(nextTextbox).toHaveTextContent("另一个 Agent 的指引"));
  });

  it("supports skill description undo and resets history when the skill changes", async () => {
    const user = userEvent.setup();
    const firstSegments: SkillContentSegment[] = [];
    const secondSegments: SkillContentSegment[] = [
      { type: "text", value: "另一个技能的描述" },
    ];
    const { rerender } = render(
      <ControlledSkillField
        historyKey="skill-1"
        initialSegments={firstSegments}
      />,
    );
    const textbox = screen.getByRole("textbox", { name: "技能描述" });

    await user.click(textbox);
    await user.paste("待撤销技能描述");
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销技能描述"));

    pressUndo(textbox);
    await waitFor(() => expect(textbox).not.toHaveTextContent("待撤销技能描述"));

    pressRedo(textbox);
    await waitFor(() => expect(textbox).toHaveTextContent("待撤销技能描述"));

    rerender(
      <ControlledSkillField
        historyKey="skill-2"
        initialSegments={secondSegments}
      />,
    );
    const nextTextbox = screen.getByRole("textbox", { name: "技能描述" });
    await waitFor(() => expect(nextTextbox).toHaveTextContent("另一个技能的描述"));

    pressUndo(nextTextbox);
    await waitFor(() => expect(nextTextbox).toHaveTextContent("另一个技能的描述"));
  });
});
