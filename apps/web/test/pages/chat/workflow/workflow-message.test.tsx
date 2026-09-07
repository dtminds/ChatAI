import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { createEdge, createNodeFromKind } from "@/pages/chat/workflow/graph";
import { MessageConfig } from "@/pages/chat/workflow/nodes/message/panel";
import { messageNodeUi } from "@/pages/chat/workflow/nodes/message/ui";
import type { MessageNodeData, WorkflowNode } from "@/pages/chat/workflow/types";
import { WorkflowCustomFieldResourceProvider } from "@/pages/chat/workflow/workflow-custom-field-resource";

describe("workflow message node", () => {
  beforeEach(() => {
    resetWorkbenchService();
    const service = createMockWorkbenchService();
    setWorkbenchService({
      ...service,
      async listMaterialCollections(request) {
        if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
          return service.listMaterialCollections(request);
        }

        return {
          items: [{
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
            content: {
              alt: "新人活动图",
              fileUrl: "https://cdn.example.com/welcome.png",
            },
            contentType: "image",
            groupId: "mock-material-group-image",
            id: "material-image-1",
            msgInfoId: "9001",
            sort: 100,
            title: "新人活动图",
          }],
          pagination: { hasMore: false, page: 1, pageSize: 100, total: 1 },
        };
      },
    });
  });

  it("keeps attachments and custom content when switching to a guaranteed upstream output", async () => {
    const user = userEvent.setup();
    const messageNode = createMessageNode({
      content: [{ type: "text", value: "欢迎加入，这是为你准备的新人活动" }],
      metric: "欢迎加入，这是为你准备的新人活动",
      status: "ready",
      title: "发送欢迎消息",
    });
    const llmNode = createNodeFromKind("llm", "llm-copy", 0);
    llmNode.data = { ...llmNode.data, title: "生成营销文案" };
    const { getNode } = renderMessageConfig({
      edges: [createEdge(llmNode.id, messageNode.id)],
      node: messageNode,
      nodes: [llmNode, messageNode],
    });

    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    expect(screen.queryByLabelText("上传图片")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    expect(await screen.findByRole("dialog", { name: "收录的图片" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "选择图片 新人活动图" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByText("新人活动图")).toBeInTheDocument();
    expect(messageAttachmentLabel(getNode().data)).toBe("1 个");

    await user.click(screen.getByRole("radio", { name: "节点输出" }));
    expect(screen.getByRole("button", { name: "添加附件" })).toBeInTheDocument();
    expect(screen.getByText("新人活动图")).toBeInTheDocument();
    expect(messageAttachmentLabel(getNode().data)).toBe("1 个");
    await user.click(screen.getByRole("combobox", { name: "节点输出" }));
    await user.click(await screen.findByRole("option", { name: "output" }));
    expect(screen.getByRole("combobox", { name: "节点输出" })).toHaveTextContent("output");
    expect(screen.getByText("新人活动图")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "自定义消息" }));
    expect(screen.getByRole("textbox", { name: "消息内容" })).toHaveTextContent(
      "欢迎加入，这是为你准备的新人活动",
    );
    expect(screen.getByText("新人活动图")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "节点输出" }));
    expect(screen.getByRole("combobox", { name: "节点输出" })).toHaveTextContent("output");
    expect(screen.getByText("新人活动图")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除附件 新人活动图" }));
    expect(screen.queryByText("新人活动图")).not.toBeInTheDocument();
    expect(messageAttachmentLabel(getNode().data)).toBe("");
  });
});

function renderMessageConfig({
  edges,
  node,
  nodes,
}: {
  edges: Parameters<typeof MessageConfig>[0]["edges"];
  node: WorkflowNode<"message">;
  nodes: WorkflowNode[];
}) {
  let currentNode = node;

  function MessageConfigFixture() {
    const [draftNode, setDraftNode] = useState(node);
    currentNode = draftNode;

    return (
      <WorkflowCustomFieldResourceProvider resource={{
        fields: [],
        reload: vi.fn(),
        status: "ready",
      }}
      >
        <MessageConfig
          edges={edges}
          node={draftNode}
          nodes={nodes.map((candidate) => candidate.id === draftNode.id ? draftNode : candidate)}
          onNodeChange={(patch) => {
            setDraftNode((current) => ({
              ...current,
              data: { ...current.data, ...patch },
            }));
          }}
        />
      </WorkflowCustomFieldResourceProvider>
    );
  }

  render(<MessageConfigFixture />);
  return {
    getNode: () => currentNode,
  };
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
