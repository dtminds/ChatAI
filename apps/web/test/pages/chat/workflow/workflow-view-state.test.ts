import { describe, expect, it } from "vitest";
import {
  createDefaultWorkflowViewState,
  reduceWorkflowViewState,
} from "@/pages/chat/workflow/workflow-view-state";

describe("reduceWorkflowViewState", () => {
  it("opens publish checks without closing other workspace panels", () => {
    const inspectorState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "open-inspector",
    });
    const state = reduceWorkflowViewState(inspectorState, {
      type: "open-version-history",
    });

    expect(state.activePanel).toBe("version-history");

    expect(reduceWorkflowViewState(state, {
      type: "open-checks",
    })).toEqual({
      activePanel: "version-history",
      checksOpen: true,
      inspectorOpen: true,
      previewVersionId: null,
    });
  });

  it("keeps publish checks open when navigating to a node issue", () => {
    const checksState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "open-checks",
    });

    expect(reduceWorkflowViewState(checksState, {
      inspectorOpen: true,
      type: "navigate-from-check",
    })).toEqual({
      activePanel: null,
      checksOpen: true,
      inspectorOpen: true,
      previewVersionId: null,
    });
  });

  it("enters and exits version preview state", () => {
    const previewState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "select-version-preview",
      versionId: "version-1",
    });

    expect(previewState).toEqual({
      activePanel: null,
      checksOpen: false,
      inspectorOpen: false,
      previewVersionId: "version-1",
    });

    expect(reduceWorkflowViewState(previewState, {
      type: "close-version-history",
    })).toEqual({
      activePanel: null,
      checksOpen: false,
      inspectorOpen: false,
      previewVersionId: null,
    });
  });

  it("opens inspector and clears side panel after graph edits", () => {
    const state = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "open-checks",
    });

    expect(reduceWorkflowViewState(state, {
      openInspector: true,
      type: "workflow-edited",
    })).toEqual({
      activePanel: null,
      checksOpen: true,
      inspectorOpen: true,
      previewVersionId: null,
    });
  });

  it("closes publish checks only through its explicit close action", () => {
    const checksState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "open-checks",
    });

    expect(reduceWorkflowViewState(checksState, {
      inspectorOpen: false,
      type: "select-node",
    }).checksOpen).toBe(true);
    expect(reduceWorkflowViewState(checksState, {
      type: "close-inspector",
    }).checksOpen).toBe(true);
    expect(reduceWorkflowViewState(checksState, {
      type: "close-checks",
    }).checksOpen).toBe(false);
  });
});
