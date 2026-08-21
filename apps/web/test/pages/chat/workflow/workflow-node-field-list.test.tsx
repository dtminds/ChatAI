import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeFieldList } from "@/pages/chat/workflow/nodes/node-field-list";

describe("NodeFieldList", () => {
  it("renders text, model, tag, tags, and empty field values", () => {
    const { container } = render(
      <NodeFieldList
        fields={[
          {
            id: "text",
            label: "发送时间",
            value: { kind: "text", text: "立即发送" },
          },
          {
            id: "model",
            label: "模型",
            value: { kind: "model", label: "Doubao Seed", model: "Doubao-Seed-2.0-pro" },
          },
          {
            id: "tag",
            label: "消息类型",
            value: { kind: "tag", text: "文本" },
          },
          {
            id: "tags",
            label: "客户标签",
            value: {
              items: [
                { text: "新客户" },
                { text: "高意向", tone: "primary" },
                { text: "配置异常", tone: "warning" },
              ],
              kind: "tags",
              singleLine: true,
            },
          },
          {
            id: "empty",
            label: "AI 生成内容",
            value: { kind: "empty" },
          },
          {
            id: "segments",
            label: "时间范围",
            value: {
              items: [
                { kind: "source", text: "开始" },
                { kind: "text", text: "." },
                { kind: "variable", text: "触发时间" },
                { kind: "operator", text: " 至 " },
                { kind: "value", text: "未配置", tone: "warning" },
              ],
              kind: "segments",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("发送时间：")).toBeInTheDocument();
    expect(screen.getByText("立即发送")).toBeInTheDocument();
    expect(screen.getByText("Doubao Seed")).toBeInTheDocument();
    expect(screen.getByText("文本")).toBeInTheDocument();
    expect(screen.getByText("新客户")).toBeInTheDocument();
    expect(screen.getByText("高意向")).toBeInTheDocument();
    expect(screen.getByText("配置异常")).toBeInTheDocument();
    expect(screen.getAllByText("未配置")).toHaveLength(2);
    const summary = container.querySelector('[data-summary-kind="variable"]')?.closest("[aria-label]");
    if (!summary) throw new Error("summary segments not rendered");
    expect(summary.querySelector('[data-summary-kind="source"]')).toHaveTextContent("开始");
    expect(summary.querySelector('[data-summary-kind="variable"]')).toHaveTextContent("触发时间");
    expect(summary.querySelector('[data-summary-kind="operator"]')).toBeInTheDocument();
    expect(summary.querySelector('[data-summary-tone="warning"]')).toHaveTextContent("未配置");
  });
});
