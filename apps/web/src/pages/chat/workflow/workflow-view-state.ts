export type WorkflowSidePanel = "checks" | "run-history" | "version-history";

export type WorkflowViewState = {
  activePanel: WorkflowSidePanel | null;
  inspectorOpen: boolean;
  previewVersionId: string | null;
};

export const createDefaultWorkflowViewState = (): WorkflowViewState => ({
  activePanel: null,
  inspectorOpen: false,
  previewVersionId: null,
});

export type WorkflowViewStateAction =
  | { type: "close-checks" }
  | { type: "close-run-history" }
  | { type: "close-version-history" }
  | { type: "close-inspector" }
  | { type: "exit-run-history" }
  | { type: "exit-version-preview" }
  | { type: "open-checks" }
  | { type: "open-inspector" }
  | { type: "open-run-history" }
  | { type: "open-variables" }
  | { type: "open-version-history" }
  | { type: "select-node"; inspectorOpen: boolean }
  | { type: "select-run-history" }
  | { type: "select-version-preview"; versionId: string }
  | { type: "workflow-edited"; openInspector?: boolean }
  | { type: "version-restored" };

export function reduceWorkflowViewState(
  state: WorkflowViewState,
  action: WorkflowViewStateAction,
): WorkflowViewState {
  switch (action.type) {
    case "close-checks":
      return {
        ...state,
        activePanel: state.activePanel === "checks" ? null : state.activePanel,
      };
    case "close-run-history":
      return {
        ...state,
        activePanel: state.activePanel === "run-history" ? null : state.activePanel,
        inspectorOpen: true,
      };
    case "close-version-history":
      return {
        ...state,
        activePanel: state.activePanel === "version-history" ? null : state.activePanel,
        inspectorOpen: true,
        previewVersionId: null,
      };
    case "close-inspector":
      return {
        ...state,
        inspectorOpen: false,
      };
    case "exit-run-history":
      return {
        ...state,
        inspectorOpen: true,
      };
    case "exit-version-preview":
      return {
        ...state,
        inspectorOpen: true,
        previewVersionId: null,
      };
    case "open-checks":
      return {
        ...state,
        activePanel: "checks",
      };
    case "open-inspector":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: true,
      };
    case "open-run-history":
      return {
        ...state,
        activePanel: "run-history",
      };
    case "open-variables":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: true,
      };
    case "open-version-history":
      return {
        ...state,
        activePanel: "version-history",
      };
    case "select-node":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: action.inspectorOpen,
      };
    case "select-run-history":
      return {
        ...state,
        activePanel: "run-history",
        inspectorOpen: false,
        previewVersionId: null,
      };
    case "select-version-preview":
      return {
        ...state,
        activePanel: "version-history",
        inspectorOpen: false,
        previewVersionId: action.versionId,
      };
    case "workflow-edited":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: action.openInspector ?? state.inspectorOpen,
      };
    case "version-restored":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: true,
        previewVersionId: null,
      };
  }
}
