import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowDraftSchema,
  WorkflowRuntimeStatusSchema,
} from "../src/workflow/dto.js";

describe("workflow contracts", () => {
  it("accepts the production node kinds and rejects legacy kinds", () => {
    const draft = createDraft("branch");

    expect(Value.Check(WorkflowDraftSchema, draft)).toBe(true);
    expect(Value.Check(WorkflowDraftSchema, createDraft("action"))).toBe(false);
  });

  it("keeps database identifiers as decimal strings", () => {
    const definition = {
      createdAt: "2026-07-10T00:00:00.000Z",
      draft: createDraft("branch"),
      draftVersion: 1,
      id: "9007199254740993",
      name: "新客培育",
      permissions: {
        canDelete: true,
        canEdit: true,
        canOperate: true,
        canPublish: true,
        canView: true,
      },
      publishedRevision: null,
      runtimeStatus: "inactive",
      updatedAt: "2026-07-10T00:00:00.000Z",
      validatedDraftVersion: null,
    };

    expect(Value.Check(WorkflowDefinitionSchema, definition)).toBe(true);
    expect(Value.Check(WorkflowDefinitionSchema, { ...definition, id: 9_007_199_254_740_993 })).toBe(false);
  });

  it("models paused and stopped as distinct runtime states", () => {
    expect(Value.Check(WorkflowRuntimeStatusSchema, "paused")).toBe(true);
    expect(Value.Check(WorkflowRuntimeStatusSchema, "stopped")).toBe(true);
  });
});

function createDraft(kind: string) {
  return {
    edges: [],
    nodes: [
      {
        data: {
          kind,
          label: "条件分支",
          metric: "",
          schemaVersion: 1,
          status: "ready",
          summary: "",
          title: "条件分支",
        },
        id: "node-1",
        position: { x: 0, y: 0 },
        type: "workflowNode",
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
