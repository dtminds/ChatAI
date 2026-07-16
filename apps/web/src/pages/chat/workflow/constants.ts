export const WORKFLOW_NODE_TYPE = "workflow";
export const WORKFLOW_EDGE_TYPE = "workflow";
export const WORKFLOW_MIN_ZOOM = 0.25;
export const WORKFLOW_MAX_ZOOM = 2;
export const WORKFLOW_NODE_WIDTH = 320;
export const WORKFLOW_BRANCH_NODE_WIDTH = 320;
export const WORKFLOW_NODE_ESTIMATED_HEIGHT = 176;
export const WORKFLOW_COMPACT_NODE_ESTIMATED_HEIGHT = 96;
export const WORKFLOW_TERMINAL_NODE_ESTIMATED_HEIGHT = 60;
export const WORKFLOW_NODE_HANDLE_TOP = 16;
export const WORKFLOW_LAYOUT_X_GAP = 390;
export const WORKFLOW_LAYOUT_Y_GAP = 118;
export const WORKFLOW_AI_BADGE_URL = "https://b5.bokr.com.cn/dist/ai_icon.png";

export const workflowZoomOptions = [
  { label: "200%", value: 2 },
  { label: "100%", value: 1 },
  { label: "75%", value: 0.75 },
  { label: "50%", value: 0.5 },
  { label: "25%", value: 0.25 },
] as const;
