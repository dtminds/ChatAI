import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { createEdge, createInitialNodes, createNodeFromKind } from "@/pages/chat/workflow/graph";
import {
  LLM_INPUT_MAX_COUNT,
  LLM_OUTPUT_FIELD_MAX_COUNT,
  createLlmInputParameter,
  normalizeLlmOutput,
} from "@/pages/chat/workflow/nodes/llm/config";
import { LlmConfig } from "@/pages/chat/workflow/nodes/llm/panel";
import { llmNodeUi } from "@/pages/chat/workflow/nodes/llm/ui";
import { BasePanel } from "@/pages/chat/workflow/panels/base-panel";
import { NodeConfigPanel } from "@/pages/chat/workflow/panels";
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

const llmTestServiceMock = vi.hoisted(() => ({
  cancelWorkflowLlmTestAttempt: vi.fn(),
  createWorkflowLlmTestAttempt: vi.fn(),
  getWorkflowLlmTestAttempt: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/agent-service", () => agentServiceMock);
vi.mock("@/pages/chat/workflow/nodes/llm/test-service", () => llmTestServiceMock);

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
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockReset();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockReset();
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReset();
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

    expect(projectWorkflowNodeExecutionConfig({
      data: node.data,
      kind: "llm",
    })).toEqual({
      inputs: node.data.inputs,
      modelId: "model-1",
      reasoningEffort: "medium",
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

  it("groups Start and current-node lifecycle values under their actual node titles", async () => {
    const user = userEvent.setup();
    const start = createInitialNodes().find(node => node.data.kind === "start")!;
    start.data.title = "客户进入";
    const llm = createLlmNode({ inputs: [createInput("input-source", "source")] });
    llm.data.title = "分析客户需求";
    const onNodeChange = vi.fn();

    render(<StatefulLlmConfig
      edges={[createEdge(start.id, llm.id)]}
      initialNode={llm}
      nodes={[start, llm]}
      onNodeChange={onNodeChange}
    />);

    await screen.findByRole("combobox", { name: "模型" });
    await user.click(screen.getByRole("button", { name: "引用变量" }));
    await user.click(screen.getByRole("menuitem", { name: start.data.title }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inputs: [expect.objectContaining({
        value: expect.objectContaining({
          selector: ["node-lifecycle", start.id, "enteredAt"],
        }),
      })],
    }));

    await user.click(screen.getByRole("button", { name: "引用变量" }));
    await user.click(screen.getByRole("menuitem", { name: `${llm.data.title}（当前节点）` }));
    expect(screen.queryByRole("menuitem", { name: /退出时间.*日期时间/ })).not.toBeInTheDocument();
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /进入时间.*日期时间/ }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inputs: [expect.objectContaining({
        value: expect.objectContaining({
          selector: ["current-node-lifecycle", "enteredAt"],
        }),
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

  it("runs the saved LLM draft with temporary inputs without updating node configuration", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createTestableLlmNode();
    const output = normalizeLlmOutput(node.data.output);
    expect(output.format).toBe("text");
    if (output.format === "json") return;
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ status: "running" }),
    );
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({
        completedAt: "2026-08-13T05:00:01.000Z",
        output: { [output.field.id]: "退款将在 3 个工作日内到账" },
        status: "succeeded",
      }),
    );
    renderLlmTestPanel(node, onNodeChange);

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    expect(within(workspace).getByRole("textbox", { name: "tone的试运行值" })).toHaveValue("简洁");
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "退款多久到账");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    expect(llmTestServiceMock.createWorkflowLlmTestAttempt).toHaveBeenCalledWith(
      "42",
      node.id,
      {
        expectedDraftVersion: 3,
        inputValues: {
          "input-message": "退款多久到账",
          "input-tone": "简洁",
        },
      },
    );
    expect(onNodeChange).not.toHaveBeenCalled();

    expect(await within(workspace).findByText("退款将在 3 个工作日内到账")).toBeInTheDocument();
    expect(llmTestServiceMock.getWorkflowLlmTestAttempt).toHaveBeenCalledWith(
      "42",
      node.id,
      "1",
    );
  });

  it("validates temporary inputs and waits for the current draft to be saved", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const { rerender } = renderLlmTestPanel(node, vi.fn(), "saving");

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    expect(within(screen.getByRole("region", { name: "试运行展开编辑" }))
      .getByRole("button", { name: "运行" })).toBeDisabled();

    rerender(createLlmTestPanel(node, vi.fn(), "saved"));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    expect(within(workspace).getByRole("textbox", { name: "message的试运行值" }))
      .toHaveAttribute("aria-invalid", "true");
    expect(llmTestServiceMock.createWorkflowLlmTestAttempt).not.toHaveBeenCalled();
  });

  it("renders configured JSON output fields instead of adapter response details", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode({
      output: {
        fields: [
          { description: "", id: "field-summary", name: "summary", type: "string" },
          { description: "", id: "field-score", name: "score", type: "number" },
        ],
        format: "json",
      },
    });
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ status: "running" }),
    );
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({
        completedAt: "2026-08-13T05:00:01.000Z",
        output: { "field-score": 0.92, "field-summary": "高意向客户" },
        status: "succeeded",
      }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "需要报价");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    expect(await within(workspace).findByText("高意向客户")).toBeInTheDocument();
    expect(within(workspace).getByText("0.92")).toBeInTheDocument();
    expect(within(workspace).queryByText("field-summary")).not.toBeInTheDocument();
  });

  it.each([
    ["failed" as const, "试运行失败"],
    ["timed_out" as const, "试运行超时"],
  ])("renders the %s Attempt terminal state", async (status, errorMessage) => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ status: "running" }),
    );
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({
        completedAt: "2026-08-13T05:00:01.000Z",
        errorMessage,
        status,
      }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "测试内容");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    expect(await within(workspace).findByRole("alert")).toHaveTextContent(errorMessage);
    expect(within(workspace).getByRole("button", { name: "重新运行" })).toBeEnabled();
  });

  it("stops the current Attempt and ignores a late polling result", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const lateResult = createDeferred<ReturnType<typeof createAttempt>>();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ status: "running" }),
    );
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(lateResult.promise);
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "测试停止");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await waitFor(() => expect(llmTestServiceMock.getWorkflowLlmTestAttempt).toHaveBeenCalled());

    await user.click(within(workspace).getByRole("button", { name: "停止运行" }));
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).toHaveBeenCalledWith("42", node.id, "1");
    expect(await within(workspace).findByRole("alert")).toHaveTextContent("试运行已停止");

    lateResult.resolve(createAttempt({
      completedAt: new Date().toISOString(),
      output: { "output-1": "迟到结果" },
      status: "succeeded",
    }));
    await waitFor(() => {
      expect(within(workspace).queryByText("迟到结果")).not.toBeInTheDocument();
      expect(within(workspace).getByRole("button", { name: "重新运行" })).toBeEnabled();
    });
  });

  it("does not restore the previous result after closing and reopening the test Workspace", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({
        completedAt: new Date().toISOString(),
        output: { "output-1": "本次结果" },
        status: "succeeded",
      }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    let workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "不恢复结果");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    expect(await within(workspace).findByText("本次结果")).toBeInTheDocument();

    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    expect(screen.queryByRole("region", { name: "试运行展开编辑" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    workspace = screen.getByRole("region", { name: "试运行展开编辑" });

    expect(within(workspace).queryByText("本次结果")).not.toBeInTheDocument();
    expect(within(workspace).getByRole("textbox", { name: "message的试运行值" })).toHaveValue("");
    expect(llmTestServiceMock.getWorkflowLlmTestAttempt).toHaveBeenCalledTimes(1);
  });

  it("confirms and cancels a running Attempt before closing the test Workspace", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(new Promise(() => undefined));
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "关闭运行中任务");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "继续运行" }));
    expect(screen.getByRole("region", { name: "试运行展开编辑" })).toBeInTheDocument();
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).not.toHaveBeenCalled();

    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    await user.click(within(screen.getByRole("alertdialog"))
      .getByRole("button", { name: "停止并关闭" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "试运行展开编辑" }))
      .not.toBeInTheDocument());
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).toHaveBeenCalledWith("42", node.id, "1");
  });

  it("clears a pending close confirmation when the Attempt finishes", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const completed = createDeferred<ReturnType<typeof createAttempt>>();
    llmTestServiceMock.createWorkflowLlmTestAttempt
      .mockResolvedValueOnce(createAttempt({ attemptId: "1" }))
      .mockResolvedValueOnce(createAttempt({ attemptId: "2" }));
    llmTestServiceMock.getWorkflowLlmTestAttempt
      .mockReturnValueOnce(completed.promise)
      .mockResolvedValueOnce(createAttempt({
        attemptId: "2",
        completedAt: new Date().toISOString(),
        output: { "output-1": "第二次结果" },
        status: "succeeded",
      }));
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "终态关闭确认");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await waitFor(() => expect(llmTestServiceMock.getWorkflowLlmTestAttempt).toHaveBeenCalled());
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    completed.resolve(createAttempt({
      attemptId: "1",
      completedAt: new Date().toISOString(),
      output: { "output-1": "第一次结果" },
      status: "succeeded",
    }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await user.click(within(workspace).getByRole("button", { name: "重新运行" }));
    expect(await within(workspace).findByText("第二次结果")).toBeInTheDocument();
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).not.toHaveBeenCalled();
  });

  it("guards closing the node settings panel while an Attempt is running", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const onClose = vi.fn();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(new Promise(() => undefined));
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    render(createLlmTestPanel(node, vi.fn(), "saved", onClose));

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "关闭节点配置");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(screen.getByRole("button", { name: "关闭节点配置" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "停止并关闭" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).toHaveBeenCalledWith("42", node.id, "1");
  });

  it("guards Escape and switching expanded editors while an Attempt is running", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(new Promise(() => undefined));
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "关闭保护");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续运行" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "全屏编辑系统提示词" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(document.querySelector('[aria-label="试运行展开编辑"]')).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "系统提示词展开编辑" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停止并关闭" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "试运行展开编辑" }))
      .not.toBeInTheDocument());
  });

  it("warns before leaving the page only while an Attempt is active", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(new Promise(() => undefined));
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "离开提示");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    const runningUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(runningUnload);
    expect(runningUnload.defaultPrevented).toBe(true);

    await user.click(within(workspace).getByRole("button", { name: "停止运行" }));
    await waitFor(() => expect(within(workspace).getByRole("button", { name: "重新运行" })).toBeEnabled());

    const terminalUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(terminalUnload);
    expect(terminalUnload.defaultPrevented).toBe(false);
  });

  it("waits for an Attempt identity and cancels it when closing during creation", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const created = createDeferred<ReturnType<typeof createAttempt>>();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockReturnValue(created.promise);
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "创建中关闭");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    await user.click(within(screen.getByRole("alertdialog"))
      .getByRole("button", { name: "停止并关闭" }));
    expect(screen.getByRole("region", { name: "试运行展开编辑" })).toBeInTheDocument();

    created.resolve(createAttempt());

    await waitFor(() => expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt)
      .toHaveBeenCalledWith("42", node.id, "1"));
    expect(screen.queryByRole("region", { name: "试运行展开编辑" })).not.toBeInTheDocument();
  });

  it("cancels a created Attempt after confirmed close even when the panel unmounts", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const created = createDeferred<ReturnType<typeof createAttempt>>();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockReturnValue(created.promise);
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockResolvedValue(
      createAttempt({ completedAt: new Date().toISOString(), status: "cancelled" }),
    );
    const rendered = renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "卸载后取消");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    await user.click(screen.getByRole("button", { name: "停止并关闭" }));
    rendered.unmount();

    created.resolve(createAttempt());

    await waitFor(() => expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt)
      .toHaveBeenCalledWith("42", node.id, "1"));
  });

  it("keeps the test Workspace open when creation fails after confirming close", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    const created = createDeferred<ReturnType<typeof createAttempt>>();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockReturnValue(created.promise);
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "创建失败");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    await user.click(within(screen.getByRole("alertdialog"))
      .getByRole("button", { name: "停止并关闭" }));

    created.reject(new Error("network"));

    expect(await within(workspace).findByRole("alert")).toHaveTextContent("操作失败，请稍后重试");
    expect(screen.getByRole("region", { name: "试运行展开编辑" })).toBeInTheDocument();
    expect(llmTestServiceMock.cancelWorkflowLlmTestAttempt).not.toHaveBeenCalled();
  });

  it("keeps the test Workspace open when cancelling during close fails", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt.mockResolvedValue(createAttempt());
    llmTestServiceMock.getWorkflowLlmTestAttempt.mockReturnValue(new Promise(() => undefined));
    llmTestServiceMock.cancelWorkflowLlmTestAttempt.mockRejectedValue(new Error("network"));
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "取消失败");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    await user.click(within(workspace).getByRole("button", { name: "收起试运行" }));
    await user.click(within(screen.getByRole("alertdialog"))
      .getByRole("button", { name: "停止并关闭" }));

    expect(await within(workspace).findByRole("alert")).toHaveTextContent("操作失败，请稍后重试");
    expect(screen.getByRole("region", { name: "试运行展开编辑" })).toBeInTheDocument();
  });

  it("replaces the current result when rerun", async () => {
    const user = userEvent.setup();
    const node = createTestableLlmNode();
    llmTestServiceMock.createWorkflowLlmTestAttempt
      .mockResolvedValueOnce(createAttempt({ attemptId: "1" }))
      .mockResolvedValueOnce(createAttempt({ attemptId: "2" }));
    llmTestServiceMock.getWorkflowLlmTestAttempt
      .mockResolvedValueOnce(createAttempt({
        attemptId: "1",
        completedAt: new Date().toISOString(),
        output: { "output-1": "第一次结果" },
        status: "succeeded",
      }))
      .mockResolvedValueOnce(createAttempt({
        attemptId: "2",
        completedAt: new Date().toISOString(),
        output: { "output-1": "第二次结果" },
        status: "succeeded",
      }));
    renderLlmTestPanel(node, vi.fn());

    await user.click(screen.getByRole("button", { name: "试运行大模型节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "message的试运行值" }), "重新运行");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));
    expect(await within(workspace).findByText("第一次结果")).toBeInTheDocument();

    await user.click(within(workspace).getByRole("button", { name: "重新运行" }));
    expect(await within(workspace).findByText("第二次结果")).toBeInTheDocument();
    expect(within(workspace).queryByText("第一次结果")).not.toBeInTheDocument();
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

function renderLlmTestPanel(
  node: WorkflowNode<"llm">,
  onNodeChange: (patch: WorkflowNodeConfigPatch<"llm">) => void,
  saveState: "dirty" | "error" | "saved" | "saving" = "saved",
) {
  return render(createLlmTestPanel(node, onNodeChange, saveState));
}

function createLlmTestPanel(
  node: WorkflowNode<"llm">,
  onNodeChange: (patch: WorkflowNodeConfigPatch<"llm">) => void,
  saveState: "dirty" | "error" | "saved" | "saving" = "saved",
  onClose = vi.fn(),
) {
  return (
    <NodeConfigPanel
      allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
      edges={[]}
      node={node}
      nodes={[node]}
      onClose={onClose}
      onNodeChange={onNodeChange}
      onRenameNode={vi.fn()}
      testContext={{ draftVersion: 3, saveState, workflowId: "42" }}
    />
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

function createTestableLlmNode(patch: Partial<LlmNodeData> = {}) {
  return createLlmNode({
    inputs: [
      {
        id: "input-message",
        name: "message",
        value: {
          kind: "variable",
          selector: ["trigger", "text"],
          valueType: { kind: "string" },
        },
      },
      { id: "input-tone", name: "tone", value: { kind: "literal", value: "简洁" } },
    ],
    modelId: model.id,
    output: {
      field: { description: "", id: "output-1", name: "output", type: "string" },
      format: "text",
    },
    systemPrompt: [
      { type: "text", value: "请用" },
      { selector: ["input", "input-tone"], type: "variable" },
      { type: "text", value: "方式回答" },
    ],
    userPrompt: [{ selector: ["input", "input-message"], type: "variable" }],
    ...patch,
  });
}

function createAttempt(overrides: Partial<{
  attemptId: string;
  completedAt: string | null;
  errorMessage: string | null;
  inputValues: Record<string, boolean | number | string>;
  output: Record<string, boolean | number | string> | null;
  status: "cancelled" | "failed" | "running" | "succeeded" | "timed_out";
}> = {}) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  return {
    attemptId: "1",
    completedAt: null,
    createdAt: createdAt.toISOString(),
    errorMessage: null,
    executionMode: "real" as const,
    expiresAt: expiresAt.toISOString(),
    inputValues: {},
    nodeId: "llm",
    output: null,
    status: "running" as const,
    workflowId: "42",
    ...overrides,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
