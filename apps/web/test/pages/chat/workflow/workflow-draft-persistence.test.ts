import { describe, expect, it } from "vitest";
import { createNewWorkflowDraft } from "@/pages/chat/workflow/graph";
import { getWorkflowTrigger } from "@/pages/chat/workflow/workflow-draft-persistence";

describe("workflow draft persistence", () => {
  it("summarizes a direct-push Start as external push", () => {
    const draft = createNewWorkflowDraft();
    const directPushDraft = {
      ...draft,
      nodes: draft.nodes.map(node => node.data.kind === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              entryMode: "direct-push" as const,
              seatIds: [101],
              triggers: [],
            },
          }
        : node),
    };

    expect(getWorkflowTrigger(directPushDraft)).toBe("外部推送");
  });
});
