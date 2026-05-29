import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { SMART_REPLY_MEDIA_PROCESSING_HINT_MS } from "@/pages/chat/api/smart-reply-adapter";
import {
  SmartReplyCard,
  SmartReplyInlineProcessingHint,
  SmartReplyMessageAnchor,
} from "@/pages/chat/components/smart-reply-card";
import { SmartReplyRecommendedAttachmentsSection } from "@/pages/chat/components/smart-reply-recommended-attachments";
import {
  addSmartReplyKnowledgeFaq,
  checkSmartReplyTextModeration,
  listKnowledgeDocPage,
  listKnowledgePage,
} from "@/pages/chat/api/workbench-gateway";
import type { ChatMessage } from "@/pages/chat/chat-types";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

vi.mock("@/pages/chat/api/workbench-gateway", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/pages/chat/api/workbench-gateway")>();

  return {
    ...actual,
    addSmartReplyKnowledgeFaq: vi.fn(),
    checkSmartReplyTextModeration: vi.fn(),
    listKnowledgeDocPage: vi.fn(),
    listKnowledgePage: vi.fn(),
  };
});

const themeCss = readFileSync(join(process.cwd(), "src/styles/index.css"), "utf8");
const appearanceThemeBlocks = [
  ...themeCss.matchAll(
    /html(?:\.dark)?\[data-appearance-theme="[^"]+"\]\s*\{[\s\S]*?\n\}/g,
  ),
].map((match) => match[0]);

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

