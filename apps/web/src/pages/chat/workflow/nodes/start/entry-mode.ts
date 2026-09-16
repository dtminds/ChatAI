import type { StartNodeData } from "../../types";
import { isChatAiStartNodeData } from "../../types";

export function getDirectEntryLabel(data: StartNodeData) {
  return isChatAiStartNodeData(data) ? "外部推送" : "营销流转";
}
