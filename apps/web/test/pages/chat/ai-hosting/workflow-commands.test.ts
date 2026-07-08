import { describe, expect, it } from "vitest";
import { createWorkflowClipboardData } from "@/pages/chat/ai-hosting/workflow/workflow-clipboard";
import { runWorkflowGraphCommand } from "@/pages/chat/ai-hosting/workflow/workflow-commands";
import {
  createInitialDraft,
} from "@/pages/chat/ai-hosting/workflow/graph";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(): WorkflowDraft {
  return createInitialDraft();
}

describe("workflow graph commands", () => {
  it("maps user graph intents to undoable operations with generated ids", () => {
    const addOperation = runWorkflowGraphCommand(createDraft(), {
      kind: "ai",
      type: "add-node",
    });

    expect(addOperation?.event).toBe("node:add");
    expect(addOperation?.result?.nodeId).toMatch(/^ai-/);

    const duplicateOperation = runWorkflowGraphCommand(createDraft(), {
      nodeId: "action-message",
      type: "duplicate-node",
    });

    expect(duplicateOperation?.event).toBe("node:duplicate");
    expect(duplicateOperation?.result?.nodeId).toMatch(/^action-/);
    expect(duplicateOperation?.draft.nodes.find((node) => node.id === duplicateOperation.result?.nodeId)?.data.title)
      .toBe("发送欢迎消息 (1)");
  });

  it("keeps invalid commands from creating history operations", () => {
    expect(runWorkflowGraphCommand(createDraft(), {
      nodeId: "missing",
      type: "duplicate-node",
    })).toBeUndefined();

    expect(runWorkflowGraphCommand(createDraft(), {
      kind: "trigger",
      type: "add-node",
    })).toBeUndefined();
  });

  it("pastes clipboard data through the same command boundary with unique node ids", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["action-message"])!;
    const operation = runWorkflowGraphCommand(draft, {
      clipboardData,
      type: "paste-clipboard",
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result?.nodeId).toMatch(/^action-/);
    expect(operation?.draft.nodes.some((node) => node.id === operation.result?.nodeId)).toBe(true);
  });

  it("maps batched edge removals to one graph operation", () => {
    const draft = createDraft();
    const edgeIds = draft.edges.slice(0, 2).map((edge) => edge.id);
    const operation = runWorkflowGraphCommand(draft, {
      edgeIds,
      type: "delete-edges",
    });

    expect(operation?.event).toBe("edge:delete");
    expect(operation?.draft.edges.map((edge) => edge.id)).not.toContain(edgeIds[0]);
    expect(operation?.draft.edges.map((edge) => edge.id)).not.toContain(edgeIds[1]);
  });
});
