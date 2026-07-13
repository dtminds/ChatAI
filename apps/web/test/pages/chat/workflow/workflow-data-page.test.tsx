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
    ReactFlow: ({ nodes, nodeTypes, children }: any) => <div>{nodes.map((node: any) => { const Component = nodeTypes[node.type]; return <Component data={node.data} id={node.id} key={node.id} />; })}{children}</div>,
    useReactFlow: () => ({ fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn() }),
    useViewport: () => ({ zoom: 1 }),
  };
});

describe("WorkflowDataPage", () => {
  it("shows node metrics and opens filtered records with a customer trajectory", async () => {
    resetWorkflowDocumentsForTest();
    const document = getWorkflowDocument("vip-reactivation");
    const waitNode = document.publishedDraft!.nodes.find(node => node.data.kind === "wait")!;
    const repository = {
      getOverview: vi.fn(async () => ({
        calculatedAt: "2026-07-12T10:00:00.000Z",
        nodes: [{ completed: 0, current: 18, entered: 0, nodeId: waitNode.id, passed: 102 }],
        revision: document.publishedRevision!,
      })),
      getRecord: vi.fn(async () => ({
        createdAt: "2026-07-12T09:00:00.000Z",
        customer: { avatar: null, name: "张三" },
        recordId: "31",
        revision: document.publishedRevision!,
        status: "waiting" as const,
        steps: [{ occurredAt: "2026-07-12T09:00:00.000Z", nodeId: waitNode.id, nodeKind: "wait" as const, status: "current" as const, title: waitNode.data.title }],
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
          updatedAt: "2026-07-12T10:00:00.000Z",
        }],
        nextCursor: null,
      })),
    };
    const user = userEvent.setup();
    render(<ReactFlowProvider><WorkflowDataPage document={document} repository={repository} /></ReactFlowProvider>);

    const canvas = await screen.findByRole("application", { name: "营销 Workflow 画布" });
    expect(within(canvas).queryByRole("button", { name: "打开节点库" })).not.toBeInTheDocument();
    expect(within(canvas).queryByRole("button", { name: /已进入/ })).not.toBeInTheDocument();
    expect(within(canvas).queryByRole("button", { name: /已通过 102/ })).not.toBeInTheDocument();
    await user.click(within(canvas).getByRole("button", { name: /当前停留 18/ }));
    expect(await screen.findByText(/共显示 1 条进入记录/)).toBeInTheDocument();
    expect(repository.listRecords).toHaveBeenCalledWith(expect.objectContaining({ nodeId: waitNode.id }));

    await user.click(screen.getByText("张三"));
    expect(await screen.findByRole("heading", { name: "运行轨迹" })).toBeInTheDocument();
    expect(repository.getRecord).toHaveBeenCalledWith(document.id, "31");
  });

  it("clears records while loading a different revision", async () => {
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
    let resolveRevision!: (page: WorkflowEntryRecordPage) => void;
    const revisionRequest = new Promise<WorkflowEntryRecordPage>((resolve) => {
      resolveRevision = resolve;
    });
    const oldPage: WorkflowEntryRecordPage = {
      items: [{
        createdAt: "2026-07-12T09:00:00.000Z",
        currentNodeId: document.publishedDraft!.nodes[0]!.id,
        customer: { avatar: null, name: "旧版本客户" },
        nextExecuteAt: null,
        recordId: "31",
        revision: 1,
        status: "completed",
        updatedAt: "2026-07-12T10:00:00.000Z",
      }],
      nextCursor: null,
    };
    const repository = {
      getOverview: vi.fn(async () => ({ calculatedAt: "2026-07-12T10:00:00.000Z", nodes: [], revision: 1 })),
      getRecord: vi.fn(),
      listRecords: vi.fn().mockResolvedValueOnce(oldPage).mockReturnValueOnce(revisionRequest),
    };
    const user = userEvent.setup();
    const view = render(
      <ReactFlowProvider>
        <WorkflowDataPage document={documentWithHistory} repository={repository} revision={1} />
      </ReactFlowProvider>,
    );
    await user.click(screen.getByRole("tab", { name: "进入记录" }));
    expect(await screen.findByText("旧版本客户")).toBeInTheDocument();

    view.rerender(
      <ReactFlowProvider>
        <WorkflowDataPage document={documentWithHistory} repository={repository} revision={2} />
      </ReactFlowProvider>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("旧版本客户")).not.toBeInTheDocument();
    resolveRevision({ items: [], nextCursor: null });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByText("旧版本客户")).not.toBeInTheDocument();
  });
});
