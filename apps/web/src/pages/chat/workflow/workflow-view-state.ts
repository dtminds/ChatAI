export type WorkflowSidePanel = "review" | "version-history";

export type WorkflowViewState = {
  activePanel: WorkflowSidePanel | null;
  checksOpen: boolean;
  inspectorOpen: boolean;
  previewVersionId: string | null;
};

export const createDefaultWorkflowViewState = (): WorkflowViewState => ({
  activePanel: null,
  checksOpen: false,
  inspectorOpen: false,
  previewVersionId: null,
});

export type WorkflowViewStateAction =
  | { type: "close-checks" }
  | { type: "close-review" }
  | { type: "close-version-history" }
  | { type: "close-inspector" }
  | { type: "exit-version-preview" }
  | { type: "open-checks" }
  | { type: "open-inspector" }
  | { type: "open-review" }
  | { type: "open-version-history" }
  | { type: "navigate-from-check"; inspectorOpen: boolean }
  | { type: "select-node"; inspectorOpen: boolean }
  | { type: "select-version-preview"; versionId: string }
  | { type: "workflow-edited"; openInspector?: boolean }
  | { type: "version-restored" };

export function reduceWorkflowViewState(
  state: WorkflowViewState,
  action: WorkflowViewStateAction,
): WorkflowViewState {
  switch (action.type) {
    case "close-review":
      return {
        ...state,
        activePanel: state.activePanel === "review" ? null : state.activePanel,
      };
    case "close-checks":
      return {
        ...state,
        checksOpen: false,
      };
    case "close-version-history":
      return {
        ...state,
        activePanel: state.activePanel === "version-history" ? null : state.activePanel,
        previewVersionId: null,
      };
    case "close-inspector":
      return {
        ...state,
        inspectorOpen: false,
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
        checksOpen: true,
      };
    case "open-inspector":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: true,
      };
    case "open-review":
      return {
        ...state,
        activePanel: "review",
        inspectorOpen: false,
      };
    case "open-version-history":
      return {
        ...state,
        activePanel: "version-history",
      };
    case "navigate-from-check":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: action.inspectorOpen,
      };
    case "select-node":
      return {
        ...state,
        activePanel: null,
        inspectorOpen: action.inspectorOpen,
      };
    case "select-version-preview":
      return {
        ...state,
        activePanel: null,
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
