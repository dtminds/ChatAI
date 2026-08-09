import { describe, expect, it } from "vitest";
import { deriveWorkflowMode } from "@/pages/chat/workflow/workflow-mode";

describe("deriveWorkflowMode", () => {
  it("allows graph operations in editing mode", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
    });

    expect(state.mode).toBe("editing");
    expect(state.readOnlyReason).toBe("none");
    expect(state.permissions.canEditGraph).toBe(true);
    expect(state.permissions.canvasReadOnly).toBe(false);
    expect(state.permissions.nodesReadOnly).toBe(false);
  });

  it("keeps editing available when publish permission is missing", () => {
    const state = deriveWorkflowMode({
      canEdit: true,
      canPublish: false,
      isPreviewingVersion: false,
    });

    expect(state.permissions.canEditGraph).toBe(true);
    expect(state.permissions.canEditNodeSettings).toBe(true);
    expect(state.permissions.canPublish).toBe(false);
  });

  it("locks all draft mutations while publishing", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: false,
      publishState: "publishing",
    });

    expect(state.mode).toBe("publishing");
    expect(state.readOnlyReason).toBe("publishing");
    expect(state.permissions.canEditGraph).toBe(false);
    expect(state.permissions.canEditNodeSettings).toBe(false);
    expect(state.permissions.canOpenInsertPalette).toBe(false);
    expect(state.permissions.canPublish).toBe(false);
    expect(state.permissions.canUseHistory).toBe(false);
    expect(state.permissions.canvasReadOnly).toBe(true);
    expect(state.permissions.nodesReadOnly).toBe(true);
  });

  it("locks nodes and canvas when viewing version snapshots", () => {
    expect(deriveWorkflowMode({
      isPreviewingVersion: true,
    })).toEqual(expect.objectContaining({
      isPreviewMode: true,
      mode: "version-preview",
      readOnlyReason: "version-preview",
    }));
  });

  it("locks edits during restore and when edit access is missing", () => {
    const restoringState = deriveWorkflowMode({
      isPreviewingVersion: false,
      restoreState: "restoring",
    });
    expect(restoringState.readOnlyReason).toBe("restoring");
    expect(restoringState.permissions.canEditGraph).toBe(false);

    const readOnlyState = deriveWorkflowMode({
      canEdit: false,
      isPreviewingVersion: false,
    });

    expect(readOnlyState.mode).toBe("editing");
    expect(readOnlyState.readOnlyReason).toBe("permission-denied");
    expect(readOnlyState.permissions.canEditGraph).toBe(false);
    expect(readOnlyState.permissions.nodesReadOnly).toBe(true);
    expect(readOnlyState.permissions.canvasReadOnly).toBe(true);
  });

  it("keeps version snapshots read-only before publishing state", () => {
    const state = deriveWorkflowMode({
      isPreviewingVersion: true,
      publishState: "publishing",
    });

    expect(state.mode).toBe("version-preview");
    expect(state.readOnlyReason).toBe("version-preview");
  });
});
