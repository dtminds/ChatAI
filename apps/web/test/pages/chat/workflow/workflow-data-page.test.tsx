import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowEntryRecordPage } from "@chatai/contracts";
import { WorkflowDataPage } from "@/pages/chat/workflow/workflow-data-page";
import { getWorkflowDocument, resetWorkflowDocumentsForTest } from "@/pages/chat/workflow/workflow-draft-service";

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

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
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

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
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
          customer: { avatar: null, name: "张三" },
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

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    expect(screen.queryByRole("tablist", { name: "数据视图" })).not.toBeInTheDocument();
    expect(within(canvas).queryByRole("button", { name: "打开节点库" })).not.toBeInTheDocument();
    await user.click(within(canvas).getByRole("button", { name: /当前停留 18.*已通过 102/ }));
    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    expect(screen.getByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
    expect(within(records).getByText("张三")).toBeInTheDocument();
    expect(repository.listRecords).toHaveBeenCalledWith(expect.objectContaining({ nodeId: waitNode.id }));

    await user.click(within(records).getByText("张三"));
    expect(await screen.findByRole("heading", { name: "运行轨迹" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "流程变更说明" })).toBeInTheDocument();
    expect(repository.getRecord).toHaveBeenCalledWith(document.id, "31");
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
    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
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
    expect(screen.getByRole("application", { name: "营销 Workflow 画布" })).toBeInTheDocument();
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

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    await userEvent.click(within(canvas).getByRole("button", { name: /当前停留 1/ }));

    const records = await screen.findByRole("dialog", { name: `${waitNode.data.title}进入记录` });
    expect(within(records).getByRole("heading", { name: waitNode.data.title })).toBeInTheDocument();
  });
});
