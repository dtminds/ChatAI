// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { RequestNormalizedError } from "@/lib/request";
import { createWorkflowTemplateRepository } from "@/pages/chat/workflow/workflow-template-repository";

describe("HTTP Workflow template repository", () => {
  it("requests a template page directly", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { items: [], total: 40 },
    });
    const repository = createWorkflowTemplateRepository({ delete: vi.fn(), get, post: vi.fn() });

    await repository.list({ limit: 8, page: 5 });

    expect(get).toHaveBeenCalledWith("/server/workflow-templates?limit=8&page=5");
  });

  it("preserves actionable API errors from template operations", async () => {
    const get = vi.fn().mockRejectedValue(new RequestNormalizedError({
      code: "WORKFLOW_ENTITLEMENT_REQUIRED",
      message: "当前无对应产品权益",
      status: 403,
    }));
    const repository = createWorkflowTemplateRepository({ delete: vi.fn(), get, post: vi.fn() });

    await expect(repository.get("18")).rejects.toMatchObject({
      apiCode: "WORKFLOW_ENTITLEMENT_REQUIRED",
      code: "forbidden",
      message: "当前无对应产品权益",
    });
  });

  it("requests unpublished template drafts from the management endpoint", async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [], total: 0 } });
    const deleteRequest = vi.fn().mockResolvedValue({ data: { id: "18" } });
    const repository = createWorkflowTemplateRepository({ delete: deleteRequest, get, post: vi.fn() });

    await repository.listDrafts?.({ limit: 8, page: 2, query: "欢迎" });
    await repository.getDraft?.("18");
    await repository.deleteDraft?.("18");

    expect(get).toHaveBeenNthCalledWith(1, "/server/workflow-template-drafts?limit=8&page=2&query=%E6%AC%A2%E8%BF%8E");
    expect(get).toHaveBeenNthCalledWith(2, "/server/workflow-template-drafts/18");
    expect(deleteRequest).toHaveBeenCalledWith("/server/workflow-template-drafts/18");
  });

  it("withdraws a published template through the management endpoint", async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: "18", status: "draft" } });
    const repository = createWorkflowTemplateRepository({ delete: vi.fn(), get: vi.fn(), post });

    await repository.withdraw?.("18");

    expect(post).toHaveBeenCalledWith("/server/workflow-templates/18/withdraw");
  });

  it("updates draft metadata through the management endpoint", async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: "18", status: "draft" } });
    const repository = createWorkflowTemplateRepository({ delete: vi.fn(), get: vi.fn(), patch, post: vi.fn() });

    await repository.updateDraft?.("18", {
      coverUrl: "https://example.com/template.png",
      description: "新描述",
      name: "新名称",
      tags: ["scene:customer_care"],
    });

    expect(patch).toHaveBeenCalledWith("/server/workflow-template-drafts/18", {
      coverUrl: "https://example.com/template.png",
      description: "新描述",
      name: "新名称",
      tags: ["scene:customer_care"],
    });
  });

  it("updates published template metadata through the management endpoint", async () => {
    const patch = vi.fn().mockResolvedValue({ data: { id: "18", status: "published" } });
    const repository = createWorkflowTemplateRepository({ delete: vi.fn(), get: vi.fn(), patch, post: vi.fn() });

    await repository.updateInfo?.("18", {
      coverUrl: "https://example.com/template.png",
      description: "新描述",
      name: "新名称",
      tags: ["scene:customer_care"],
    });

    expect(patch).toHaveBeenCalledWith("/server/workflow-templates/18", {
      coverUrl: "https://example.com/template.png",
      description: "新描述",
      name: "新名称",
      tags: ["scene:customer_care"],
    });
  });
});
