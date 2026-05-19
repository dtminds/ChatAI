import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  SmartReplyCard,
  SmartReplyMessageAnchor,
} from "@/pages/chat/components/smart-reply-card";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("SmartReplyCard", () => {
  it("renders assistant header, content and footer actions", () => {
    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        onEdit={() => undefined}
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
        onSend={() => undefined}
        versionCount={6}
        versionIndex={0}
      />,
    );

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("护肤小助手")).toBeInTheDocument();
    expect(screen.getByText("这里是思考的文案...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });

  it("collapses to header only and expands again from the header toggle", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="这里是思考的文案..."
        versionCount={6}
        versionIndex={0}
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

  it("opens ai adjustment menu from the magic action", async () => {
    const user = userEvent.setup();

    render(
      <SmartReplyCard
        assistantName="护肤小助手"
        content="建议回复"
        onMakeShorter={() => undefined}
        onRegenerate={() => undefined}
        versionCount={3}
        versionIndex={1}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));

    expect(screen.getByRole("menuitem", { name: "简短一点" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重新生成" })).toBeInTheDocument();
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
          versionCount: 1,
          versionIndex: 0,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));

    expect(screen.getByTestId("smart-reply-edit-dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("编辑");
    expect(screen.getByRole("button", { name: "违规词检测" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加到FAQ" })).toBeInTheDocument();
    expect(screen.getByText("推荐附件：请按需勾选需要发送的附件 (1/4)")).toBeInTheDocument();
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
          versionCount: 1,
          versionIndex: 0,
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
          versionCount: 1,
          versionIndex: 0,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "违规词检测" }));

    const violationPanel = await screen.findByTestId("smart-reply-violation-result");
    expect(violationPanel).toHaveTextContent("广告法_通用禁用极限词");
    expect(violationPanel).toHaveTextContent("太好用了");
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
          versionCount: 1,
          versionIndex: 0,
        }}
      />,
    );

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("建议先确认是否敏感肌")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看智能回复" })).not.toBeInTheDocument();
  });
});
