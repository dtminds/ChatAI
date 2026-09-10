import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { NodeConfigPanel } from "@/pages/chat/workflow/panels";
import { BasePanel } from "@/pages/chat/workflow/panels/base-panel";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import type { WorkflowNode } from "@/pages/chat/workflow/types";
import { WorkflowSurfaceProvider } from "@/pages/chat/workflow/workflow-surface";

describe("workflow node settings chrome", () => {
  it("keeps node naming in the header menu instead of a settings field", async () => {
    const user = userEvent.setup();
    const node = createWaitNode();
    renderPanel(node);

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).queryByLabelText("节点名称")).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("节点说明")).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "更多节点操作" }));
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }))
      .toBeInTheDocument();
  });

  it("renames a node from the settings menu and limits names to 10 characters", async () => {
    const user = userEvent.setup();
    const onRenameNode = vi.fn();
    render(<RenamePanelFixture onRenameNode={onRenameNode} />);

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "更多节点操作" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    const nameInput = await within(panel).findByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "12345678901{Enter}");

    expect(onRenameNode).toHaveBeenCalledWith("wait-2d", "1234567890");
    expect(within(panel).getByRole("heading", { name: "1234567890" })).toBeInTheDocument();
  });

  it("clears settings rename state when selecting another node", async () => {
    const user = userEvent.setup();
    const waitNode = createWaitNode();
    const messageNode = createMessageNode();
    const { rerender } = renderPanel(waitNode);

    let panel = screen.getByRole("complementary", { name: "节点配置" });
    await user.click(within(panel).getByRole("button", { name: "更多节点操作" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));
    await user.type(await within(panel).findByRole("textbox", { name: "节点名称" }), "观察期新名称");

    rerender(createPanel(messageNode));
    panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "发送欢迎消息" })).toBeInTheDocument();
  });

  it("does not show the settings menu for protected nodes", () => {
    renderPanel({
      data: createDefaultNodeData("start"),
      id: "start",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    });

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).queryByRole("button", { name: "更多节点操作" })).not.toBeInTheDocument();
  });

  it.each(["ai-intent", "llm", "ai-collect"] as const)(
    "shows the billing entry for the %s node",
    (kind) => {
      renderBasePanel(createNodeFromKind(kind, `${kind}-billing`, 0));

      expect(screen.getByRole("link", { name: "前往订阅页查看计费说明" }))
        .toHaveAttribute("href", "/chat/ai-hosting/subscription");
    },
  );

  it("keeps the billing entry out of non-AI and embedded workflow panels", () => {
    const { rerender } = renderBasePanel(createWaitNode());
    expect(screen.queryByRole("link", { name: "前往订阅页查看计费说明" }))
      .not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <WorkflowSurfaceProvider surface="sop_embed">
          {createBasePanel(createNodeFromKind("llm", "embedded-llm", 0))}
        </WorkflowSurfaceProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "前往订阅页查看计费说明" }))
      .not.toBeInTheDocument();
  });
});

function renderBasePanel(node: WorkflowNode) {
  return render(<MemoryRouter>{createBasePanel(node)}</MemoryRouter>);
}

function createBasePanel(node: WorkflowNode) {
  return (
    <BasePanel
      node={node}
      onClose={vi.fn()}
      onRenameNode={vi.fn()}
    >
      <div>节点设置</div>
    </BasePanel>
  );
}

function renderPanel(
  node: WorkflowNode,
  overrides: Partial<Parameters<typeof createPanel>[1]> = {},
) {
  return render(createPanel(node, overrides));
}

function createPanel(
  node: WorkflowNode,
  overrides: {
    onRenameNode?: (nodeId: string, title: string) => void;
  } = {},
) {
  return (
    <NodeConfigPanel
      allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
      edges={[]}
      node={node}
      nodes={[node]}
      onClose={vi.fn()}
      onNodeChange={vi.fn()}
      onRenameNode={overrides.onRenameNode ?? vi.fn()}
    />
  );
}

function RenamePanelFixture({
  onRenameNode,
}: {
  onRenameNode: (nodeId: string, title: string) => void;
}) {
  const [node, setNode] = useState(createWaitNode());

  return createPanel(node, {
    onRenameNode: (nodeId, title) => {
      onRenameNode(nodeId, title);
      setNode((current) => ({
        ...current,
        data: { ...current.data, title },
      }));
    },
  });
}

function createWaitNode(): WorkflowNode<"wait"> {
  const node = createNodeFromKind("wait", "wait-2d", 0);
  return {
    ...node,
    data: {
      ...node.data,
      title: "观察期",
    },
  };
}

function createMessageNode(): WorkflowNode<"message"> {
  const node = createNodeFromKind("message", "message-welcome", 1);
  return {
    ...node,
    data: {
      ...node.data,
      title: "发送欢迎消息",
    },
  };
}
