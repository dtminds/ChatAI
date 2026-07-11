import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowTopBar } from "@/pages/chat/workflow/canvas/workflow-topbar";

describe("WorkflowTopBar lifecycle", () => {
  it("uses the primary action to enable a validated inactive workflow", async () => {
    const onEnable = vi.fn();
    const onPublish = vi.fn();
    render(
      <WorkflowTopBar
        activationReady
        lastSavedAt="刚刚"
        onEnable={onEnable}
        onExitPreview={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onPublish={onPublish}
        onPublishCheck={vi.fn()}
        publishedAt={null}
        publishReady
        publishState="published"
        readyChecks={4}
        saveState="saved"
        totalChecks={4}
        workflowName="新客培育"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "启用" }));

    expect(onEnable).toHaveBeenCalledOnce();
    expect(onPublish).not.toHaveBeenCalled();
  });
});
