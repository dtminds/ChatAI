import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SmartReplyEditDialog } from "@/pages/chat/components/smart-reply-edit-dialog";

describe("SmartReplyEditDialog", () => {
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

    render(
      <SmartReplyEditDialog
        automaticCheckIllegalWords={0}
        initialContent="建议先确认是否敏感肌"
        onOpenChange={() => undefined}
        onSend={onSend}
        open
      />,
    );

    const textbox = screen.getByRole("textbox");
    await user.clear(textbox);
    await user.type(textbox, "这款产品太好用了");
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    expect(await screen.findByTestId("smart-reply-violation-result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
