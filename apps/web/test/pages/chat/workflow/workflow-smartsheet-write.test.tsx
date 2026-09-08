import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import {
  getCompatibleSmartsheetVariables,
} from "@/pages/chat/workflow/nodes/smartsheet-write/config";
import { SmartsheetWriteConfig } from "@/pages/chat/workflow/nodes/smartsheet-write/panel";
import { smartsheetWriteUi } from "@/pages/chat/workflow/nodes/smartsheet-write/ui";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
  WorkflowOutputValueType,
  WorkflowVariableDefinition,
} from "@/pages/chat/workflow/types";

const COMPLETE_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=4pABCDEFGHdmr1";
const MASKED_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=4p**dmr1";
const COMPLETE_SCHEMA = '{"f1":{"title":"姓名","type":"text"},"f2":{"title":"金额","type":"number"}}';

describe("workflow Smartsheet Write node", () => {
  it("starts incomplete, sits in data processing, and exposes the write result", () => {
    const definition = getNodeDefinition("smartsheet-write");
    const node = createSmartsheetWriteNode();

    expect(definition.paletteGroup).toBe("data");
    expect(definition.visual.label).toBe("写入智能表格");
    expect(node.data.status).toBe("warning");
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "smartsheet-webhook-required" }),
      expect.objectContaining({ code: "smartsheet-schema-required" }),
      expect.objectContaining({ code: "smartsheet-fields-required" }),
    ]));
    expect(definition.getOutputVariables?.(node)).toEqual([
      expect.objectContaining({
        key: "success",
        label: "写入结果",
        valueType: { kind: "boolean" },
      }),
    ]);
    expect(smartsheetWriteUi.body.kind === "fields"
      ? smartsheetWriteUi.body.getFields(node.data)
      : []).toEqual([
      expect.objectContaining({
        id: "fields",
        value: { kind: "empty" },
      }),
    ]);
  });

  it("commits selected fields and the optional table link only on confirmation", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulSmartsheetWriteConfig onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("button", { name: "配置智能表格" }));
    const webhookGuideLink = screen.getByRole("link", { name: "了解如何通过 Webhook 地址推送数据" });
    expect(webhookGuideLink)
      .toHaveAttribute("href", "https://developer.work.weixin.qq.com/document/path/101239");
    expect(webhookGuideLink)
      .toHaveAttribute("target", "_blank");
    expect(webhookGuideLink)
      .toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText(/已选 \d+ \/ 20/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "解析" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Webhook 地址"), {
      target: { value: COMPLETE_WEBHOOK_URL },
    });
    fireEvent.change(screen.getByLabelText("智能表格URL"), {
      target: { value: "https://doc.weixin.qq.com/sheet/example" },
    });
    fireEvent.change(screen.getByLabelText("示例数据"), {
      target: { value: COMPLETE_SCHEMA },
    });
    await user.click(screen.getByRole("button", { name: "解析" }));
    expect(screen.queryByLabelText("示例数据")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "了解如何通过 Webhook 地址推送数据" })).not.toBeInTheDocument();
    expect(screen.getByText(/已选 \d+ \/ 20/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(screen.getByLabelText("Webhook 地址")).toHaveValue(COMPLETE_WEBHOOK_URL);
    expect(screen.getByLabelText("智能表格URL")).toHaveValue("https://doc.weixin.qq.com/sheet/example");
    expect(screen.queryByRole("textbox", { name: "搜索字段" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "姓名" }));
    expect(onNodeChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenCalledTimes(1);
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      tableUrl: "https://doc.weixin.qq.com/sheet/example",
      schema: COMPLETE_SCHEMA,
      fieldMappings: [expect.objectContaining({ fieldId: "f1" })],
    }));
    expect(screen.getByRole("link", { name: "点此查看" }))
      .toHaveAttribute("href", "https://doc.weixin.qq.com/sheet/example");
    expect(screen.getByLabelText("姓名的值")).toHaveValue("");
    expect(screen.queryByLabelText("金额的值")).not.toBeInTheDocument();
    expect(screen.getByText(MASKED_WEBHOOK_URL)).toBeInTheDocument();
    expect(screen.queryByText(COMPLETE_WEBHOOK_URL)).not.toBeInTheDocument();
    expect(screen.queryByText(/已选.*个字段/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("checkbox", { name: "姓名" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "金额" })).not.toBeChecked();
  });

  it("parses schema into field mappings and keeps existing values for the same field", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StatefulSmartsheetWriteConfig
        initialNode={createSmartsheetWriteNode({
          webhookUrl: COMPLETE_WEBHOOK_URL,
          schema: COMPLETE_SCHEMA,
          fieldMappings: [{
            fieldId: "f1",
            fieldTitle: "姓名",
            fieldType: "text",
            value: { kind: "literal", value: "张三" },
          }],
        })}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("checkbox", { name: "金额" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fieldMappings: [
        expect.objectContaining({
          fieldId: "f1",
          fieldTitle: "姓名",
          value: { kind: "literal", value: "张三" },
        }),
        expect.objectContaining({
          fieldId: "f2",
          fieldTitle: "金额",
          fieldType: "number",
          value: { kind: "literal", value: "" },
        }),
      ],
    }));
  });

  it("parses the official WeCom webhook payload and ignores add_records", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StatefulSmartsheetWriteConfig
        initialNode={createSmartsheetWriteNode({
          webhookUrl: COMPLETE_WEBHOOK_URL,
          schema: JSON.stringify({
            schema: {
              f04Gwj: { title: "姓名", type: "text" },
              fUlfaq: { title: "回款状态", type: "single_select", enum: ["已回款", "未回款"] },
              fMoney: { title: "回款金额", type: "currency" },
            },
            add_records: [{ values: { f04Gwj: "测试文本" } }],
          }),
          fieldMappings: [],
        })}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "配置智能表格" }));
    await user.click(screen.getByRole("checkbox", { name: "姓名" }));
    await user.click(screen.getByRole("checkbox", { name: "回款状态" }));
    await user.click(screen.getByRole("checkbox", { name: "回款金额" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fieldMappings: [
        expect.objectContaining({ fieldId: "f04Gwj", fieldTitle: "姓名", fieldType: "text" }),
        expect.objectContaining({
          fieldId: "fUlfaq",
          fieldTitle: "回款状态",
          fieldType: "single_select",
          enumOptions: ["已回款", "未回款"],
        }),
        expect.objectContaining({ fieldId: "fMoney", fieldTitle: "回款金额", fieldType: "currency" }),
      ],
    }));
  });

  it.each(["取消", "关闭", "Escape"])("discards source and selection edits on %s", async (closeAction) => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulSmartsheetWriteConfig initialNode={createSmartsheetWriteNode({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      tableUrl: "https://doc.weixin.qq.com/sheet/original",
      schema: COMPLETE_SCHEMA,
      fieldMappings: [{ fieldId: "f1", fieldTitle: "姓名", fieldType: "text", value: { kind: "literal", value: "张三" } }],
    })} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("checkbox", { name: "姓名" }));
    fireEvent.change(screen.getByLabelText("智能表格URL"), { target: { value: "https://doc.weixin.qq.com/sheet/changed" } });
    await user.click(screen.getByRole("button", { name: "同步字段" }));
    fireEvent.change(screen.getByLabelText("Webhook 地址"), { target: { value: `${COMPLETE_WEBHOOK_URL}-new` } });
    fireEvent.change(screen.getByLabelText("示例数据"), { target: { value: '{"f3":{"title":"新增","type":"text"}}' } });
    await user.click(screen.getByRole("button", { name: "解析" }));
    await user.click(screen.getByRole("checkbox", { name: "新增" }));
    if (closeAction === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: closeAction }));

    expect(onNodeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("姓名的值")).toHaveValue("张三");
    expect(screen.getByRole("link", { name: "点此查看" })).toHaveAttribute("href", "https://doc.weixin.qq.com/sheet/original");
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("checkbox", { name: "姓名" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "新增" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "同步字段" }));
    expect(screen.getByLabelText("Webhook 地址")).toHaveValue(COMPLETE_WEBHOOK_URL);
    expect(screen.getByLabelText("示例数据")).toHaveValue(COMPLETE_SCHEMA);
  });

  it("discards initial source edits when closed before parsing", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulSmartsheetWriteConfig onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("button", { name: "配置智能表格" }));
    fireEvent.change(screen.getByLabelText("Webhook 地址"), { target: { value: COMPLETE_WEBHOOK_URL } });
    fireEvent.change(screen.getByLabelText("示例数据"), { target: { value: COMPLETE_SCHEMA } });
    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(onNodeChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "配置智能表格" }));
    expect(screen.getByLabelText("Webhook 地址")).toHaveValue("");
    expect(screen.getByLabelText("示例数据")).toHaveValue("");
  });

  it("selects any 20 fields from the complete catalog without search", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const fields = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [
      `f${index}`, { title: `字段${index}`, type: "text" },
    ]));
    render(<StatefulSmartsheetWriteConfig initialNode={createSmartsheetWriteNode({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      schema: JSON.stringify({ ...fields, unsupported: { title: "附件", type: "attachment" } }),
    })} onNodeChange={onNodeChange} />);
    await user.click(screen.getByRole("button", { name: "配置智能表格" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(22);
    expect(screen.getByRole("checkbox", { name: "附件" })).toBeDisabled();
    for (let index = 0; index < 20; index += 1) {
      await user.click(screen.getByRole("checkbox", { name: `字段${index}` }));
    }
    expect(screen.getByRole("checkbox", { name: "字段20" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "字段0" }));
    expect(screen.queryByRole("textbox", { name: "搜索字段" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "字段20" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    const patch = onNodeChange.mock.calls[0][0];
    expect(patch.fieldMappings).toHaveLength(20);
    expect(patch.fieldMappings).toContainEqual(expect.objectContaining({ fieldId: "f20" }));
    expect(patch.fieldMappings).not.toContainEqual(expect.objectContaining({ fieldId: "f0" }));
    expect(patch.tableUrl).toBe("");
    expect(screen.queryByRole("link", { name: "点此查看" })).not.toBeInTheDocument();
    expect(screen.getByText("未填写")).toBeInTheDocument();
    expect(screen.getByText(MASKED_WEBHOOK_URL)).toBeInTheDocument();
    expect(screen.queryByText(COMPLETE_WEBHOOK_URL)).not.toBeInTheDocument();
  });

  it("blocks unparsed changes and reconciles removed, renamed and type-changed selections", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulSmartsheetWriteConfig initialNode={createSmartsheetWriteNode({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      schema: JSON.stringify({
        f1: { title: "姓名", type: "text" },
        f2: { title: "金额", type: "number" },
        f3: { title: "旧字段", type: "text" },
      }),
      fieldMappings: [
        { fieldId: "f1", fieldTitle: "姓名", fieldType: "text", value: { kind: "literal", value: "张三" } },
        { fieldId: "f2", fieldTitle: "金额", fieldType: "number", value: { kind: "literal", value: "12" } },
        { fieldId: "f3", fieldTitle: "旧字段", fieldType: "text", value: { kind: "literal", value: "旧值" } },
      ],
    })} onNodeChange={onNodeChange} />);
    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.click(screen.getByRole("button", { name: "同步字段" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Webhook 地址")).toHaveValue(COMPLETE_WEBHOOK_URL);
    expect(screen.getByLabelText("智能表格URL")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("示例数据"), { target: { value: "{" } });
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByRole("checkbox", { name: "姓名" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "金额" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "新字段" })).not.toBeInTheDocument();
    expect(screen.getByText(/已选 3 \/ 20/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "同步字段" }));
    expect(screen.getByLabelText("示例数据")).toHaveValue(JSON.stringify({
      f1: { title: "姓名", type: "text" },
      f2: { title: "金额", type: "number" },
      f3: { title: "旧字段", type: "text" },
    }));
    fireEvent.change(screen.getByLabelText("示例数据"), { target: { value: "{" } });
    await user.click(screen.getByRole("button", { name: "解析" }));
    expect(screen.getByText("示例数据格式不正确")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "解析" })).not.toBeDisabled();
    expect(onNodeChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("示例数据"), { target: { value: JSON.stringify({
      f1: { title: "客户姓名", type: "text" },
      f2: { title: "金额", type: "text" },
      f4: { title: "新字段", type: "text" },
    }) } });
    expect(screen.queryByText("示例数据格式不正确")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "解析" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "解析" }));
    expect(screen.getByRole("checkbox", { name: "客户姓名" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "金额" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "新字段" })).not.toBeChecked();
    expect(screen.getByText("已移除失效字段：旧字段")).toBeInTheDocument();
    expect(screen.getByText("字段类型已变化，确认后需重新配置：金额")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenCalledTimes(1);
    expect(onNodeChange.mock.calls[0][0].fieldMappings).toEqual([
      { fieldId: "f1", fieldTitle: "客户姓名", fieldType: "text", value: { kind: "literal", value: "张三" } },
      { fieldId: "f2", fieldTitle: "金额", fieldType: "text", value: { kind: "literal", value: "" } },
    ]);
    expect(screen.getByLabelText("客户姓名的值")).toHaveValue("张三");
    expect(screen.getByLabelText("金额的值")).toHaveValue("");
    expect(screen.queryByLabelText("旧字段的值")).not.toBeInTheDocument();
  });

  it("rejects unsafe table links and allows clearing the optional address", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulSmartsheetWriteConfig initialNode={createSmartsheetWriteNode({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      tableUrl: "javascript:alert(1)",
      schema: COMPLETE_SCHEMA,
      fieldMappings: [{ fieldId: "f1", fieldTitle: "姓名", fieldType: "text", value: { kind: "literal", value: "张三" } }],
    })} onNodeChange={onNodeChange} />);
    expect(screen.queryByRole("link", { name: "点此查看" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    await user.clear(screen.getByLabelText("智能表格URL"));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({ tableUrl: "" }));
  });

  it("supports URL values and picker actions for dates and selects", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StatefulSmartsheetWriteConfig
        initialNode={createSmartsheetWriteNode({
          webhookUrl: COMPLETE_WEBHOOK_URL,
          schema: COMPLETE_SCHEMA,
          fieldMappings: [
            {
              fieldId: "url",
              fieldTitle: "订单截图",
              fieldType: "url",
              value: { kind: "literal", value: "https://cdn.example.com/order.png" },
            },
            {
              fieldId: "dt",
              fieldTitle: "下单时间",
              fieldType: "date_time",
              value: { kind: "literal", value: "2026-07-15T09:30" },
            },
            {
              fieldId: "st",
              fieldTitle: "回款状态",
              fieldType: "single_select",
              enumOptions: ["已回款", "未回款"],
              value: { kind: "literal", value: "" },
            },
          ],
        })}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("textbox", { name: "订单截图的值" })).toHaveValue("https://cdn.example.com/order.png");
    await user.clear(screen.getByRole("textbox", { name: "订单截图的值" }));
    await user.type(screen.getByRole("textbox", { name: "订单截图的值" }), "https://example.com/new.png");
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      fieldMappings: expect.arrayContaining([
        expect.objectContaining({ fieldId: "url", value: { kind: "literal", value: "https://example.com/new.png" } }),
      ]),
    }));

    expect(screen.getByLabelText("下单时间的值")).toHaveValue("2026-07-15 09:30");
    await user.click(screen.getByRole("button", { name: "选择下单时间日期" }));
    await user.click(screen.getByRole("button", { name: "下单时间时间" }));
    await user.click(screen.getByRole("button", { name: "20时" }));
    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      fieldMappings: expect.arrayContaining([
        expect.objectContaining({
          fieldId: "dt",
          value: { kind: "literal", value: "2026-07-15T20:30" },
        }),
      ]),
    }));

    await user.click(screen.getByRole("button", { name: "选择回款状态选项" }));
    await user.click(screen.getByRole("menuitem", { name: "已回款" }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      fieldMappings: expect.arrayContaining([
        expect.objectContaining({
          fieldId: "st",
          value: { kind: "literal", value: "已回款" },
        }),
      ]),
    }));
  });

  it("keeps field values editable within the draft length limit without delete actions", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StatefulSmartsheetWriteConfig
        initialNode={createSmartsheetWriteNode({
          webhookUrl: COMPLETE_WEBHOOK_URL,
          schema: COMPLETE_SCHEMA,
          fieldMappings: [{
            fieldId: "f1",
            fieldTitle: "姓名",
            fieldType: "text",
            value: { kind: "literal", value: "张三" },
          }],
        })}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByLabelText("姓名字段名")).toHaveValue("姓名");
    expect(screen.getByLabelText("姓名的值")).toHaveValue("张三");
    expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("姓名的值"));
    await user.paste("x".repeat(10_001));
    expect(onNodeChange.mock.lastCall?.[0].fieldMappings[0].value.value).toHaveLength(10_000);
    expect((screen.getByLabelText("姓名的值") as HTMLInputElement).value).toHaveLength(10_000);
  });

  it("only offers variables compatible with each smartsheet field type", () => {
    const variables = [
      variable("text", { kind: "string" }),
      variable("time", { kind: "datetime" }),
      variable("count", { kind: "number" }),
      variable("flag", { kind: "boolean" }),
    ];

    expect(getCompatibleSmartsheetVariables("text", variables).map(item => item.key))
      .toEqual(["text"]);
    expect(getCompatibleSmartsheetVariables("number", variables).map(item => item.key))
      .toEqual(["count"]);
    expect(getCompatibleSmartsheetVariables("currency", variables).map(item => item.key))
      .toEqual(["count"]);
    expect(getCompatibleSmartsheetVariables("date_time", variables).map(item => item.key))
      .toEqual(["time", "count"]);
    expect(getCompatibleSmartsheetVariables("checkbox", variables).map(item => item.key))
      .toEqual(["flag"]);
  });

  it("reports a variable that is no longer available or changed type", () => {
    const definition = getNodeDefinition("smartsheet-write");
    const node = createSmartsheetWriteNode({
      webhookUrl: COMPLETE_WEBHOOK_URL,
      schema: COMPLETE_SCHEMA,
      fieldMappings: [{
        fieldId: "f1",
        fieldTitle: "姓名",
        fieldType: "text",
        value: {
          kind: "variable",
          selector: ["node", "source", "date"],
          valueType: { kind: "string" },
        },
      }],
    });

    expect(definition.validate?.(node, {
      availableVariables: [variable("date", { kind: "datetime" })],
      edges: [],
      nodes: [node],
    })).toContainEqual(expect.objectContaining({ code: "smartsheet-variable-invalid" }));
  });
});

