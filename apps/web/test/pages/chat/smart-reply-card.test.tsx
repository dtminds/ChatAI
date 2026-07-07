import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
  SMART_REPLY_MEDIA_PROCESSING_HINT_MS,
} from "@/pages/chat/api/smart-reply-adapter";
import {
  SmartReplyCard,
  SmartReplyInlineProcessingHint,
  SmartReplyMessageAnchor,
} from "@/pages/chat/components/smart-reply-card";
import { SmartReplyRecommendedAttachmentsSection } from "@/pages/chat/components/smart-reply-recommended-attachments";
import {
  checkSmartReplyTextModeration,
  listSmartReplyAttachments,
} from "@/pages/chat/api/workbench-gateway";
import { createKbChunk } from "@/pages/chat/ai-hosting/api/kb-chunk-service";
import { listKbDocs, listKbs } from "@/pages/chat/ai-hosting/api/kb-service";
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
    checkSmartReplyTextModeration: vi.fn(),
    listSmartReplyAttachments: vi.fn(),
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-service", () => ({
  listKbDocs: vi.fn(),
  listKbs: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/api/kb-chunk-service", () => ({
  createKbChunk: vi.fn(),
}));

const themeCss = readFileSync(join(process.cwd(), "src/styles/index.css"), "utf8");
const appearanceThemeBlocks = [
  ...themeCss.matchAll(
    /html(?:\.dark)?\[data-appearance-theme="[^"]+"\]\s*\{[\s\S]*?\n\}/g,
  ),
].map((match) => match[0]);

type MockAnimation = {
  cancel: ReturnType<typeof vi.fn>;
  oncancel: (() => void) | null;
  onfinish: (() => void) | null;
};

