import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SmartReplyEditDialog } from "@/pages/chat/components/smart-reply-edit-dialog";

const editDialogSource = readFileSync(
  join(process.cwd(), "src/pages/chat/components/smart-reply-edit-dialog.tsx"),
  "utf8",
);
const recommendedAttachmentsSource = readFileSync(
  join(
    process.cwd(),
    "src/pages/chat/components/smart-reply-recommended-attachments.tsx",
  ),
  "utf8",
);
const hardcodedColorPattern =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;
const smartReplyColorTokenPattern =
  /(?:bg|text|border|ring|shadow|from|via|to|caret)-smart-reply-|--smart-reply-/;

describe("SmartReplyEditDialog", () => {
  it("uses existing theme tokens for dialog colors", () => {
    expect(editDialogSource).not.toMatch(hardcodedColorPattern);
    expect(recommendedAttachmentsSource).not.toMatch(hardcodedColorPattern);
    expect(editDialogSource).not.toMatch(smartReplyColorTokenPattern);
    expect(recommendedAttachmentsSource).not.toMatch(smartReplyColorTokenPattern);
  });

  it("keeps horizontal dialog padding", () => {
    render(
      <SmartReplyEditDialog
        initialContent="建议先确认是否敏感肌"
        onOpenChange={() => undefined}
        open
      />,
    );

    const dialog = screen.getByTestId("smart-reply-edit-dialog");
    const classNames = dialog.className.split(/\s+/);
    expect(classNames).toContain("px-[24px]");
    expect(classNames).not.toContain("p-0");
  });

  it("uses the shared button variant for secondary dialog actions", () => {
    render(
      <SmartReplyEditDialog
        initialContent="建议先确认是否敏感肌"
        onOpenChange={() => undefined}
        open
      />,
    );

    const customColorClasses = [
      "border-none",
      "bg-primary/10",
      "text-primary",
      "shadow-none",
      "hover:bg-primary/15",
    ];

    for (const name of ["违规词检测", "添加到FAQ"]) {
      const classNames = screen
        .getByRole("button", { name })
        .className.split(/\s+/);

      for (const className of customColorClasses) {
        expect(classNames).not.toContain(className);
      }
    }
  });

  it("auto checks violations on send when automaticCheckIllegalWords is enabled", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    const onCheckViolations = vi.fn().mockResolvedValue({
      categoryLabel: "广告法_通用禁用极限词",
      words: ["最好"],
    });

    render(
      <SmartReplyEditDialog
        automaticCheckIllegalWords={1}
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={onCheckViolations}
        onOpenChange={() => undefined}
        onSend={onSend}
        open
      />,
    );

    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    await user.type(textbox, "这是最好的产品");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onCheckViolations).toHaveBeenCalledWith("这是最好的产品");
    expect(onSend).not.toHaveBeenCalled();
    expect(await screen.findByTestId("smart-reply-violation-result")).toBeInTheDocument();
  });

  it("allows send after auto check passes when content changed", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    const onCheckViolations = vi.fn().mockResolvedValue(null);

    render(
      <SmartReplyEditDialog
        automaticCheckIllegalWords={1}
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={onCheckViolations}
        onOpenChange={() => undefined}
        onSend={onSend}
        open
      />,
    );

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "，请温和修护");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onCheckViolations).toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith({
      content: "建议先确认是否敏感肌，请温和修护",
      selectedAttachmentIds: [],
    });
  });

  it("blocks send after manual violation check finds banned words", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    let resolveViolationCheck: (
      value: { categoryLabel: string; words: string[] },
    ) => void = () => undefined;
    const onCheckViolations = vi.fn(
      () =>
        new Promise<{ categoryLabel: string; words: string[] }>((resolve) => {
          resolveViolationCheck = resolve;
        }),
    );

    render(
      <SmartReplyEditDialog
        automaticCheckIllegalWords={0}
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={onCheckViolations}
        onOpenChange={() => undefined}
        onSend={onSend}
        open
      />,
    );

    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    await user.type(textbox, "这款产品太好用了");
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    expect(screen.getByRole("button", { name: "检测中" })).toBeDisabled();
    expect(
      screen.queryByTestId("smart-reply-violation-check-loading"),
    ).not.toBeInTheDocument();

    resolveViolationCheck({
      categoryLabel: "广告法_通用禁用极限词",
      words: ["太好用了"],
    });

    expect(await screen.findByTestId("smart-reply-violation-result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("syncs the violation highlight overlay scroll position with the textbox", () => {
    render(
      <SmartReplyEditDialog
        initialContent={[
          "第一行太好用了",
          "第二行",
          "第三行",
          "第四行",
          "第五行",
          "第六行",
          "第七行",
          "第八行",
          "第九行",
        ].join("\n")}
        onOpenChange={() => undefined}
        open
      />,
    );

    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    const overlay = screen.getByTestId("smart-reply-violation-highlight-overlay");

    fireEvent.scroll(textbox, { target: { scrollTop: 72 } });

    expect(overlay.scrollTop).toBe(72);
  });

  it("does not update violation check UI after unmounting during a request", async () => {
    const user = userEvent.setup();
    let resolveViolationCheck: (value: null) => void = () => undefined;
    const onCheckViolations = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveViolationCheck = resolve;
        }),
    );

    const { unmount } = render(
      <SmartReplyEditDialog
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={onCheckViolations}
        onOpenChange={() => undefined}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "违规词检测" }));
    unmount();
    resolveViolationCheck(null);

    await expect(onCheckViolations.mock.results[0]?.value).resolves.toBeNull();
    expect(screen.queryByText("做的太棒了，暂未检测到错误处")).not.toBeInTheDocument();
  });
});
