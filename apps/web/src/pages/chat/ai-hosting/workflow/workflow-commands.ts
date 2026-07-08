import type { Connection } from "@xyflow/react";
import {
  addNodeOperation,
  arrangeNodesOperation,
  connectNodesOperation,
  deleteEdgeOperation,
  deleteEdgesOperation,
  deleteNodeOperation,
  deleteNodesOperation,
  duplicateNodeOperation,
  insertNodeAfterOperation,
  insertNodeBetweenOperation,
  moveNodesOperation,
  pasteClipboardOperation,
  updateNodeDataOperation,
} from "./graph-operations";
import type {
  WorkflowGraphOperation,
  WorkflowNodePositionUpdate,
} from "./graph-operations";
import type {
  InsertableWorkflowNodeKind,
  WorkflowDraft,
  WorkflowNodeConfigPatch,
  WorkflowNodeKind,
} from "./types";
import type { WorkflowClipboardData } from "./workflow-clipboard";
import { createUniqueWorkflowNodeIdFactory } from "./workflow-id";

export type WorkflowGraphCommand =
  | {
    kind: WorkflowNodeKind;
    type: "add-node";
  }
  | {
    kind: InsertableWorkflowNodeKind;
    previousNodeId: string;
    sourceHandle?: string;
    type: "insert-node-after";
  }
  | {
    edgeId: string;
    kind: InsertableWorkflowNodeKind;
    sourceNodeId: string;
    targetNodeId: string;
    type: "insert-node-between";
  }
  | {
    connection: Connection;
    type: "connect-nodes";
  }
  | {
    nodeId: string;
    type: "delete-node";
  }
  | {
    nodeIds: string[];
    type: "delete-nodes";
  }
  | {
    nodeId: string;
    type: "duplicate-node";
  }
  | {
    clipboardData: WorkflowClipboardData;
    type: "paste-clipboard";
  }
  | {
    edgeId: string;
    type: "delete-edge";
  }
  | {
    edgeIds: string[];
    type: "delete-edges";
  }
  | {
    type: "arrange-nodes";
  }
  | {
    nodeId: string;
    type: "move-nodes";
    updates: WorkflowNodePositionUpdate[];
  }
  | {
    nodeId: string;
    patch: WorkflowNodeConfigPatch;
    type: "update-node-data";
  };

export function runWorkflowGraphCommand(
  draft: WorkflowDraft,
  command: WorkflowGraphCommand,
): WorkflowGraphOperation | undefined {
  const createNodeId = createUniqueWorkflowNodeIdFactory(draft);

  switch (command.type) {
    case "add-node":
      return addNodeOperation(draft, command.kind, createNodeId(command.kind));

    case "insert-node-after":
      return insertNodeAfterOperation(
        draft,
        command.previousNodeId,
        command.kind,
        createNodeId(command.kind),
        command.sourceHandle,
      );

    case "insert-node-between":
      return insertNodeBetweenOperation(
        draft,
        command.edgeId,
        command.sourceNodeId,
        command.targetNodeId,
        command.kind,
        createNodeId(command.kind),
      );

    case "connect-nodes":
      return connectNodesOperation(draft, command.connection);

    case "delete-node":
      return deleteNodeOperation(draft, command.nodeId);

    case "delete-nodes":
      return deleteNodesOperation(draft, command.nodeIds);

    case "duplicate-node": {
      const node = draft.nodes.find((currentNode) => currentNode.id === command.nodeId);
      if (!node) {
        return undefined;
      }

      return duplicateNodeOperation(draft, command.nodeId, createNodeId(node.data.kind));
    }

    case "paste-clipboard":
      return pasteClipboardOperation(draft, command.clipboardData, {
        nodeIdFactory: (kind) => createNodeId(kind),
      });

    case "delete-edge":
      return deleteEdgeOperation(draft, command.edgeId);

    case "delete-edges":
      return deleteEdgesOperation(draft, command.edgeIds);

    case "arrange-nodes":
      return arrangeNodesOperation(draft);

    case "move-nodes":
      return moveNodesOperation(draft, command.updates, command.nodeId);

    case "update-node-data":
      return updateNodeDataOperation(draft, command.nodeId, command.patch);

    default:
      return undefined;
  }
}