type MockAnimateFn = (
  keyframes?: Keyframe[] | PropertyIndexedKeyframes,
  options?: number | KeyframeAnimationOptions,
) => MockAnimation;

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
    vi.mocked(createKbChunk).mockReset();
    vi.mocked(checkSmartReplyTextModeration).mockReset();
    vi.mocked(listKbDocs).mockReset();
    vi.mocked(listKbs).mockReset();
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
    const animate = vi.fn(
      ((_keyframes?: Keyframe[] | PropertyIndexedKeyframes) => ({
        cancel: vi.fn(),
        oncancel: null,
        onfinish: null,
      })) as MockAnimateFn,
    );
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
    expect(screen.getByTestId("smart-reply-card-animation-layer")).toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-card-animation-mini-icon")).toBeInTheDocument();
    const collapseFrames = animate.mock.calls[0]?.[0] as Keyframe[];
    expect(collapseFrames.map((frame) => frame.transform)).toEqual([
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
    const flightOptions = animate.mock.calls
      .find((call) => {
        const frames = call[0] as Keyframe[];

        return frames.some((frame) => frame.offset === 0);
      })?.[1];
    expect(flightFrames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          offset: 0,
          transform: "translate(0px, 0px) scale(1)",
        }),
        expect.objectContaining({
          offset: 1,
          transform: "translate(-27.28px, 14.72px) scale(0.07999999999999996)",
        }),
      ]),
    );
    expect(flightOptions).toEqual(
      expect.objectContaining({
        delay: 200,
        duration: 560,
      }),
    );
    expect(animate).toHaveBeenCalledTimes(4);
  });

  it("collapses the reserved card space before completing dismissal", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const animations: MockAnimation[] = [];
    const animate = vi.fn((() => {
      const animation = {
        cancel: vi.fn(),
        oncancel: null,
        onfinish: null,
      };

      animations.push(animation);

      return animation;
    }) as MockAnimateFn);
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

    animations.at(3)?.onfinish?.();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(5);

    const placeholderFrames = animate.mock.calls[4]?.[0] as Keyframe[];
    const placeholderOptions = animate.mock.calls[4]?.[1];

    expect(placeholderFrames).toEqual([
      expect.objectContaining({
        height: "128px",
        marginTop: "0px",
        opacity: 0,
      }),
      expect.objectContaining({
        height: "0px",
        marginTop: "-6px",
        opacity: 0,
      }),
    ]);
    expect(placeholderOptions).toEqual(
      expect.objectContaining({
        duration: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }),
    );

    animations.at(4)?.onfinish?.();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("collapses the anchor wrapper to absorb the message stack gap", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const animations: MockAnimation[] = [];
    const animationTargets: Element[] = [];
    const animate = vi.fn((function (this: Element) {
      const animation = {
        cancel: vi.fn(),
        oncancel: null,
        onfinish: null,
      };

      animationTargets.push(this);
      animations.push(animation);

      return animation;
    }) as MockAnimateFn);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      conversationId: "conv-001",
      uiMessageKey: "msg-1",
      role: "customer",
      sender: { id: "customer-1", name: "客户" },
      sentAt: "刚刚",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
        message={message}
        onDismiss={onDismiss}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
        }}
      />,
    );

    const card = screen.getByTestId("smart-reply-card");
    const collapseContainer = screen.getByTestId(
      "smart-reply-card-collapse-container",
    );
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
    vi.spyOn(collapseContainer, "getBoundingClientRect").mockReturnValue({
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

    animations.at(3)?.onfinish?.();

    expect(animationTargets[4]).toBe(collapseContainer);
    expect(animate.mock.calls[4]?.[0]).toEqual([
      expect.objectContaining({
        height: "128px",
        marginTop: "0px",
      }),
      expect.objectContaining({
        height: "0px",
        marginTop: "-6px",
      }),
    ]);

    animations.at(4)?.onfinish?.();

    expect(onDismiss).toHaveBeenCalledWith(message);
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
        attachmentCount={3}
        content="建议回复"
        refAttachIds={["101", "102", "103"]}
      />,
    );

    const refAttachEntry = screen.getByLabelText("推荐附件 3 个");

    expect(refAttachEntry).toHaveTextContent("3");
    expect(screen.getByTestId("smart-reply-card-body")).toContainElement(
      refAttachEntry,
    );
    expect(screen.getByTestId("smart-reply-card-header")).not.toContainElement(
      refAttachEntry,
    );
  });

  it("shows ref attach entry when one attachment is referenced", () => {
    const { rerender } = render(
      <SmartReplyCard
        assistantName="护肤小助手"
        attachmentCount={0}
        content="建议回复"
        refAttachIds={[]}
      />,
    );

    expect(screen.queryByLabelText("推荐附件 0 个")).not.toBeInTheDocument();

    rerender(
      <SmartReplyCard
        assistantName="护肤小助手"
        attachmentCount={1}
        content="建议回复"
        refAttachIds={["101"]}
      />,
    );

    expect(screen.getByLabelText("推荐附件 1 个")).toHaveTextContent("1");
  });

  it("loads recommended attachments in edit dialog when sending", async () => {
    const user = userEvent.setup();
    vi.mocked(listSmartReplyAttachments).mockResolvedValue([
      {
        coverUrl: "s5/msg/cover.png",
        defaultSelected: true,
        fileName: "产品图.png",
        fileType: "1",
        id: "101",
      },
    ]);
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        conversationId="conv-001"
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "建议先确认是否敏感肌",
          genAnswer:
            '[{"msgtype":"text","text":"建议先确认是否敏感肌"},{"msgtype":"image","id":101}]',
          refAttachIds: ["101"],
          status: "ready",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("推荐附件：")).toBeInTheDocument();
    expect(screen.getByLabelText("选择附件 产品图.png")).toBeInTheDocument();
    expect(document.querySelector('img[src*="s5/msg/cover.png"]')).toBeInTheDocument();
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
      uiMessageKey: "msg-1",
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
      uiMessageKey: "msg-1",
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
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onMakeShorter={onMakeShorter}
        suggestion={{
          assistantName: "护肤小助手",
          content: "已发送话术",
          generateStatus: 2,
          sent: true,
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
      uiMessageKey: "msg-1",
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
    vi.mocked(listKbs).mockResolvedValue({
      kbs: [{ createdAt: "", description: "", kbId: "11", name: "默认知识库", updatedAt: "" }],
      pagination: { page: 1, pageSize: 200, total: 1 },
    });
    vi.mocked(listKbDocs).mockResolvedValue({
      docs: [
        {
          createdAt: "",
          docId: "22",
          docSize: 0,
          docSuffix: "faq.xlsx",
          hasDocSummary: false,
          docType: "qa",
          kbId: "11",
          name: "默认 FAQ",
          sliceCount: 0,
          status: "completed",
          updatedAt: "",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1 },
    });
    vi.mocked(createKbChunk).mockResolvedValue({ chunkId: "501" });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      uiMessageKey: "msg-1",
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

    await waitFor(() => {
      expect(listKbs).toHaveBeenCalledWith({ page: 1, pageSize: 200 });
    });
    await waitFor(() => {
      expect(listKbDocs).toHaveBeenCalledWith("11", {
        docType: "qa",
        page: 1,
        pageSize: 100,
      });
    });

    const faqDialog = screen.getByTestId("smart-reply-add-to-faq-dialog");
    expect(faqDialog).toBeInTheDocument();
    expect(faqDialog).toHaveTextContent("添加至FAQ");
    expect(screen.getByText("知识库")).toBeInTheDocument();
    expect(screen.getByText("选择FAQ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "问题" })).toHaveValue(
      "客户想了解敏感肌护理",
    );
    expect(screen.getByRole("textbox", { name: "答案" })).toHaveValue(
      "建议先确认是否敏感肌\n这款产品适合温和修护",
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createKbChunk).toHaveBeenCalledWith({
        chunkType: "faq",
        content: "建议先确认是否敏感肌\n这款产品适合温和修护",
        docId: "22",
        title: "客户想了解敏感肌护理",
      });
    });
  });

  it("disables FAQ docs that are not completed when adding a smart reply to FAQ", async () => {
    const user = userEvent.setup();
    vi.mocked(listKbs).mockResolvedValue({
      kbs: [{ createdAt: "", description: "", kbId: "11", name: "默认知识库", updatedAt: "" }],
      pagination: { page: 1, pageSize: 200, total: 1 },
    });
    vi.mocked(listKbDocs).mockResolvedValue({
      docs: [
        {
          createdAt: "",
          docId: "21",
          docSize: 0,
          docSuffix: "faq.xlsx",
          hasDocSummary: false,
          docType: "qa",
          kbId: "11",
          name: "同步失败 FAQ",
          sliceCount: 0,
          status: "failed",
          updatedAt: "",
        },
        {
          createdAt: "",
          docId: "22",
          docSize: 0,
          docSuffix: "faq.xlsx",
          hasDocSummary: false,
          docType: "qa",
          kbId: "11",
          name: "默认 FAQ",
          sliceCount: 0,
          status: "completed",
          updatedAt: "",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 2 },
    });
    vi.mocked(createKbChunk).mockResolvedValue({ chunkId: "501" });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      uiMessageKey: "msg-1",
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
    await user.click(screen.getByRole("button", { name: "添加到FAQ" }));
    await user.click(await screen.findByRole("combobox", { name: "选择FAQ" }));

    expect(await screen.findByRole("option", { name: "同步失败 FAQ" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: "默认 FAQ" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(createKbChunk).toHaveBeenCalledWith({
        chunkType: "faq",
        content: "建议先确认是否敏感肌",
        docId: "22",
        title: "客户想了解敏感肌护理",
      });
    });
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
      "https://b5.bokr.com.cn/s5/msg/cover.png",
    );
  });

  it("does not show stale FAQ save toast after unmounting during a request", async () => {
    const user = userEvent.setup();
    const saveRequest = createDeferred<{ chunkId: string }>();
    vi.mocked(listKbs).mockResolvedValue({
      kbs: [{ createdAt: "", description: "", kbId: "11", name: "默认知识库", updatedAt: "" }],
      pagination: { page: 1, pageSize: 200, total: 1 },
    });
    vi.mocked(listKbDocs).mockResolvedValue({
      docs: [
        {
          createdAt: "",
          docId: "22",
          docSize: 0,
          docSuffix: "faq.xlsx",
          hasDocSummary: false,
          docType: "qa",
          kbId: "11",
          name: "默认 FAQ",
          sliceCount: 0,
          status: "completed",
          updatedAt: "",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1 },
    });
    vi.mocked(createKbChunk).mockReturnValue(saveRequest.promise);
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      uiMessageKey: "msg-1",
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
    saveRequest.resolve({ chunkId: "501" });
    await saveRequest.promise;

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows success banner when no banned words are found in edit dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(checkSmartReplyTextModeration).mockResolvedValue({ result: null });
    const message = {
      content: { text: "客户想了解敏感肌护理", type: "text" },
      uiMessageKey: "msg-1",
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
      uiMessageKey: "msg-1",
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
    expect(screen.getByText("正在处理图片消息...")).toHaveAttribute(
      "data-slot",
      "shiny-text",
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows generating text while smart reply is thinking", () => {
    const message = {
      content: { audioUrl: "https://example.com/voice.mp3", durationLabel: "3\"", type: "voice" },
      uiMessageKey: "msg-voice",
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
  });

  it("switches media processing text to generating text after the hint duration", () => {
    vi.useFakeTimers();

    const message = {
      content: { imageUrl: "https://example.com/image.png", type: "image" },
      uiMessageKey: "msg-image",
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
      uiMessageKey: "msg-1",
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
      uiMessageKey: "msg-1",
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

  it("shows incomplete content skip as plain text with direct dismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const animate = vi.fn();
    const message = {
      content: {
        text: "这个多少钱",
        type: "text",
      },
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    render(
      <SmartReplyMessageAnchor
        message={message}
        onDismiss={onDismiss}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          failReason: SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    expect(screen.getByText(SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI 智能回复")).not.toBeInTheDocument();
    expect(screen.queryByText(/^生成失败/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起" }));

    expect(onDismiss).toHaveBeenCalledWith(message);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not auto dismiss incomplete content skip", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const message = {
      content: {
        text: "这个多少钱",
        type: "text",
      },
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        onDismiss={onDismiss}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          failReason: SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT,
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText(SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT)).toBeInTheDocument();
  });

  it("renders raw incomplete content skip as the localized hint", () => {
    const message = {
      content: {
        text: "这个多少钱",
        type: "text",
      },
      uiMessageKey: "msg-1",
      role: "customer",
    } as ChatMessage;

    render(
      <SmartReplyMessageAnchor
        message={message}
        suggestion={{
          assistantName: "护肤小助手",
          content: "",
          failReason: "content_incomplete_skip",
          generateStatus: 3,
          pollComplete: true,
        }}
      />,
    );

    expect(screen.getByText(SMART_REPLY_CONTENT_INCOMPLETE_SKIP_HINT)).toBeInTheDocument();
    expect(screen.queryByText("content_incomplete_skip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
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
      uiMessageKey: "msg-1",
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
      uiMessageKey: "msg-1",
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
