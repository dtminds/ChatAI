import { describe, expect, it } from "vitest";
import { deriveWorkflowMode } from "@/pages/chat/ai-hosting/workflow/workflow-mode";

describe("deriveWorkflowMode", () => {
  it("allows graph operations in editing mode", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
    });

    expect(state.mode).toBe("editing");
    expect(state.permissions.canEditGraph).toBe(true);
    expect(state.permissions.canRunWorkflow).toBe(true);
    expect(state.permissions.canvasReadOnly).toBe(false);
    expect(state.permissions.nodesReadOnly).toBe(false);
  });

  it("locks workflow operations while a run is active", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
      workflowRunStatus: "running",
    });

    expect(state.mode).toBe("running");
    expect(state.permissions.canEditGraph).toBe(false);
    expect(state.permissions.canRunWorkflow).toBe(false);
    expect(state.permissions.canvasReadOnly).toBe(true);
    expect(state.permissions.nodesReadOnly).toBe(true);
  });

  it("locks nodes and canvas when viewing historical snapshots", () => {
    expect(deriveWorkflowMode({
      isPreviewingVersion: true,
      isViewingRunHistory: false,
    })).toEqual(expect.objectContaining({
      isPreviewMode: true,
      mode: "version-preview",
    }));

    expect(deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: true,
    })).toEqual(expect.objectContaining({
      isPreviewMode: true,
      mode: "run-history",
    }));
  });

  it("locks edits during restore and when edit access is missing", () => {
    expect(deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
      restoreState: "restoring",
    }).permissions.canEditGraph).toBe(false);

    const readOnlyState = deriveWorkflowMode({
      canEdit: false,
      isPreviewingVersion: false,
      isViewingRunHistory: false,
    });

    expect(readOnlyState.mode).toBe("editing");
    expect(readOnlyState.permissions.canEditGraph).toBe(false);
    expect(readOnlyState.permissions.nodesReadOnly).toBe(true);
    expect(readOnlyState.permissions.canvasReadOnly).toBe(false);
  });
});
