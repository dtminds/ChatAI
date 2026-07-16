import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import {
  LLM_INPUT_MAX_COUNT,
  LLM_OUTPUT_FIELD_MAX_COUNT,
  createLlmInputParameter,
  normalizeLlmOutput,
} from "@/pages/chat/workflow/nodes/llm/config";
import { LlmConfig } from "@/pages/chat/workflow/nodes/llm/panel";
import { llmNodeUi } from "@/pages/chat/workflow/nodes/llm/ui";
import { BasePanel } from "@/pages/chat/workflow/panels/base-panel";
import {
  SettingWorkspace,
  SettingWorkspaceEditorContent,
  SettingWorkspaceProvider,
  useSettingWorkspace,
} from "@/pages/chat/workflow/panels/setting-workspace";
import type {
  LlmNodeData,
  WorkflowEdge,
  WorkflowLlmInputParameter,
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";
import { hydrateWorkflowDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import { getWorkflowNodeOutputDefinitions } from "@/pages/chat/workflow/workflow-node-outputs";

const agentServiceMock = vi.hoisted(() => ({
  listAiHostingModels: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);

const model = {
  description: "通用文本模型",
  id: "model-1",
  label: "Doubao Seed",
  model: "Doubao-Seed-2.0-pro",
  name: "doubao-seed",
  supportMultimodal: false,
};

describe("workflow LLM node", () => {
  beforeEach(() => {
    agentServiceMock.listAiHostingModels.mockResolvedValue({ models: [model] });
  });

  it("normalizes malformed configuration deterministically and emits the execution contract", () => {
    const draft = hydrateWorkflowDraft({
      edges: [],
      nodes: [{
        data: {
          inputs: [
            { id: "same", name: "customer_name", value: { kind: "literal", value: "Alice" } },
            { id: "same", name: "count", value: { kind: "variable", selector: ["system", "count"], valueType: { kind: "number" } } },
          ],
          kind: "llm",
          modelId: " model-1 ",
          output: {
            fields: [
              { description: "结果", id: "same", name: "result", type: "string" },
              { description: "置信度", id: "same", name: "score", type: "number" },
            ],
            format: "json",
          },
          systemPrompt: [
            { type: "text", value: "判断 " },
            { selector: ["input", "same"], type: "variable" },
          ],
          title: "生成结果",
          userPrompt: [],
        },
        id: "llm",
        position: { x: 0, y: 0 },
      }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const node = draft.nodes[0];
    expect(node?.data.kind).toBe("llm");
    if (!node || node.data.kind !== "llm") return;

    expect(node.data.modelId).toBe("model-1");
    expect(node.data.inputs.map((input) => input.id)).toEqual(["same", "input-2"]);
    expect(node.data.output.format).toBe("json");
    if (node.data.output.format !== "json") return;
    expect(node.data.output.fields.map((field) => field.id)).toEqual(["same", "output-2"]);

    expect(getNodeDefinition("llm").createExecutionConfig(node.data)).toEqual({
      inputs: node.data.inputs,
      modelId: "model-1",
      output: node.data.output,
      systemPrompt: node.data.systemPrompt,
      userPrompt: [],
    });
    expect(hydrateWorkflowDraft(draft).nodes[0]?.data).toEqual(node.data);
  });

  it("keeps dynamic output selectors stable across output renames and formats", () => {
    const node = createLlmNode({
      output: {
        field: { description: "", id: "output-stable", name: "summary", type: "string" },
        format: "text",
      },
    });
    const textOutput = normalizeLlmOutput(node.data.output);
    expect(textOutput.format).toBe("text");
    if (textOutput.format === "json") return;

    expect(getWorkflowNodeOutputDefinitions(node)).toEqual([
      expect.objectContaining({
        key: "output-stable",
        label: "summary",
        usages: ["variable", "message-content"],
      }),
    ]);

    const renamedNode = {
      ...node,
      data: {
        ...node.data,
        output: {
          field: { ...textOutput.field, name: "campaign_copy" },
          format: "markdown" as const,
        },
      },
    };
    expect(getWorkflowNodeOutputDefinitions(renamedNode)[0]).toEqual(expect.objectContaining({
      key: "output-stable",
      label: "campaign_copy",
    }));

    const jsonNode = createLlmNode({
      output: {
        fields: [
          { description: "", id: "field-title", name: "title", type: "string" },
          { description: "", id: "field-score", name: "score", type: "number" },
        ],
        format: "json",
      },
    });
    expect(getWorkflowNodeOutputDefinitions(jsonNode)).toEqual([
      expect.objectContaining({ key: "field-title", valueType: { kind: "string" } }),
      expect.objectContaining({ key: "field-score", usages: ["variable"], valueType: { kind: "number" } }),
    ]);
  });

  it("shows model, input and output names in the node body", () => {
    const node = createLlmNode({
      inputs: [
        { id: "input-topic", name: "topic", value: { kind: "literal", value: "活动" } },
        { id: "input-tone", name: "tone", value: { kind: "literal", value: "亲切" } },
      ],
      modelId: model.id,
      modelLabel: model.label,
      modelName: model.model,
      output: {
        fields: [
          { description: "", id: "output-title", name: "title", type: "string" },
          { description: "", id: "output-score", name: "score", type: "number" },
        ],
        format: "json",
      },
    });

    if (llmNodeUi.body.kind !== "fields") return;
    expect(llmNodeUi.body.getFields(node.data)).toEqual([
      {
        id: "model",
        label: "模型",
        value: { kind: "model", label: model.label, model: model.model },
      },
      {
        id: "inputs",
        label: "输入",
        value: {
          items: [
            { text: "topic", tone: "default" },
            { text: "tone", tone: "default" },
          ],
          kind: "tags",
          singleLine: true,
        },
      },
      {
        id: "output",
        label: "输出",
        value: {
          items: [
            { text: "title", tone: "default" },
            { text: "score", tone: "default" },
          ],
          kind: "tags",
          singleLine: true,
        },
      },
    ]);
  });

  it("marks incomplete and duplicate node-body parameters as warnings", () => {
    const node = createLlmNode({
      inputs: [
        { id: "input-1", name: "", value: { kind: "literal", value: "" } },
        { id: "input-2", name: "duplicate", value: { kind: "literal", value: "value" } },
        { id: "input-3", name: "duplicate", value: { kind: "literal", value: "value" } },
      ],
      output: {
        fields: [
          { description: "", id: "output-1", name: "", type: "string" },
          { description: "", id: "output-2", name: "duplicate", type: "string" },
          { description: "", id: "output-3", name: "duplicate", type: "number" },
        ],
        format: "json",
      },
    });

    if (llmNodeUi.body.kind !== "fields") return;
    const fields = llmNodeUi.body.getFields(node.data);
    expect(fields.find((field) => field.id === "inputs")?.value).toEqual({
      items: [
        { text: "未配置", tone: "warning" },
        { text: "duplicate", tone: "warning" },
        { text: "duplicate", tone: "warning" },
      ],
      kind: "tags",
      singleLine: true,
    });
    expect(fields.find((field) => field.id === "output")?.value).toEqual({
      items: [
        { text: "未配置", tone: "warning" },
        { text: "duplicate", tone: "warning" },
        { text: "duplicate", tone: "warning" },
      ],
      kind: "tags",
      singleLine: true,
    });
  });

  it("limits input and output names to 15 characters", () => {
    const validName = "abcdefghijklmno";
    const invalidName = `${validName}p`;
    const validNode = createLlmNode({
      inputs: [{ id: "input-1", name: validName, value: { kind: "literal", value: "value" } }],
      modelId: model.id,
      output: {
        field: { description: "", id: "output-1", name: validName, type: "string" },
        format: "text",
      },
      systemPrompt: [{ type: "text", value: "生成内容" }],
    });
    expect(validateWorkflowNodeConfig(validNode, [validNode], [])).toEqual([]);

    const invalidNode = createLlmNode({
      ...validNode.data,
      inputs: [{ id: "input-1", name: invalidName, value: { kind: "literal", value: "value" } }],
      output: {
        field: { description: "", id: "output-1", name: invalidName, type: "string" },
        format: "text",
      },
    });
    expect(validateWorkflowNodeConfig(invalidNode, [invalidNode], []).map((issue) => issue.code))
      .toEqual(expect.arrayContaining([
        "llm-input-name-too-long",
        "llm-output-name-too-long",
      ]));
  });

  it("validates model, inputs, prompts, outputs, and unavailable upstream variables", () => {
    const invalidNode = createLlmNode({
      inputs: [
        { id: "input-1", name: "1bad", value: { kind: "literal", value: "" } },
        { id: "input-2", name: "1bad", value: { kind: "variable", selector: ["node", "missing", "value"], valueType: { kind: "string" } } },
      ],
      modelId: "",
      output: {
        fields: [
          { description: "", id: "output-1", name: "result", type: "string" },
          { description: "", id: "output-2", name: "result", type: "number" },
        ],
        format: "json",
      },
      systemPrompt: [],
      userPrompt: [{ selector: ["input", "missing"], type: "variable" }],
    });
    const issueCodes = validateWorkflowNodeConfig(invalidNode, [invalidNode], [])
      .map((issue) => issue.code);

    expect(issueCodes).toEqual(expect.arrayContaining([
      "llm-model-required",
      "llm-input-name-invalid",
      "llm-input-name-duplicate",
      "llm-input-value-required",
      "llm-input-variable-invalid",
      "llm-system-prompt-required",
      "llm-prompt-input-invalid",
      "llm-output-name-duplicate",
    ]));

    const upstream = createNodeFromKind("message-query", "query", 0);
    const validNode = createLlmNode({
      inputs: [{
        id: "input-messages",
        name: "message_ids",
        value: {
          kind: "variable",
          selector: ["node", upstream.id, "messageIds"],
          valueType: { itemType: "bigint", kind: "array", semantic: "message" },
        },
      }],
      modelId: model.id,
      systemPrompt: [{ selector: ["input", "input-messages"], type: "variable" }],
    });
    const edges = [createEdge(upstream.id, validNode.id)];
    expect(validateWorkflowNodeConfig(validNode, [upstream, validNode], edges)).toEqual([]);
    expect(validateWorkflowNodeConfig(validNode, [upstream, validNode], []))
      .toContainEqual(expect.objectContaining({ code: "llm-input-variable-invalid" }));

    const staleTypeNode = createLlmNode({
      inputs: [{
        id: "input-count",
        name: "message_count",
        value: {
          kind: "variable",
          selector: ["node", upstream.id, "messageCount"],
          valueType: { kind: "string" },
        },
      }],
      modelId: model.id,
      systemPrompt: [{ selector: ["input", "input-count"], type: "variable" }],
    });
    expect(validateWorkflowNodeConfig(
      staleTypeNode,
      [upstream, staleTypeNode],
      [createEdge(upstream.id, staleTypeNode.id)],
    )).toContainEqual(expect.objectContaining({ code: "llm-input-variable-invalid" }));
  });

  it("selects a model, limits inputs, and downgrades deleted prompt tokens to text", async () => {
    const user = userEvent.setup();
    const input = createInput("input-name", "customer_name");
    const node = createLlmNode({
      inputs: [input],
      systemPrompt: [
        { type: "text", value: "欢迎 " },
        { selector: ["input", input.id], type: "variable" },
      ],
    });
    const onNodeChange = vi.fn();
    render(<StatefulLlmConfig initialNode={node} onNodeChange={onNodeChange} />);

    expect(await screen.findByRole("combobox", { name: "模型" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "模型" }));
    await user.click(await screen.findByRole("option", { name: model.label }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      modelId: model.id,
      modelLabel: model.label,
      modelName: model.model,
    }));

    await user.click(screen.getByRole("button", { name: "删除输入参数" }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      inputs: [],
      systemPrompt: [{ type: "text", value: "欢迎 {{customer_name}}" }],
    }));

    for (let index = 0; index < LLM_INPUT_MAX_COUNT; index += 1) {
      await user.click(screen.getByRole("button", { name: "添加输入参数" }));
    }
    expect(screen.getAllByRole("textbox", { name: "输入参数名" })).toHaveLength(LLM_INPUT_MAX_COUNT);
    expect(screen.getByRole("button", { name: "添加输入参数" })).toBeDisabled();
  });

  it("lets an input parameter reference every guaranteed upstream output type", async () => {
    const user = userEvent.setup();
    const query = createNodeFromKind("message-query", "query", 0);
    const llm = createLlmNode({ inputs: [createInput("input-source", "source")] });
    const onNodeChange = vi.fn();

    render(<StatefulLlmConfig
      edges={[createEdge(query.id, llm.id)]}
      initialNode={llm}
      nodes={[query, llm]}
      onNodeChange={onNodeChange}
    />);

    await screen.findByRole("combobox", { name: "模型" });
    await user.click(screen.getByRole("button", { name: "引用变量" }));
    await user.click(screen.getByRole("menuitem", { name: query.data.title }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /消息列表/ }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      inputs: [expect.objectContaining({
        id: "input-source",
        value: {
          kind: "variable",
          selector: ["node", query.id, "messageIds"],
          valueType: { itemType: "bigint", kind: "array", semantic: "message" },
        },
      })],
    }));
  });

  it("keeps settings visible and synchronizes expanded prompt edits immediately", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const input = createInput("input-topic", "topic");
    render(<StatefulLlmConfig
      initialNode={createLlmNode({ inputs: [input], modelId: model.id })}
      onNodeChange={onNodeChange}
    />);

    await screen.findByRole("combobox", { name: "模型" });
    await user.click(screen.getByRole("button", { name: "全屏编辑系统提示词" }));
    const expandedEditor = screen.getByRole("region", { name: "系统提示词展开编辑" });
    const originalEditor = screen.getByRole("textbox", { name: "系统提示词" });
    const settingsPanel = screen.getByRole("complementary", { name: "节点配置" });
    expect(expandedEditor.parentElement).toContainElement(settingsPanel);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(originalEditor).toHaveAttribute("aria-readonly", "true");
    expect(screen.getAllByRole("button", { name: "插入变量" }).filter((button) => button.hasAttribute("disabled")))
      .toHaveLength(1);

    await user.click(within(expandedEditor).getByRole("button", { name: "插入变量" }));
    await user.click(screen.getByRole("menuitem", { name: "输入参数" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /topic/ }));
    await waitFor(() => {
      expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
        systemPrompt: expect.arrayContaining([
          { selector: ["input", input.id], type: "variable" },
        ]),
      }));
    });

    await user.click(within(expandedEditor).getByRole("button", { name: "收起系统提示词" }));
    expect(screen.queryByRole("region", { name: "系统提示词展开编辑" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "节点配置" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "系统提示词" })).toHaveAttribute("aria-readonly", "false");
    screen.getAllByRole("button", { name: "插入变量" })
      .forEach((button) => expect(button).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "全屏编辑用户提示词" }));
    expect(screen.getByRole("region", { name: "用户提示词展开编辑" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "用户提示词展开编辑" })).not.toBeInTheDocument();
  });

  it("keeps the expanded editor open when Escape cancels settings rename", async () => {
    const user = userEvent.setup();
    const node = createLlmNode({ title: "生成营销文案" });

    render(
      <SettingWorkspaceProvider>
        <SettingWorkspace>
          <BasePanel node={node} onClose={vi.fn()} onRenameNode={vi.fn()}>
            <ExpandedEditorFixture />
          </BasePanel>
        </SettingWorkspace>
      </SettingWorkspaceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "展开编辑" }));
    expect(screen.getByRole("region", { name: "测试展开编辑" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多节点操作" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));
    await user.type(await screen.findByRole("textbox", { name: "节点名称" }), "{Escape}");

    expect(screen.queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "测试展开编辑" })).toBeInTheDocument();
  });

  it("switches output formats without changing the stable field ID and limits JSON fields", async () => {
    const user = userEvent.setup();
    const node = createLlmNode({ modelId: model.id });
    const initialOutput = normalizeLlmOutput(node.data.output);
    expect(initialOutput.format).toBe("text");
    if (initialOutput.format === "json") return;
    const stableId = initialOutput.field.id;

    const onNodeChange = vi.fn();
    render(<StatefulLlmConfig initialNode={node} onNodeChange={onNodeChange} />);
    await screen.findByRole("combobox", { name: "模型" });
    expect(screen.queryByRole("textbox", { name: "输出描述" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除输出参数" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "展开输出描述" }));
    expect(screen.getByRole("textbox", { name: "输出描述" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "JSON" }));

    expect(screen.getByRole("textbox", { name: "JSON 字段名" })).toHaveValue("output");
    expect(screen.queryByRole("textbox", { name: "output描述" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 JSON 字段" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "展开 JSON 字段描述" }));
    expect(screen.getByRole("textbox", { name: "output描述" })).toBeInTheDocument();
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      output: {
        fields: [expect.objectContaining({ id: stableId })],
        format: "json",
      },
    }));
    await user.click(screen.getByRole("button", { name: "+ 添加字段" }));
    screen.getAllByRole("button", { name: "删除 JSON 字段" })
      .forEach((button) => expect(button).toBeEnabled());
    for (let index = 2; index < LLM_OUTPUT_FIELD_MAX_COUNT; index += 1) {
      await user.click(screen.getByRole("button", { name: "+ 添加字段" }));
    }
    expect(screen.getAllByRole("textbox", { name: "JSON 字段名" })).toHaveLength(LLM_OUTPUT_FIELD_MAX_COUNT);
    expect(screen.getByRole("button", { name: "+ 添加字段" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Markdown" }));
    expect(screen.getByRole("textbox", { name: "输出变量名" })).toHaveValue("output");
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      output: {
        field: expect.objectContaining({ id: stableId, type: "string" }),
        format: "markdown",
      },
    }));
  });
});

function StatefulLlmConfig({
  edges = [],
  initialNode,
  nodes,
  onNodeChange,
}: {
  edges?: WorkflowEdge[];
  initialNode: WorkflowNode<"llm">;
  nodes?: WorkflowNode[];
  onNodeChange: (patch: WorkflowNodeConfigPatch<"llm">) => void;
}) {
  const [node, setNode] = useState(initialNode);
  return (
    <SettingWorkspaceProvider>
      <SettingWorkspace>
        <aside aria-label="节点配置" role="complementary">
          <LlmConfig
            edges={edges}
            node={node}
            nodes={nodes?.map((candidate) => candidate.id === node.id ? node : candidate) ?? [node]}
            onNodeChange={(patch) => {
              onNodeChange(patch);
              setNode((current) => ({ ...current, data: { ...current.data, ...patch } }));
            }}
          />
        </aside>
      </SettingWorkspace>
    </SettingWorkspaceProvider>
  );
}

function ExpandedEditorFixture() {
  const { openEditor } = useSettingWorkspace();

  return (
    <>
      <button onClick={() => openEditor({ id: "test", title: "测试" })} type="button">
        展开编辑
      </button>
      <SettingWorkspaceEditorContent id="test">
        <div data-testid="expanded-editor-content" />
      </SettingWorkspaceEditorContent>
    </>
  );
}

function createLlmNode(patch: Partial<LlmNodeData> = {}): WorkflowNode<"llm"> {
  const node = createNodeFromKind("llm", "llm", 1);
  return {
    ...node,
    data: { ...node.data, ...patch },
  };
}

function createInput(id: string, name: string): WorkflowLlmInputParameter {
  return {
    ...createLlmInputParameter(),
    id,
    name,
    value: { kind: "literal", value: "Alice" },
  };
}
