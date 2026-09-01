import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import MockAdapter from "axios-mock-adapter";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowEntryRecordPage } from "@chatai/contracts";
import { requestInstance } from "@/lib/request";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { getAiIntentHandleId } from "@/pages/chat/workflow/nodes/ai-intent/config";
import { WorkflowDataPage } from "@/pages/chat/workflow/workflow-data-page";
import type { WorkflowCustomFieldResource } from "@/pages/chat/workflow/workflow-custom-field-resource";
import { hydrateWorkflowDraft } from "@/pages/chat/workflow/workflow-draft-normalizer";
import {
  getWorkflowDocument,
  resetWorkflowDocumentsForTest,
  type WorkflowDocument,
} from "@/pages/chat/workflow/workflow-draft-service";
import { WorkflowSurfaceProvider } from "@/pages/chat/workflow/workflow-surface";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    Background: () => null,
    MiniMap: () => null,
    ReactFlow: ({ edges, nodes, nodeTypes, children }: any) => <div data-edge-ids={edges.map((edge: any) => edge.id).join(",")} data-testid="workflow-flow">{nodes.map((node: any) => { const Component = nodeTypes[node.type]; return <div data-position={`${node.position.x},${node.position.y}`} data-testid={`workflow-flow-node-${node.id}`} key={node.id}><Component data={node.data} id={node.id} /></div>; })}{children}</div>,
    useReactFlow: () => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn() }),
    useViewport: () => ({ zoom: 1 }),
  };
});

function withPublishedCustomFieldReference(document: WorkflowDocument) {
  const messageNode = document.publishedDraft!.nodes.find(node => node.data.kind === "message")!;
  return {
    document: {
      ...document,
      publishedDraft: {
        ...document.publishedDraft!,
        nodes: document.publishedDraft!.nodes.map(node => node.id === messageNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                content: [{
                  selector: ["subject", "customFields", "7"] as [string, string, string],
                  type: "variable" as const,
                }],
                contentMode: "custom" as const,
              },
            }
          : node),
      },
    },
    messageNode,
  };
}

function customFieldResource(
  status: WorkflowCustomFieldResource["status"],
  overrides: Partial<WorkflowCustomFieldResource> = {},
): WorkflowCustomFieldResource {
  return {
    fields: [],
    reload: () => undefined,
    status,
    ...overrides,
  };
}

