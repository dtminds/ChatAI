import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
  WorkflowRepositoryError,
} from "@/pages/chat/workflow/workflow-draft-service";
import type { WorkflowDraftRepository } from "@/pages/chat/workflow/workflow-draft-service";
import {
  useWorkflowDocumentResource,
  useWorkflowListResource,
} from "@/pages/chat/workflow/workflow-resources";

describe("workflow resources", () => {
  it("keeps the list in loading state until an async repository read resolves", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    let resolveList: ((items: ReturnType<typeof baseRepository.listDocuments>) => void) | undefined;
    const repository: WorkflowDraftRepository = {
      ...baseRepository,
      listDocuments: () => new Promise((resolve) => {
        resolveList = resolve;
      }),
    };
    const { result } = renderHook(() => useWorkflowListResource(repository));

    expect(result.current.status).toBe("loading");
    expect(result.current.items).toEqual([]);

    await act(async () => {
      resolveList?.(baseRepository.listDocuments());
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.items.map((workflow) => workflow.id)).toContain("newcomer-conversion");
  });

  it("distinguishes missing documents from retryable read failures", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    let shouldFail = true;
    const repository: WorkflowDraftRepository = {
      ...baseRepository,
      getDocument: (workflowId) => {
        if (workflowId === "missing-workflow") {
          throw new WorkflowRepositoryError("not-found", "missing");
        }

        if (shouldFail) {
          throw new TypeError("network unavailable");
        }

        return baseRepository.getDocument(workflowId);
      },
    };
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocumentResource(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("network");

    shouldFail = false;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.document?.id).toBe("newcomer-conversion");

    rerender({ workflowId: "missing-workflow" });
    await waitFor(() => expect(result.current.status).toBe("not-found"));
    expect(result.current.document).toBeNull();
  });
});
