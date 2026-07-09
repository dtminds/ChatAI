import { describe, expect, it } from "vitest";
import {
  createDefaultWorkflowViewState,
  reduceWorkflowViewState,
} from "@/pages/chat/workflow/workflow-view-state";

describe("reduceWorkflowViewState", () => {
  it("keeps side panels mutually exclusive", () => {
    const state = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "open-version-history",
    });

    expect(state.activePanel).toBe("version-history");

    expect(reduceWorkflowViewState(state, {
      type: "open-checks",
    }).activePanel).toBe("checks");

    expect(reduceWorkflowViewState(state, {
      type: "open-run-history",
    }).activePanel).toBe("run-history");
  });

  it("enters and exits version preview state", () => {
    const previewState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "select-version-preview",
      versionId: "version-1",
    });

    expect(previewState).toEqual({
      activePanel: "version-history",
      inspectorOpen: false,
      previewVersionId: "version-1",
    });

    expect(reduceWorkflowViewState(previewState, {
      type: "close-version-history",
    })).toEqual({
      activePanel: null,
      inspectorOpen: true,
      previewVersionId: null,
    });
  });

  it("keeps run history selection read-only until exiting the history run", () => {
    const previewState = reduceWorkflowViewState(createDefaultWorkflowViewState(), {
      type: "select-version-preview",
      versionId: "version-1",
    });
    const historyState = reduceWorkflowViewState(previewState, {
      type: "select-run-history",
    });

    expect(historyState).toEqual({
      activePanel: "run-history",
      inspectorOpen: false,
      previewVersionId: null,
    });

    expect(reduceWorkflowViewState(historyState, {
      type: "exit-run-history",
    })).toEqual({
      activePanel: "run-history",
      inspectorOpen: true,
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
      inspectorOpen: true,
      previewVersionId: null,
    });
  });
});