function StatefulSmartsheetWriteConfig({
  initialNode = createSmartsheetWriteNode(),
  onNodeChange,
}: {
  initialNode?: WorkflowNode<"smartsheet-write">;
  onNodeChange: (patch: WorkflowNodeConfigPatch<"smartsheet-write">) => void;
}) {
  const [node, setNode] = useState(initialNode);
  return (
    <SmartsheetWriteConfig
      edges={[]}
      node={node}
      nodes={[node]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
      }}
    />
  );
}

function createSmartsheetWriteNode(
  data?: Partial<WorkflowNode<"smartsheet-write">["data"]>,
): WorkflowNode<"smartsheet-write"> {
  return dataToNode({
    ...createDefaultNodeData("smartsheet-write"),
    ...data,
  });
}

function dataToNode(data: WorkflowNode<"smartsheet-write">["data"]): WorkflowNode<"smartsheet-write"> {
  return {
    data,
    id: "smartsheet-write",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function variable(
  key: string,
  valueType: Extract<WorkflowOutputValueType, { kind: "boolean" | "datetime" | "number" | "string" }>,
): WorkflowVariableDefinition {
  return {
    key,
    label: key,
    scope: "node",
    selector: ["node", "source", key],
    sourceNodeId: "source",
    sourceNodeKind: "llm",
    sourceNodeTitle: "上游节点",
    type: valueType.kind === "datetime" ? "datetime" : valueType.kind,
    usages: ["variable"],
    valueType,
  };
}
