import {
  getWorkflowName,
  listWorkflowDocuments,
} from "./workflow-draft-service";

export const workflowListItems = listWorkflowDocuments();

export { getWorkflowName };
