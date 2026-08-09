import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_WAIT_DURATION_MAX_BY_UNIT } from "@chatai/contracts";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { WAIT_EVENT_TIMEOUT_MAX_BY_UNIT } from "@/pages/chat/workflow/nodes/wait-event/config";
import { WaitEventConfig } from "@/pages/chat/workflow/nodes/wait-event/panel";
import {
  WAIT_EVENT_TIMEOUT_HANDLE_ID,
  WAIT_EVENT_TRIGGERED_HANDLE_ID,
} from "@/pages/chat/workflow/nodes/wait-event/events";
import type { WorkflowNode } from "@/pages/chat/workflow/types";
import {
  getAvailableIntentInputOutputsForNode,
  getAvailableTimeReferenceOutputsForNode,
  getAvailableVariablesForNode,
} from "@/pages/chat/workflow/workflow-variables";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";

describe("workflow wait event", () => {
  it("defines fixed outcomes, execution config and typed message outputs", () => {
    const definition = getNodeDefinition("wait-event");
    const node = createWaitEventNode();

    expect(definition.createExecutionConfig(node.data)).toEqual({
      event: {
        collectWindowSeconds: 10,
        type: "customer.message.received",
      },
      timeout: { duration: 24, unit: "hour" },
    });
    expect(definition.getSourceHandles(node.data)).toEqual([
      expect.objectContaining({
        id: WAIT_EVENT_TRIGGERED_HANDLE_ID,
        label: "事件到达（新消息）",
        outletKind: "outcome",
      }),
      expect.objectContaining({
        id: WAIT_EVENT_TIMEOUT_HANDLE_ID,
        label: "等待超时",
        outletKind: "outcome",
      }),
    ]);
    expect(definition.getOutputVariables?.(node)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        availableOnSourceHandles: [WAIT_EVENT_TRIGGERED_HANDLE_ID],
        key: "messageIds",
        usages: ["intent-input"],
        valueType: { itemType: "bigint", kind: "array", semantic: "message" },
      }),
      expect.objectContaining({
        key: "textContent",
        usages: ["intent-input", "message-content", "variable"],
      }),
      expect.objectContaining({
        key: "lastMessageAt",
        usages: ["time-reference", "variable"],
        valueType: { kind: "datetime" },
      }),
    ]));
  });

  it("configures the event and keeps timeout values within unit limits", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createWaitEventNode();

    render(
      <WaitEventConfig
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("combobox", { name: "等待事件类型" })).toHaveTextContent("客户发送新消息");
    const timeoutInput = screen.getByRole("spinbutton", { name: "最长等待时间" });
    fireEvent.change(timeoutInput, { target: { value: "999" } });
    fireEvent.blur(timeoutInput);
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      timeout: { duration: WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.hour, unit: "hour" },
    }));

    await user.click(screen.getByRole("combobox", { name: "最长等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "天" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      timeout: { duration: WAIT_EVENT_TIMEOUT_MAX_BY_UNIT.day, unit: "day" },
    }));
  });

  it("only exposes event-specific outputs on the triggered path", () => {
    const startNode = createStartNode();
    const waitEventNode = createWaitEventNode();
    const triggeredNode = createNodeFromKind("message-query", "triggered-query", 2);
    const timeoutNode = createNodeFromKind("message-query", "timeout-query", 3);
    const mergedNode = createNodeFromKind("message", "merged-message", 4);
    const nodes = [startNode, waitEventNode, triggeredNode, timeoutNode, mergedNode];
    const edges = [
      createEdge(startNode.id, waitEventNode.id),
      createEdge(waitEventNode.id, triggeredNode.id, undefined, {
        sourceHandle: WAIT_EVENT_TRIGGERED_HANDLE_ID,
      }),
      createEdge(waitEventNode.id, timeoutNode.id, undefined, {
        sourceHandle: WAIT_EVENT_TIMEOUT_HANDLE_ID,
      }),
      createEdge(triggeredNode.id, mergedNode.id),
      createEdge(timeoutNode.id, mergedNode.id),
    ];

    expect(getAvailableIntentInputOutputsForNode(triggeredNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: ["node", waitEventNode.id, "messageIds"] }),
      ]));
    expect(getAvailableVariablesForNode(triggeredNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: ["node", waitEventNode.id, "textContent"] }),
      ]));
    expect(getAvailableTimeReferenceOutputsForNode(triggeredNode.id, nodes, edges))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: ["node", waitEventNode.id, "lastMessageAt"] }),
      ]));
    expect(getAvailableIntentInputOutputsForNode(timeoutNode.id, nodes, edges)).toEqual([]);
    expect(getAvailableVariablesForNode(timeoutNode.id, nodes, edges).some((variable) =>
      variable.sourceNodeId === waitEventNode.id,
    )).toBe(false);
    expect(getAvailableVariablesForNode(mergedNode.id, nodes, edges).some((variable) =>
      variable.sourceNodeId === waitEventNode.id,
    )).toBe(false);
  });

  it("validates the persisted timeout without accepting out-of-range values", () => {
    const node = {
      ...createWaitEventNode(),
      data: {
        ...createDefaultNodeData("wait-event"),
        timeout: { duration: 16, unit: "day" as const },
      },
    };

    expect(validateWorkflowNodeConfig(node, [node], [])).toContainEqual(expect.objectContaining({
      code: "wait-event-timeout-invalid",
    }));
  });
});

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: "workflow",
  };
}

function createWaitEventNode(): WorkflowNode<"wait-event"> {
  return createNodeFromKind("wait-event", "wait-event", 1);
}
