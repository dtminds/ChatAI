import { describe, expect, it } from "vitest";
import {
  getWorkflowMessageNodeStatus,
  hasInvalidWorkflowMessageAttachments,
  normalizeWorkflowMessageAttachments,
} from "@/pages/chat/workflow/nodes/message/attachments";

const validImageAttachment = {
  content: {
    alt: "商品图",
    fileUrl: "https://cdn.example.com/product.png",
  },
  materialCollectionId: "material-image-1",
  msgInfoId: "9001",
  type: "image" as const,
};

describe("workflow message attachments", () => {
  it("removes local and nested temporary attachment data", () => {
    expect(normalizeWorkflowMessageAttachments([{
      ...validImageAttachment,
      content: {
        ...validImageAttachment.content,
        localUrl: "blob:https://example.com/local",
        preview: {
          fallbackUrl: "blob:https://example.com/preview",
        },
      },
      localFile: new File(["image"], "product.png", { type: "image/png" }),
    }])).toEqual([validImageAttachment]);
  });

  it("detects malformed attachments and keeps their node status warning", () => {
    const invalidAttachments = [{
      ...validImageAttachment,
      content: {},
    }];

    expect(hasInvalidWorkflowMessageAttachments(invalidAttachments)).toBe(true);
    expect(getWorkflowMessageNodeStatus({
      attachments: invalidAttachments,
      hasContent: true,
    })).toBe("warning");
    expect(getWorkflowMessageNodeStatus({
      attachments: [validImageAttachment],
      hasContent: false,
    })).toBe("ready");
    expect(getWorkflowMessageNodeStatus({
      attachments: [validImageAttachment],
      hasContent: false,
      requiresContent: true,
    })).toBe("warning");
  });
});
