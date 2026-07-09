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
