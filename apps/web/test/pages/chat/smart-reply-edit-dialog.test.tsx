import { fireEvent, render, screen } from "@testing-library/react";
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

  it("disables manual violation checks when no checker is provided", () => {
    render(
      <SmartReplyEditDialog
        automaticCheckIllegalWords={0}
        initialContent="这款产品太好用了"
        onOpenChange={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("button", { name: "违规词检测" })).toBeDisabled();
    expect(screen.queryByTestId("smart-reply-violation-result")).not.toBeInTheDocument();
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

  it("does not split highlight text into characters when violation words are empty", async () => {
    render(
      <SmartReplyEditDialog
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={async () => ({
          categoryLabel: "空结果",
          words: [""],
        })}
        onOpenChange={() => undefined}
        open
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "违规词检测" }));

    expect(await screen.findByTestId("smart-reply-violation-result")).toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-violation-highlight-overlay")).toHaveTextContent(
      "建议先确认是否敏感肌",
    );
    expect(
      screen
        .getByTestId("smart-reply-violation-highlight-overlay")
        .querySelectorAll("span"),
    ).toHaveLength(1);
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

  it("recovers the manual violation check UI when the request fails", async () => {
    const user = userEvent.setup();
    const onCheckViolations = vi.fn().mockRejectedValue(new Error("network"));

    render(
      <SmartReplyEditDialog
        initialContent="建议先确认是否敏感肌"
        onCheckViolations={onCheckViolations}
        onOpenChange={() => undefined}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    expect(await screen.findByRole("button", { name: "违规词检测" })).toBeEnabled();
    expect(screen.queryByTestId("smart-reply-violation-result")).not.toBeInTheDocument();
    expect(screen.queryByText("做的太棒了，暂未检测到错误处")).not.toBeInTheDocument();
  });
});