describe("SmartReplyCard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(addSmartReplyKnowledgeFaq).mockReset();
    vi.mocked(checkSmartReplyTextModeration).mockReset();
    vi.mocked(listKnowledgeDocPage).mockReset();
    vi.mocked(listKnowledgePage).mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("renders assistant header, content and header actions", () => {
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
    expect(screen.getByTestId("smart-reply-card")).toHaveClass("max-w-[640px]");
    expect(
      screen
        .getByTestId("smart-reply-card-header")
        .querySelector('img[alt="护肤小助手"]'),
    ).toBeNull();
    expect(screen.getByLabelText("AI 智能回复")).toBeInTheDocument();
    expect(screen.getByText("护肤小助手")).toBeInTheDocument();
    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑智能回复" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "微调文案" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "填入输入框" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更多智能回复操作" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "填入输入框" })).toHaveClass(
      "border",
      "bg-conversation-active-foreground/10",
    );
    expect(screen.getByRole("button", { name: "收起" })).toHaveClass(
      "border",
      "bg-conversation-active-foreground/10",
      "text-conversation-active-foreground",
    );
    expect(screen.getByRole("button", { name: "编辑" })).toHaveTextContent("编辑");
    expect(screen.getByRole("button", { name: "发送" })).toHaveTextContent("发送");
    expect(
      screen
        .getByTestId("smart-reply-card-header")
        .querySelectorAll("button"),
    ).toHaveLength(5);
    expect(
      Array.from(
        screen.getByTestId("smart-reply-card-header").querySelectorAll("button"),
      )
        .map((button) => button.getAttribute("aria-label") ?? button.textContent)
        .filter((text) =>
          ["填入输入框", "编辑", "发送", "更多智能回复操作"].includes(text ?? ""),
        ),
    ).toEqual(["填入输入框", "编辑", "发送", "更多智能回复操作"]);
    expect(screen.getByTestId("smart-reply-card-body")).toHaveTextContent(
      "这里是思考的文案...",
    );
  });

  it("does not define dedicated smart reply theme tokens", () => {
    expect(themeCss).not.toContain("--smart-reply-");
    expect(themeCss).not.toContain("--color-smart-reply-");
    for (const block of appearanceThemeBlocks) {
      expect(block).not.toContain("--smart-reply-");
    }
  });

  it("calls dismiss from the close control without exposing an expand state", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "展开" })).not.toBeInTheDocument();
    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();
  });

  it("keeps the original card box reserved while the dismiss animation runs", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const animate = vi.fn((_keyframes?: Keyframe[] | PropertyIndexedKeyframes) => ({
      cancel: vi.fn(),
    }));
    vi.stubGlobal(
      "Animation",
      class {
        cancel() {
          return undefined;
        }
      },
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        onDismiss={onDismiss}
      />,
    );

    const card = screen.getByTestId("smart-reply-card");
    const sourceIcon = screen.getByLabelText("AI 智能回复");
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      bottom: 248,
      height: 128,
      left: 40,
      right: 480,
      top: 120,
      width: 440,
      x: 40,
      y: 120,
      toJSON: () => undefined,
    } as DOMRect);
    vi.spyOn(sourceIcon, "getBoundingClientRect").mockReturnValue({
      bottom: 145,
      height: 18,
      left: 52,
      right: 70,
      top: 127,
      width: 18,
      x: 52,
      y: 127,
      toJSON: () => undefined,
    } as DOMRect);

    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(card).toHaveAttribute("data-dismissing", "true");
    expect(card).toHaveStyle({ height: "128px", width: "440px" });
    expect(screen.getByTestId("smart-reply-card-animation-layer")).toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-card-animation-mini-icon")).toHaveStyle({
      opacity: "1",
    });
    const collapseFrames = animate.mock.calls[0]?.[0] as Keyframe[];
    expect(collapseFrames.map((frame) => frame.transform)).toEqual([
      "translate(0, 0)",
      "translate(0, 0)",
      "translate(0, 0)",
      "translate(0, 0)",
      "translate(0, 0)",
    ]);
    expect(collapseFrames.map((frame) => frame.opacity)).toEqual([
      1,
      1,
      1,
      1,
      1,
    ]);
    const miniIconFrames = animate.mock.calls
      .map((call) => call[0] as Keyframe[])
      .find((frames) =>
        frames.some((frame) => frame.transform === "translate(-5px, 0px)"),
      );
    expect(miniIconFrames).toEqual([
      expect.objectContaining({
        opacity: 1,
        transform: "translate(0, 0)",
      }),
      expect.objectContaining({
        opacity: 1,
        transform: "translate(-5px, 0px)",
      }),
    ]);
    expect(animate.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          height: "32px",
          transform: "translate(0, 0)",
          width: "32px",
        }),
      ]),
    );
    const flightFrames = animate.mock.calls
      .map((call) => call[0] as Keyframe[])
      .find((frames) => frames.some((frame) => frame.offset === 0));
    expect(flightFrames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offset: 0,
          transform: "translate(40px, 120px) scale(1)",
        }),
      ]),
    );
  });

  it("removes the dismiss animation layer when unmounted mid-animation", async () => {
    const user = userEvent.setup();
    const animate = vi.fn(() => ({
      cancel: vi.fn(),
    }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    const { unmount } = render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        onDismiss={() => undefined}
      />,
    );

    const card = screen.getByTestId("smart-reply-card");
    const sourceIcon = screen.getByLabelText("AI 智能回复");
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      bottom: 248,
      height: 128,
      left: 40,
      right: 480,
      top: 120,
      width: 440,
      x: 40,
      y: 120,
      toJSON: () => undefined,
    } as DOMRect);
    vi.spyOn(sourceIcon, "getBoundingClientRect").mockReturnValue({
      bottom: 145,
      height: 18,
      left: 52,
      right: 70,
      top: 127,
      width: 18,
      x: 52,
      y: 127,
      toJSON: () => undefined,
    } as DOMRect);

    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.getByTestId("smart-reply-card-animation-layer")).toBeInTheDocument();

    unmount();

    expect(
      screen.queryByTestId("smart-reply-card-animation-layer"),
    ).not.toBeInTheDocument();
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

  it("opens the secondary actions menu from the right button group", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
        onEdit={() => undefined}
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "变短一点",
      "重新生成",
    ]);
  });

  it("shows tooltips for icon-only header buttons", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "填入输入框" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("填入输入框");

  });

  it("shows tooltip for the collapse icon button", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "收起" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("收起");
  });

  it("shows tooltip for disabled fill composer icon button", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        canSendMessage={false}
        content="建议回复"
      />,
    );

    expect(screen.getByRole("button", { name: "填入输入框" })).toBeDisabled();

    await user.hover(screen.getByTestId("smart-reply-fill-composer-tooltip-trigger"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("填入输入框");
  });

  it("disables edit and secondary menu actions when sending is unavailable", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        canSendMessage={false}
        content="建议回复"
        onEdit={() => undefined}
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "编辑" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));

    expect(screen.getByRole("menuitem", { name: "变短一点" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "重新生成" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));
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

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));
    await user.click(screen.getByRole("menuitem", { name: "变短一点" }));

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

    await user.click(screen.getByRole("button", { name: "更多智能回复操作" }));
    await user.click(screen.getByRole("menuitem", { name: "变短一点" }));

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
        conversationId="conv-001"
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
    vi.mocked(listKnowledgePage).mockResolvedValue({
      list: [{ id: "11", name: "默认知识集" }],
    });
    vi.mocked(listKnowledgeDocPage).mockResolvedValue({
      list: [{ id: "22", name: "默认 FAQ" }],
    });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
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

  it("normalizes relative recommended attachment preview URLs", () => {
    render(
      <SmartReplyRecommendedAttachmentsSection
        onSelectedAttachmentIdsChange={() => undefined}
        recommendedAttachments={[
          {
            coverUrl: "s5/msg/cover.png",
            defaultSelected: true,
            fileName: "产品图.png",
            fileType: "1",
            id: "101",
          },
        ]}
        selectedAttachmentIds={["101"]}
      />,
    );

    expect(document.querySelector('img[src*="s5/msg/cover.png"]')).toHaveAttribute(
      "src",
      "https://b1.dtminds.com/s5/msg/cover.png",
    );
  });

  it("does not show stale FAQ save toast after unmounting during a request", async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<{ docId: string }>();
    vi.mocked(listKnowledgePage).mockResolvedValue({
      list: [{ id: "11", name: "默认知识集" }],
    });
    vi.mocked(listKnowledgeDocPage).mockResolvedValue({
      list: [{ id: "22", name: "默认 FAQ" }],
    });
    vi.mocked(addSmartReplyKnowledgeFaq).mockReturnValue(saveRequest.promise);
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    const { unmount } = render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "添加到FAQ" }));
    const saveButton = await screen.findByRole("button", { name: "保存" });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    await user.click(saveButton);

    unmount();
    saveRequest.resolve({ docId: "22" });
    await saveRequest.promise;

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows success banner when no banned words are found in edit dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(checkSmartReplyTextModeration).mockResolvedValue({ result: null });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
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
    vi.mocked(checkSmartReplyTextModeration).mockResolvedValue({
      result: {
        categoryLabel: "广告法_通用禁用极限词",
        words: ["太好用了"],
      },
    });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
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

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("思考中..");
    expect(screen.getByTestId("dot-matrix-loader")).toBeInTheDocument();
    expect(
      screen.getByTestId("dot-matrix-loader").querySelector(".dmx-root"),
    ).toHaveStyle({ height: "14px", width: "14px" });
    expect(status).toHaveClass("text-[13px]");
    expect(status).not.toHaveClass("text-primary");
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

    expect(screen.getByRole("status")).toHaveTextContent("思考中..");
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
    expect(
      screen.queryByRole("button", { name: "编辑智能回复" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "填入输入框" }),
    ).not.toBeInTheDocument();

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
    expect(
      screen.queryByRole("button", { name: "编辑智能回复" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "填入输入框" }),
    ).not.toBeInTheDocument();

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

  it("shows a loading state while sending from the card", async () => {
    const user = userEvent.setup();
    const sendGate = createDeferred<{ ok: boolean }>();
    const onSend = vi.fn(() => sendGate.promise);
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      id: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onSend={onSend}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送" }));

    const sendingButton = screen.getByRole("button", { name: "正在发送" });
    expect(sendingButton).toBeDisabled();
    expect(sendingButton).toHaveAttribute("aria-busy", "true");
    expect(sendingButton).not.toHaveTextContent("发送中");
    expect(sendingButton.querySelector('[data-testid="dot-matrix-loader"]')).toBeNull();

    await user.click(sendingButton);

    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => {
      sendGate.resolve({ ok: true });
      await sendGate.promise;
    });

    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "发送" })).not.toHaveAttribute(
      "aria-busy",
    );
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
