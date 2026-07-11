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
});
