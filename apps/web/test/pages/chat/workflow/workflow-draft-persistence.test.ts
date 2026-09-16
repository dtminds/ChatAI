// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createNewWorkflowDraft } from "@/pages/chat/workflow/graph";
import { getWorkflowTrigger } from "@/pages/chat/workflow/workflow-draft-persistence";

describe("workflow draft persistence", () => {
  it.each([
    ["chatai_sop", "外部推送"],
    ["wecom_sop", "营销流转"],
  ] as const)("summarizes a %s direct-push Start as %s", (workflowType, expected) => {
    const draft = createNewWorkflowDraft(workflowType);
    const directPushDraft = {
      ...draft,
      nodes: draft.nodes.map(node => node.data.kind === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              entryMode: "direct-push" as const,
              triggers: [],
            },
          }
        : node),
    };

    expect(getWorkflowTrigger(directPushDraft, workflowType)).toBe(expected);
  });
});
