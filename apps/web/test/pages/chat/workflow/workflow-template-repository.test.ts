import { describe, expect, it, vi } from "vitest";
import { createWorkflowTemplateRepository } from "@/pages/chat/workflow/workflow-template-repository";

describe("HTTP Workflow template repository", () => {
  it("requests a template page directly", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { items: [], total: 40 },
    });
    const repository = createWorkflowTemplateRepository({ get, post: vi.fn() });

    await repository.list({ limit: 8, page: 5 });

    expect(get).toHaveBeenCalledWith("/server/workflow-templates?limit=8&page=5");
  });
});