describe("WorkflowDataPage", () => {
  it("uses current node positions without exposing unpublished graph changes", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const publishedDraft = document.publishedDraft!;
    const waitNode = publishedDraft.nodes.find(node => node.data.kind === "wait")!;
    const movedPosition = { x: waitNode.position.x + 160, y: waitNode.position.y + 80 };
    const unpublishedNode = {
      ...publishedDraft.nodes[0]!,
      id: "unpublished-node",
      position: { x: 999, y: 999 },
    };
    const currentDraft = {
      ...document.draft,
      edges: [],
      nodes: [
        ...document.draft.nodes.map(node => node.id === waitNode.id
          ? {
              ...node,
              data: { ...node.data, title: "未发布节点标题" },
              position: movedPosition,
            }
          : node),
        unpublishedNode,
      ],
    };
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 0, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };
    render(
      <ReactFlowProvider>
        <WorkflowDataPage document={{ ...document, draft: currentDraft }} repository={repository} />
      </ReactFlowProvider>,
    );

    const canvas = await screen.findByRole("application");
    const renderedWaitNode = within(canvas).getByTestId(`workflow-flow-node-${waitNode.id}`);
    expect(renderedWaitNode).toHaveAttribute("data-position", `${movedPosition.x},${movedPosition.y}`);
    expect(within(renderedWaitNode).getByRole("button", {
      name: waitNode.data.title,
    })).toBeInTheDocument();
    expect(within(canvas).queryByTestId("workflow-flow-node-unpublished-node")).not.toBeInTheDocument();
    expect(within(canvas).getByTestId("workflow-flow")).toHaveAttribute(
      "data-edge-ids",
      publishedDraft.edges.map(edge => edge.id).join(","),
    );
  });

  it("renders active customer custom field references with their current label", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const { document: referencedDocument, messageNode } = withPublishedCustomFieldReference(document);
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 0, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };

    render(
      <ReactFlowProvider>
        <WorkflowDataPage
          customFieldResource={customFieldResource("ready", {
            fields: [{
              id: 7,
              key: "level",
              options: [],
              sort: 1,
              title: "会员等级",
              type: 1,
            }],
          })}
          document={referencedDocument}
          repository={repository}
        />
      </ReactFlowProvider>,
    );

    const canvas = await screen.findByRole("application");
    const renderedMessageNode = within(canvas).getByTestId(`workflow-flow-node-${messageNode.id}`);
    expect(within(renderedMessageNode).getByText("会员等级")).toBeInTheDocument();
    expect(within(renderedMessageNode).queryByText("原变量不可用")).not.toBeInTheDocument();
  });

  it("does not render custom fields as unavailable while their directory is loading", () => {
    resetWorkflowDocumentsForTest();
    const { document } = withPublishedCustomFieldReference(getWorkflowDocument("vip-reactivation"));

    render(
      <ReactFlowProvider>
        <WorkflowDataPage
          customFieldResource={customFieldResource("loading")}
          document={document}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("原变量不可用")).not.toBeInTheDocument();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("shows a retry action when the custom field directory fails to load", async () => {
    resetWorkflowDocumentsForTest();
    const { document } = withPublishedCustomFieldReference(getWorkflowDocument("vip-reactivation"));
    const reload = vi.fn();
    const user = userEvent.setup();

    render(
      <ReactFlowProvider>
        <WorkflowDataPage
          customFieldResource={customFieldResource("error", { reload })}
          document={document}
        />
      </ReactFlowProvider>,
    );

    const error = screen.getByRole("alert");
    await user.click(within(error).getByRole("button", { name: "重试" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("原变量不可用")).not.toBeInTheDocument();
  });

  it("does not block workflows without custom field references on directory errors", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 0, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };

    render(
      <ReactFlowProvider>
        <WorkflowDataPage
          customFieldResource={customFieldResource("error")}
          document={document}
          repository={repository}
        />
      </ReactFlowProvider>,
    );

    expect(await screen.findByRole("application")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens all records from the start node metric action", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const startNode = document.publishedDraft!.nodes.find(node => node.data.kind === "start")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 0, entered: 9, incomplete: 0, nodeId: startNode.id, passed: 0 }],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 9, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(async () => ({ items: [], nextCursor: null })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: /已进入 9/ }));

    const records = await screen.findByRole("dialog", { name: "全部进入记录" });
    expect(within(records).getByText("已结束记录仅保留最近 180 天")).toBeInTheDocument();
    expect(repository.listRecords).toHaveBeenCalledWith({
      cursor: undefined,
      workflowId: document.id,
    });
  });

  it("shows workflow totals and opens all records without a node filter", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const startNode = document.publishedDraft!.nodes.find(node => node.data.kind === "start")!;
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const endNode = document.publishedDraft!.nodes.find(node => node.data.kind === "end")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [
          { completed: 0, current: 0, entered: 126, incomplete: 0, nodeId: startNode.id, passed: 0 },
          { completed: 0, current: 18, entered: 0, incomplete: 0, nodeId: waitNode.id, passed: 102 },
          { completed: 92, current: 0, entered: 0, incomplete: 0, nodeId: endNode.id, passed: 0 },
        ],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 92, current: 18, entered: 126, incomplete: 16 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(async () => ({
        items: [{
          createdAt: "2026-07-12T09:00:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: null, name: "全部记录客户" },
          nextExecuteAt: null,
          recordId: "31",
          revision: document.publishedRevision!,
          status: "waiting" as const,
          subjectType: "chatai_contact" as const,
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const summary = await screen.findByRole("region", { name: "运行汇总" });
    expect(within(summary).getByText("126")).toBeInTheDocument();
    expect(within(summary).getByText("18")).toBeInTheDocument();
    expect(within(summary).getByText("92")).toBeInTheDocument();
    expect(within(summary).getByText("16")).toBeInTheDocument();

    await user.click(within(summary).getByRole("button", { name: "查看全部记录" }));

    const records = await screen.findByRole("dialog", { name: "全部进入记录" });
    expect(within(records).getByText("全部记录客户")).toBeInTheDocument();
    expect(repository.listRecords).toHaveBeenCalledWith({
      cursor: undefined,
      workflowId: document.id,
    });
  });

  it("opens all records with one HTTP request under StrictMode", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const startNode = document.publishedDraft!.nodes.find(node => node.data.kind === "start")!;
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const mock = new MockAdapter(requestInstance);
    mock.onGet(`/server/embed/workflows/${document.id}/data`).reply(200, {
      data: {
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [
          { completed: 0, current: 0, entered: 9, incomplete: 0, nodeId: startNode.id, passed: 0 },
        ],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 9, incomplete: 0 },
      },
      success: true,
    });
    mock.onGet(`/server/embed/workflows/${document.id}/records`).reply(200, {
      data: {
        items: [{
          createdAt: "2026-07-12T09:00:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: null, name: "全部记录客户" },
          nextExecuteAt: null,
          recordId: "31",
          revision: document.publishedRevision!,
          status: "waiting",
          subjectType: "wecom_contact",
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      },
      success: true,
    });
    const user = userEvent.setup();

    try {
      render(
        <StrictMode>
          <WorkflowSurfaceProvider surface="sop_embed">
            <ReactFlowProvider>
              <WorkflowDataPage document={document} />
            </ReactFlowProvider>
          </WorkflowSurfaceProvider>
        </StrictMode>,
      );

      const summary = await screen.findByRole("region", { name: "运行汇总" });
      await user.click(within(summary).getByRole("button", { name: "查看全部记录" }));
      expect(await screen.findByText("全部记录客户")).toBeInTheDocument();
      expect(
        mock.history.get.filter((request) => request.url === `/server/embed/workflows/${document.id}/records`),
      ).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });

  it("shows node metrics and opens filtered records with a customer trajectory", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 18, entered: 0, incomplete: 0, nodeId: waitNode.id, passed: 102 }],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 18, entered: 18, incomplete: 0 },
      })),
      getRecord: vi.fn(async () => ({
        createdAt: "2026-07-12T09:00:00.000Z",
        customer: { avatar: null, name: "张三" },
        recordId: "31",
        revision: document.publishedRevision!,
        status: "cancelled" as const,
        subjectType: "chatai_contact" as const,
        terminalReason: "flow_changed_outlet_deleted" as const,
        steps: [{ occurredAt: "2026-07-12T09:00:00.000Z", nodeId: waitNode.id, nodeKind: "wait" as const, revision: document.publishedRevision!, status: "current" as const, title: waitNode.data.title }],
      })),
      listRecords: vi.fn(async () => ({
        items: [{
          createdAt: "2026-07-12T09:00:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: "https://cdn.example.com/zhang.png", name: "张三" },
          nextExecuteAt: "2026-07-13T10:00:00.000Z",
          recordId: "31",
          revision: document.publishedRevision!,
          status: "waiting" as const,
          subjectType: "chatai_contact" as const,
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application");
    expect(screen.queryByRole("tablist", { name: "数据视图" })).not.toBeInTheDocument();
    expect(within(canvas).queryByRole("button", { name: "打开节点库" })).not.toBeInTheDocument();
    await user.click(within(canvas).getByRole("button", { name: /当前停留 18.*已通过 102/ }));
    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    expect(screen.getByRole("application")).toBeInTheDocument();
    expect(within(records).getByText("张三")).toBeInTheDocument();
    expect(repository.listRecords).toHaveBeenCalledWith(expect.objectContaining({ nodeId: waitNode.id }));

    await user.click(within(records).getByText("张三"));
    expect(await screen.findByRole("heading", { name: "运行轨迹" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "流程变更说明" })).toBeInTheDocument();
    expect(repository.getRecord).toHaveBeenCalledWith(document.id, "31");
  });

  it("shows a user-facing reason when a Run is stopped while waiting", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 0, entered: 0, incomplete: 1, nodeId: waitNode.id, passed: 0 }],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 0, entered: 0, incomplete: 1 },
      })),
      getRecord: vi.fn(async () => ({
        createdAt: "2026-07-12T09:00:00.000Z",
        customer: { avatar: null, name: "已停止客户" },
        recordId: "113",
        revision: document.publishedRevision!,
        status: "cancelled" as const,
        subjectType: "chatai_contact" as const,
        terminalReason: null,
        steps: [{
          description: "流程已停止运行",
          occurredAt: "2026-07-12T10:00:00.000Z",
          nodeId: waitNode.id,
          nodeKind: "wait" as const,
          revision: document.publishedRevision!,
          status: "failed" as const,
          title: waitNode.data.title,
        }],
      })),
      listRecords: vi.fn(async () => ({
        items: [{
          createdAt: "2026-07-12T09:00:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: null, name: "已停止客户" },
          nextExecuteAt: null,
          recordId: "113",
          revision: document.publishedRevision!,
          status: "cancelled" as const,
          subjectType: "chatai_contact" as const,
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: /未完成 1/ }));
    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    await user.click(within(records).getByText("已停止客户"));

    expect(screen.getByText("流程已停止运行")).toBeInTheDocument();
  });

  it("shows incomplete node entries alongside current and passed counts", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 1, entered: 0, incomplete: 9, nodeId: waitNode.id, passed: 0 }],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 1, entered: 10, incomplete: 9 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(async () => ({ items: [], nextCursor: null })),
    };

    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application");
    expect(within(canvas).getByRole("button", { name: /当前停留 1.*已通过 0.*未完成 9/ })).toBeInTheDocument();
  });

  it("shows when a Message step is waiting for its sending window", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 1, entered: 0, incomplete: 0, nodeId: waitNode.id, passed: 0 }],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 0, current: 1, entered: 1, incomplete: 0 },
      })),
      getRecord: vi.fn(async () => ({
        createdAt: "2026-07-12T12:31:00.000Z",
        customer: { avatar: null, name: "等待发送客户" },
        recordId: "32",
        revision: document.publishedRevision!,
        status: "waiting" as const,
        subjectType: "chatai_contact" as const,
        terminalReason: null,
        steps: [{
          nextExecuteAt: "2026-07-13T01:00:00.000Z",
          occurredAt: "2026-07-12T12:31:00.000Z",
          nodeId: "message-1",
          nodeKind: "message" as const,
          revision: document.publishedRevision!,
          status: "waiting" as const,
          title: "消息发送",
        }],
      })),
      listRecords: vi.fn(async () => ({
        items: [{
          createdAt: "2026-07-12T12:31:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: null, name: "等待发送客户" },
          nextExecuteAt: "2026-07-13T01:00:00.000Z",
          recordId: "32",
          revision: document.publishedRevision!,
          status: "waiting" as const,
          subjectType: "chatai_contact" as const,
          updatedAt: "2026-07-12T12:31:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: /当前停留 1/ }));
    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    await user.click(within(records).getByText("等待发送客户"));

    expect(await screen.findByText("等待发送 · 07/13 09:00 继续")).toBeInTheDocument();
  });

  it("closes node records when the published revision changes", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const baseVersion = document.versionHistory[0]!;
    const documentWithHistory = {
      ...document,
      versionHistory: [
        { ...baseVersion, id: `${baseVersion.id}-2`, revision: 2 },
        baseVersion,
      ],
    };
    const oldPage: WorkflowEntryRecordPage = {
      items: [{
        createdAt: "2026-07-12T09:00:00.000Z",
        currentNodeId: document.publishedDraft!.nodes[0]!.id,
        customer: { avatar: null, name: "旧版本客户" },
        nextExecuteAt: null,
        recordId: "31",
        revision: 1,
        status: "completed",
        subjectType: "chatai_contact",
        updatedAt: "2026-07-12T10:00:00.000Z",
      }],
      nextCursor: null,
    };
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 1, entered: 0, incomplete: 0, nodeId: waitNode.id, passed: 0 }],
        publishedRevision: 1,
        summary: { completed: 0, current: 1, entered: 1, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn().mockResolvedValue(oldPage),
    };
    const user = userEvent.setup();
    const view = render(
      <ReactFlowProvider>
        <WorkflowDataPage document={documentWithHistory} repository={repository} />
      </ReactFlowProvider>,
    );
    const canvas = await screen.findByRole("application");
    await user.click(within(canvas).getByRole("button", { name: /当前停留 1/ }));
    expect(await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` })).toBeInTheDocument();

    view.rerender(
      <ReactFlowProvider>
        <WorkflowDataPage
          document={{ ...documentWithHistory, publishedRevision: 2 }}
          repository={repository}
        />
      </ReactFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: `${waitNode.data.title}进入记录` })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("application")).toBeInTheDocument();
  });

  it("uses the published draft to resolve current-revision node titles", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 1, entered: 0, incomplete: 0, nodeId: waitNode.id, passed: 0 }],
        publishedRevision: 1,
        summary: { completed: 0, current: 1, entered: 1, incomplete: 0 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(async () => ({
        items: [{
          createdAt: "2026-07-12T09:00:00.000Z",
          currentNodeId: waitNode.id,
          customer: { avatar: null, name: "张三" },
          nextExecuteAt: null,
          recordId: "31",
          revision: document.publishedRevision!,
          status: "waiting" as const,
          subjectType: "chatai_contact" as const,
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    render(
      <ReactFlowProvider>
        <WorkflowDataPage document={{ ...document, versionHistory: [] }} repository={repository} />
      </ReactFlowProvider>,
    );

    const canvas = await screen.findByRole("application");
    await userEvent.click(within(canvas).getByRole("button", { name: /当前停留 1/ }));

    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    expect(within(records).getByRole("heading", { name: waitNode.data.title })).toBeInTheDocument();
  });

  it("echoes configured node summaries that depend on upstream variables", async () => {
    resetWorkflowDocumentsForTest();
    const document = createPublishedVariableEchoDocument();
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [],
        publishedRevision: document.publishedRevision!,
        summary: { completed: 2, current: 0, entered: 0, incomplete: 4 },
      })),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
    };

    render(
      <ReactFlowProvider>
        <WorkflowDataPage document={document} repository={repository} />
      </ReactFlowProvider>,
    );

    const canvas = await screen.findByRole("application");
    const branch = within(canvas).getByRole("button", { name: "条件分支" });
    const messageQuery = within(canvas).getByRole("button", { name: "消息查询" });
    const intent = within(canvas).getByRole("button", { name: "意图识别" });
    const message = within(canvas).getByRole("button", { name: "消息发送" });
    const llm = within(canvas).getByRole("button", { name: "大模型" });
    const handoff = within(canvas).getByRole("button", { name: "转人工" });

    expect(within(branch).queryByText("未配置条件")).not.toBeInTheDocument();
    expect(within(branch).getByText("是否匹配")).toBeInTheDocument();
    expect(within(messageQuery).queryByText("时间变量不可用")).not.toBeInTheDocument();
    expect(within(messageQuery).getByText("触发时间")).toBeInTheDocument();
    expect(within(intent).queryByText("未配置")).not.toBeInTheDocument();
    expect(within(intent).getByLabelText("消息查询.消息列表")).toBeInTheDocument();
    expect(within(message).queryByText("输出不可用")).not.toBeInTheDocument();
    expect(within(message).getByLabelText("消息查询.消息列表")).toBeInTheDocument();
    expect(within(llm).getByText("is_matched")).toBeInTheDocument();
    expect(within(handoff).queryByText("{node.tag-query.matchedTagNames}")).not.toBeInTheDocument();
    expect(within(handoff).getByLabelText("标签查询.匹配标签名")).toBeInTheDocument();
  });
});

function createPublishedVariableEchoDocument(): WorkflowDocument {
  const document = getWorkflowDocument("vip-reactivation");
  const start = {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
  const tagQuery = {
    ...createNodeFromKind("tag-query", "tag-query", 0),
    data: {
      ...createDefaultNodeData("tag-query"),
      tagIds: [1],
      title: "标签查询",
    },
  };
  const branch = {
    ...createNodeFromKind("branch", "branch", 1),
    data: {
      ...createDefaultNodeData("branch"),
      branchPaths: [
        {
          conditions: [{
            id: "condition-matched",
            operator: "is-true" as const,
            selector: ["node", tagQuery.id, "matched"],
            valueType: "boolean" as const,
          }],
          id: "branch-high",
          logic: "all" as const,
        },
        {
          conditions: [],
          id: "branch-default",
          isDefault: true as const,
          logic: "all" as const,
        },
      ],
    },
  };
  const messageQuery = createNodeFromKind("message-query", "message-query", 2);
  const intent = {
    ...createNodeFromKind("ai-intent", "ai-intent", 3),
    data: {
      ...createDefaultNodeData("ai-intent"),
      inputSelector: ["node", messageQuery.id, "messages"],
      intents: [{ description: "愿意参加活动", id: "intent-accept" }],
    },
  };
  const message = {
    ...createNodeFromKind("message", "message", 4),
    data: {
      ...createDefaultNodeData("message"),
      content: [{ selector: ["node", messageQuery.id, "messages"], type: "variable" as const }],
      contentMode: "custom" as const,
    },
  };
  const llm = {
    ...createNodeFromKind("llm", "llm", 5),
    data: {
      ...createDefaultNodeData("llm"),
      inputs: [{
        id: "input-1",
        name: "is_matched",
        value: {
          kind: "variable" as const,
          selector: ["node", tagQuery.id, "matched"],
          valueType: { kind: "boolean" as const },
        },
      }],
      modelId: "model-1",
      modelLabel: "Doubao Seed",
      modelName: "doubao-seed",
    },
  };
  const handoff = {
    ...createNodeFromKind("handoff", "handoff", 6),
    data: {
      ...createDefaultNodeData("handoff"),
      operatorMessage: [{
        selector: ["node", tagQuery.id, "matchedTagNames"],
        type: "variable" as const,
      }],
    },
  };
  const draft = hydrateWorkflowDraft({
    edges: [
      createEdge(start.id, tagQuery.id),
      createEdge(tagQuery.id, branch.id),
      createEdge(branch.id, messageQuery.id, undefined, { sourceHandle: "branch-high" }),
      createEdge(messageQuery.id, intent.id),
      createEdge(intent.id, message.id, undefined, {
        sourceHandle: getAiIntentHandleId("intent-accept"),
      }),
      createEdge(branch.id, llm.id, undefined, { sourceHandle: "branch-default" }),
      createEdge(llm.id, handoff.id),
    ],
    nodes: [start, tagQuery, branch, messageQuery, intent, message, llm, handoff],
  });

  return {
    ...document,
    draft,
    publishedDraft: draft,
  };
}
