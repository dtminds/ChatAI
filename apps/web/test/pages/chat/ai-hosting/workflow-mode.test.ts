import { describe, expect, it } from "vitest";
import { deriveWorkflowMode } from "@/pages/chat/ai-hosting/workflow/workflow-mode";

describe("deriveWorkflowMode", () => {
  it("allows graph operations in editing mode", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
    });

    expect(state.mode).toBe("editing");
    expect(state.readOnlyReason).toBe("none");
    expect(state.permissions.canEditGraph).toBe(true);
    expect(state.permissions.canRunWorkflow).toBe(true);
    expect(state.permissions.canvasReadOnly).toBe(false);
    expect(state.permissions.nodesReadOnly).toBe(false);
  });

  it("locks all draft mutations while publishing", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
      publishState: "publishing",
    });

    expect(state.mode).toBe("publishing");
    expect(state.readOnlyReason).toBe("publishing");
    expect(state.permissions.canEditGraph).toBe(false);
    expect(state.permissions.canEditNodeSettings).toBe(false);
    expect(state.permissions.canOpenInsertPalette).toBe(false);
    expect(state.permissions.canPublish).toBe(false);
    expect(state.permissions.canRunWorkflow).toBe(false);
    expect(state.permissions.canUseHistory).toBe(false);
    expect(state.permissions.canvasReadOnly).toBe(true);
    expect(state.permissions.nodesReadOnly).toBe(true);
  });

  it("locks workflow operations while a run is active", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
      workflowRunStatus: "running",
    });

    expect(state.mode).toBe("running");
    expect(state.readOnlyReason).toBe("running");
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
      readOnlyReason: "version-preview",
    }));

    expect(deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: true,
    })).toEqual(expect.objectContaining({
      isPreviewMode: true,
      mode: "run-history",
      readOnlyReason: "run-history",
    }));
  });

  it("locks edits during restore and when edit access is missing", () => {
    const restoringState = deriveWorkflowMode({
      isPreviewingVersion: false,
      isViewingRunHistory: false,
      restoreState: "restoring",
    });
    expect(restoringState.readOnlyReason).toBe("restoring");
    expect(restoringState.permissions.canEditGraph).toBe(false);

    const readOnlyState = deriveWorkflowMode({
      canEdit: false,
      isPreviewingVersion: false,
      isViewingRunHistory: false,
    });

    expect(readOnlyState.mode).toBe("editing");
    expect(readOnlyState.readOnlyReason).toBe("permission-denied");
    expect(readOnlyState.permissions.canEditGraph).toBe(false);
    expect(readOnlyState.permissions.nodesReadOnly).toBe(true);
    expect(readOnlyState.permissions.canvasReadOnly).toBe(false);
  });

  it("keeps historical snapshots read-only before publishing state", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: true,
      isViewingRunHistory: false,
      publishState: "publishing",
    });

    expect(state.mode).toBe("version-preview");
    expect(state.readOnlyReason).toBe("version-preview");
  });
});
