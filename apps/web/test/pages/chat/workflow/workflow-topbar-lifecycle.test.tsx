import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowTopBar } from "@/pages/chat/workflow/canvas/workflow-topbar";

describe("WorkflowTopBar lifecycle", () => {
  it("keeps publishing as the editor primary action for an inactive workflow", async () => {
    const onPublish = vi.fn();
    render(
      <WorkflowTopBar
        lastSavedAt="刚刚"
        onExitPreview={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={onPublish}
        onPublishCheck={vi.fn()}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("shows the inactive runtime state in the header", () => {
    render(
      <WorkflowTopBar
        lastSavedAt="刚刚"
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        publishedAt={null}
        publishReady
        publishState="published"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        runtimeStatus="inactive"
        workflowName="新客培育"
      />,
    );

    expect(screen.getByText("草稿")).toBeInTheDocument();
  });

  it("opens version history directly and publish checks from the overflow menu", async () => {
    const user = userEvent.setup();
    const onOpenVersionHistory = vi.fn();
    const onPublishCheck = vi.fn();
    render(
      <WorkflowTopBar
        lastSavedAt="刚刚"
        onBack={vi.fn()}
        onOpenVersionHistory={onOpenVersionHistory}
        onPublish={vi.fn()}
        onPublishCheck={onPublishCheck}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await user.click(screen.getByRole("button", { name: "版本历史" }));
    expect(onOpenVersionHistory).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: /发布检查/ }));
    expect(onPublishCheck).toHaveBeenCalledOnce();
  });

  it("shows runtime status, description tooltip and unpublished changes", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowTopBar
        description="引导新客完成首购"
        hasUnpublishedChanges
        lastSavedAt="21:05:30"
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        publishedAt="07-11 20:00:00"
        publishReady
        publishState="idle"
        readyChecks={4}
        runtimeStatus="active"
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("有尚未发布的修改")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "查看 Workflow 描述" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("引导新客完成首购");
  });

  it("updates workflow name and description from the metadata dialog", async () => {
    const user = userEvent.setup();
    const onUpdateMetadata = vi.fn().mockResolvedValue(true);
    render(
      <WorkflowTopBar
        canRename
        description="旧描述"
        lastSavedAt="刚刚"
        onBack={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        onUpdateMetadata={onUpdateMetadata}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        runtimeStatus="inactive"
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑 Workflow 信息" }));
    const nameInput = screen.getByRole("textbox", { name: "Workflow 名称" });
    const descriptionInput = screen.getByRole("textbox", { name: "Workflow 描述" });
    expect(descriptionInput).toHaveAttribute("maxlength", "1000");
    await user.clear(nameInput);
    await user.type(nameInput, "  新客首购旅程  ");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "  引导新客完成首购  ");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdateMetadata).toHaveBeenCalledWith({
      description: "引导新客完成首购",
      name: "新客首购旅程",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("omits the description control when no description exists", () => {
    render(
      <WorkflowTopBar
        description=""
        lastSavedAt="刚刚"
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        runtimeStatus="inactive"
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    expect(screen.queryByRole("button", { name: "查看 Workflow 描述" })).not.toBeInTheDocument();
  });

  it("cancels metadata editing with Escape", async () => {
    const user = userEvent.setup();
    const onUpdateMetadata = vi.fn();
    render(
      <WorkflowTopBar
        canRename
        description="旧描述"
        lastSavedAt="刚刚"
        onBack={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        onUpdateMetadata={onUpdateMetadata}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        runtimeStatus="inactive"
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑 Workflow 信息" }));
    await user.keyboard("{Escape}");

    expect(onUpdateMetadata).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
