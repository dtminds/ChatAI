import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { MessageConfig } from "@/pages/chat/workflow/nodes/message/panel";
import { messageNodeUi } from "@/pages/chat/workflow/nodes/message/ui";
import type { MessageNodeData, WorkflowNode } from "@/pages/chat/workflow/types";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";

const imageAttachment = {
  content: {
    alt: "新人活动图",
    fileUrl: "https://cdn.example.com/welcome.png",
  },
  materialCollectionId: "material-image-1",
  msgInfoId: "9001",
  type: "image" as const,
};

describe("workflow message node", () => {
  it("keeps attachments and custom content when switching to a guaranteed upstream output", async () => {
    const user = userEvent.setup();
    const messageNode = createMessageNode({
      attachments: [imageAttachment],
      content: [{ type: "text", value: "欢迎加入，这是为你准备的新人活动" }],
      metric: "欢迎加入，这是为你准备的新人活动",
      status: "ready",
      title: "发送欢迎消息",
    });
    const llmNode = createNodeFromKind("llm", "llm-copy", 0);
    llmNode.data = { ...llmNode.data, title: "生成营销文案" };
    const nodes = [llmNode, messageNode];
    const edges = [createEdge(llmNode.id, messageNode.id)];

    render(
      <WorkflowCustomFieldResourceProvider resource={{
        fields: [],
        reload: vi.fn(),
        status: "ready",
      }}
      >
        <MessageConfigFixture
          edges={edges}
          node={messageNode}
          nodes={nodes}
        />
      </WorkflowCustomFieldResourceProvider>,
    );

    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    expect(screen.queryByLabelText("上传图片")).not.toBeInTheDocument();
    expect(screen.getByText("新人活动图")).toBeInTheDocument();
    expect(messageAttachmentLabel(messageNode.data)).toBe("1 个");

    await user.click(screen.getByRole("button", { name: "删除附件 新人活动图" }));
    expect(screen.queryByText("新人活动图")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "节点输出" }));
    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "节点输出" }));
    await user.click(await screen.findByRole("option", { name: "output" }));
    expect(screen.getByRole("combobox", { name: "节点输出" })).toHaveTextContent("output");

    await user.click(screen.getByRole("radio", { name: "自定义消息" }));
    expect(screen.getByRole("textbox", { name: "消息内容" })).toHaveTextContent(
      "欢迎加入，这是为你准备的新人活动",
    );

    await user.click(screen.getByRole("radio", { name: "节点输出" }));
    expect(screen.getByRole("combobox", { name: "节点输出" })).toHaveTextContent("output");
  });
});

function MessageConfigFixture({
  edges,
  node,
  nodes,
}: {
  edges: Parameters<typeof MessageConfig>[0]["edges"];
  node: WorkflowNode<"message">;
  nodes: WorkflowNode[];
}) {
  const [currentNode, setCurrentNode] = useState(node);

  return (
    <MessageConfig
      edges={edges}
      node={currentNode}
      nodes={nodes.map((candidate) => candidate.id === currentNode.id ? currentNode : candidate)}
      onNodeChange={(patch) => {
        setCurrentNode((current) => ({
          ...current,
          data: { ...current.data, ...patch },
        }));
      }}
    />
  );
}

function createMessageNode(patch: Partial<MessageNodeData> = {}): WorkflowNode<"message"> {
  const node = createNodeFromKind("message", "message-welcome", 1);
  return {
    ...node,
    data: {
      ...node.data,
      ...patch,
    },
  };
}

function messageAttachmentLabel(data: MessageNodeData) {
  if (messageNodeUi.body.kind !== "fields") {
    throw new Error("message node body is not field-based");
  }

  const value = messageNodeUi.body.getFields(data).find((field) => field.id === "attachments")?.value;
  return value?.kind === "text" ? value.text : "";
}
