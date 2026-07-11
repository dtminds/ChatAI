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

  it("shows a validated first publish as waiting for activation", () => {
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
        validatedForActivation
        workflowName="新客培育"
      />,
    );

    expect(screen.getByText("已发布，待启用")).toBeInTheDocument();
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

  it("submits a trimmed workflow name from the inline editor", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(true);
    render(
      <WorkflowTopBar
        canRename
        lastSavedAt="刚刚"
        onBack={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        onRename={onRename}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重命名 Workflow" }));
    const input = screen.getByRole("textbox", { name: "Workflow 名称" });
    await user.clear(input);
    await user.type(input, "  新客首购旅程{Enter}");

    expect(onRename).toHaveBeenCalledWith("新客首购旅程");
    expect(screen.queryByRole("textbox", { name: "Workflow 名称" })).not.toBeInTheDocument();
  });

  it("cancels inline rename with Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <WorkflowTopBar
        canRename
        lastSavedAt="刚刚"
        onBack={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={vi.fn()}
        onPublishCheck={vi.fn()}
        onRename={onRename}
        publishedAt={null}
        publishReady
        publishState="idle"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重命名 Workflow" }));
    await user.type(screen.getByRole("textbox", { name: "Workflow 名称" }), "修改{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "重命名 Workflow" })).toBeInTheDocument();
  });
});
