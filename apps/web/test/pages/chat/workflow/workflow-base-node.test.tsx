import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { WorkflowBaseNode } from "@/pages/chat/workflow/nodes/base-node";
import { WorkflowNodeCard } from "@/pages/chat/workflow/nodes";
import type { WorkflowNodeRenderData } from "@/pages/chat/workflow/types";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    Handle: ({
      children,
      id,
      type,
    }: {
      children?: ReactNode;
      id?: string;
      type?: string;
    }) => (
      <div
        data-handle-id={id}
        data-handle-type={type}
        data-testid={`workflow-handle-${type}-${id ?? "default"}`}
      >
        {children}
      </div>
    ),
  };
});

describe("workflow node chrome", () => {
  it("opens node actions from the floating more button", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const onRename = vi.fn();
    renderBaseNode({
      onDelete,
      onDuplicate,
      onRename,
      selected: true,
      title: "发送欢迎消息",
    });

    await user.click(screen.getByRole("button", { name: "更多操作：发送欢迎消息" }));
    const actionMenu = await screen.findByRole("menu");

    expect(within(actionMenu).getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(within(actionMenu).getByRole("menuitem", { name: "复制节点" })).toBeInTheDocument();
    expect(within(actionMenu).getByRole("menuitem", { name: "删除节点" })).toBeInTheDocument();
    expect(within(actionMenu).queryByRole("menuitem", { name: "打开配置" })).not.toBeInTheDocument();
  });

  it("renames editable nodes inline without opening settings and limits names to 10 characters", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onSelect = vi.fn();
    renderBaseNode({
      onRename,
      onSelect,
      selected: true,
      title: "发送欢迎消息",
    });

    await user.click(screen.getByRole("button", { name: "更多操作：发送欢迎消息" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));

    const nameInput = screen.getByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "12345678901{Enter}");

    expect(onRename).toHaveBeenCalledWith("message-welcome", "1234567890");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("starts inline node renaming by double-clicking the title and cancels with Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderBaseNode({
      onRename,
      selected: true,
      title: "发送欢迎消息",
    });

    await user.dblClick(screen.getByText("发送欢迎消息"));
    const nameInput = screen.getByRole("textbox", { name: "节点名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "不应保存{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("发送欢迎消息")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
  });

  it("keeps start and end nodes protected from menus and double-click rename", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onRename = vi.fn();
    const { rerender } = render(
      <WorkflowBaseNode
        body={null}
        data={createRenderData("start", {
          onDelete,
          onRename,
          title: "新人入会触发",
        })}
        id="start"
      />,
    );

    expect(screen.queryByRole("button", { name: "更多操作：新人入会触发" })).not.toBeInTheDocument();
    await user.dblClick(screen.getByText("新人入会触发"));
    expect(screen.queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();

    rerender(
      <WorkflowBaseNode
        body={null}
        data={createRenderData("end", {
          onDelete,
          onRename,
          title: "结束",
        })}
        id="end"
      />,
    );

    expect(screen.queryByRole("button", { name: "更多操作：结束" })).not.toBeInTheDocument();
    await user.dblClick(screen.getByText("结束"));
    expect(screen.queryByRole("textbox", { name: "节点名称" })).not.toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renders a source handle for each branch path outside the path summary", () => {
    render(
      <WorkflowNodeCard
        {...({
          data: createRenderData("branch", {
            title: "意向判断",
          }),
          id: "branch-intent",
        } as ComponentProps<typeof WorkflowNodeCard>)}
      />,
    );

    const sourceHandles = screen.getAllByTestId(/^workflow-handle-source-/);
    expect(sourceHandles.map((handle) => handle.dataset.handleId)).toEqual([
      "branch-high",
      "branch-default",
    ]);

    (
      [
        ["branch-high", "如果"],
        ["branch-default", "否则"],
      ] as const
    ).forEach(([handleId, label]) => {
      const branchPath = screen.getByTestId(`workflow-branch-path-${handleId}`);
      expect(within(branchPath).queryByTestId(`workflow-handle-source-${handleId}`))
        .not.toBeInTheDocument();
      expect(screen.getByTestId(`workflow-handle-source-${handleId}`)).toBeInTheDocument();
      expect(within(branchPath).queryByRole("button", {
        name: `在意向判断的${label}分支后添加节点`,
      })).not.toBeInTheDocument();
      expect(screen.getByRole("button", {
        name: `在意向判断的${label}分支后添加节点`,
      })).toBeInTheDocument();
    });
  });
});

function renderBaseNode(data: Partial<WorkflowNodeRenderData<"message">> = {}) {
  return render(
    <WorkflowBaseNode
      body={<span>正文</span>}
      data={createRenderData("message", {
        onDelete: vi.fn(),
        onDuplicate: vi.fn(),
        onRename: vi.fn(),
        selected: true,
        title: "发送欢迎消息",
        ...data,
      })}
      id="message-welcome"
    />,
  );
}

function createRenderData<TKind extends "branch" | "end" | "message" | "start">(
  kind: TKind,
  patch: Partial<WorkflowNodeRenderData<TKind>> = {},
): WorkflowNodeRenderData<TKind> {
  return {
    ...createDefaultNodeData(kind),
    ...patch,
  };
}
