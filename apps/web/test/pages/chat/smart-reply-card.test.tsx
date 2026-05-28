import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SMART_REPLY_MEDIA_PROCESSING_HINT_MS } from "@/pages/chat/api/smart-reply-adapter";
import {
  SmartReplyCard,
  SmartReplyInlineProcessingHint,
  SmartReplyMessageAnchor,
} from "@/pages/chat/components/smart-reply-card";
import type { ChatMessage } from "@/pages/chat/chat-types";

const smartReplyCardSource = readFileSync(
  join(process.cwd(), "src/pages/chat/components/smart-reply-card.tsx"),
  "utf8",
);
const themeCss = readFileSync(join(process.cwd(), "src/styles/index.css"), "utf8");
const appearanceThemeBlocks = [
  ...themeCss.matchAll(
    /html(?:\.dark)?\[data-appearance-theme="[^"]+"\]\s*\{[\s\S]*?\n\}/g,
  ),
].map((match) => match[0]);

describe("SmartReplyCard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders assistant header, content and footer actions", () => {
    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        onEdit={() => undefined}
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("护肤小助手")).toBeInTheDocument();
    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
  });

  it("renders without a card shadow", () => {
    render(<SmartReplyCard assistantName="护肤小助手" content="建议回复" />);

    expect(screen.getByTestId("smart-reply-card").className).not.toContain(
      "shadow",
    );
  });

  it("uses smart reply tokens instead of hard-coded component colors", () => {
    expect(smartReplyCardSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(smartReplyCardSource).toContain("bg-smart-reply-card");
    expect(smartReplyCardSource).toContain("text-smart-reply-card-foreground");
    expect(smartReplyCardSource).toContain("bg-smart-reply-header");
    expect(smartReplyCardSource).toContain("text-smart-reply-muted-foreground");
    expect(smartReplyCardSource).toContain("text-smart-reply-action");
    expect(smartReplyCardSource).toContain("bg-smart-reply-divider");
  });

  it("defines smart reply tokens outside appearance theme overrides", () => {
    expect(themeCss).toContain("--smart-reply-card: oklch(");
    expect(themeCss).toContain("--smart-reply-card-foreground: oklch(");
    expect(themeCss).toContain("--smart-reply-header: oklch(");
    expect(themeCss).toContain("--smart-reply-muted-foreground: oklch(");
    expect(themeCss).toContain("--smart-reply-action: oklch(");
    expect(themeCss).toContain("--smart-reply-divider: oklch(");
    expect(themeCss).toContain("--color-smart-reply-card: var(--smart-reply-card);");
    expect(themeCss).toContain(
      "--color-smart-reply-card-foreground: var(--smart-reply-card-foreground);",
    );
    expect(themeCss).toContain("--color-smart-reply-header: var(--smart-reply-header);");
    expect(themeCss).toContain(
      "--color-smart-reply-muted-foreground: var(--smart-reply-muted-foreground);",
    );
    expect(themeCss).toContain("--color-smart-reply-action: var(--smart-reply-action);");
    expect(themeCss).toContain("--color-smart-reply-divider: var(--smart-reply-divider);");

    for (const block of appearanceThemeBlocks) {
      expect(block).not.toContain("--smart-reply-");
    }
  });

  it("collapses to header only and expands again from the header toggle", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
      />,
    );

    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭智能回复" }));

    expect(screen.getByTestId("smart-reply-card")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.getByText("护肤小助手")).toBeInTheDocument();
    expect(screen.queryByText("这里是思考的文案...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开智能回复" })).toHaveTextContent(
      "展开",
    );

    await user.click(screen.getByRole("button", { name: "展开智能回复" }));

    expect(screen.getByTestId("smart-reply-card")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();
  });

  it("shows ref attach count in toolbar", () => {
    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
        refAttachIds={["101", "102", "103"]}
      />,
    );

    expect(screen.getByLabelText("推荐附件 3 个")).toHaveTextContent("3");
  });

  it("opens ai adjustment menu from the magic action", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));

    expect(screen.getByRole("menuitem", { name: "简短一点" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重新生成" })).toBeInTheDocument();
  });

  it("calls onRegenerate with the anchor message", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onRegenerate={onRegenerate}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));
    await user.click(screen.getByRole("menuitem", { name: "重新生成" }));

    expect(onRegenerate).toHaveBeenCalledWith(message);
  });

  it("calls onMakeShorter with the anchor message", async () => {
    const user = userEvent.setup();
    const onMakeShorter = vi.fn();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onMakeShorter={onMakeShorter}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
          generateStatus: 2,
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));
    await user.click(screen.getByRole("menuitem", { name: "简短一点" }));

    expect(onMakeShorter).toHaveBeenCalledWith(message);
  });

  it("allows make shorter after the suggestion was sent", async () => {
    const user = userEvent.setup();
    const onMakeShorter = vi.fn();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onMakeShorter={onMakeShorter}
        suggestion={{
          assistantName: "护肤小助手",
          content: "已发送话术",
          generateStatus: 4,
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));
    await user.click(screen.getByRole("menuitem", { name: "简短一点" }));

    expect(onMakeShorter).toHaveBeenCalledWith(message);
  });

  it("opens edit dialog from message anchor", async () => {
    const user = userEvent.setup();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌，太好用了",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));

    expect(screen.getByTestId("smart-reply-edit-dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("编辑");
    expect(screen.getByRole("button", { name: "违规词检测" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加到FAQ" })).toBeInTheDocument();
  });

  it("opens add to faq dialog from edit dialog", async () => {
    const user = userEvent.setup();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌\n这款产品适合温和修护",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "添加到FAQ" }));

    const faqDialog = screen.getByTestId("smart-reply-add-to-faq-dialog");
    expect(faqDialog).toBeInTheDocument();
    expect(faqDialog).toHaveTextContent("添加至FAQ");
    expect(screen.getByText("知识集")).toBeInTheDocument();
    expect(screen.getByText("选择FAQ")).toBeInTheDocument();
    expect(screen.getByText("相似问法")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "问题" })).toHaveValue(
      "客户想了解敏感肌护理",
    );
    expect(screen.getByRole("textbox", { name: "答案" })).toHaveValue(
      "建议先确认是否敏感肌\n这款产品适合温和修护",
    );
  });

  it("shows success banner when no banned words are found in edit dialog", async () => {
    const user = userEvent.setup();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    const successBanner = await screen.findByTestId(
      "smart-reply-violation-check-success",
    );
    expect(successBanner).toHaveTextContent("做的太棒了，暂未检测到错误处");
    expect(
      screen.queryByTestId("smart-reply-violation-result"),
    ).not.toBeInTheDocument();
  });

  it("shows violation result after checking banned words in edit dialog", async () => {
    const user = userEvent.setup();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "这款产品太好用了",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    const violationPanel = await screen.findByTestId("smart-reply-violation-result");
    expect(violationPanel).toHaveTextContent("广告法_通用禁用极限词");
    expect(violationPanel).toHaveTextContent("太好用了");
  });

  it("renders inline processing hint with the provided label", () => {
    render(<SmartReplyInlineProcessingHint label="正在处理图片消息..." />);

    expect(screen.getByTestId("smart-reply-inline-processing")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在处理图片消息...");
  });

  it("shows generating text while smart reply is thinking", () => {
    const message = {
      content: { audioUrl: "https://example.com/voice.mp3", durationLabel: "3\"", type: "voice" },
      id: "msg-voice",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          status: "thinking",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("AI正在生成话术...");
  });

  it("switches media processing text to generating text after the hint duration", () => {
    vi.useFakeTimers();

    const message = {
      content: { imageUrl: "https://example.com/image.png", type: "image" },
      id: "msg-image",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          status: "processing",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在处理图片消息...");

    act(() => {
      vi.advanceTimersByTime(SMART_REPLY_MEDIA_PROCESSING_HINT_MS);
    });

    expect(screen.getByRole("status")).toHaveTextContent("AI正在生成话术...");
  });

  it("shows knowledge miss state and retries from the card", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onRegenerate={onRegenerate}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          failReason: "knowledge_miss",
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    expect(
      screen.getByText("🤔未命中知识集，暂无推荐话术"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(onRegenerate).toHaveBeenCalledWith(message);
  });

  it("shows generation failure state and retries from the card", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const message = {
      content: {
        alt: "产品图",
        imageUrl: "https://example.com/image.png",
        type: "image",
      },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onRegenerate={onRegenerate}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          failReason: "model_error",
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    expect(screen.getByText("生成失败：model_error")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(onRegenerate).toHaveBeenCalledWith(message);
  });

  it("disables send actions when the workbench cannot send messages", () => {
    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        canSendMessage={false}
        content="建议先确认是否敏感肌"
        onSend={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("renders smart reply card inline below the message anchor", () => {
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
        }}
      />,
    );

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("建议先确认是否敏感肌")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看智能回复" })).not.toBeInTheDocument();
  });
});
