import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import { createWorkflowDataRepository } from "@/pages/chat/workflow/workflow-data-repository";

const mock = new MockAdapter(requestInstance);

describe("workflow data repository", () => {
  afterEach(() => {
    mock.reset();
  });

  it("reuses an in-flight records request for the same embed workflow page", async () => {
    mock.onGet("/server/embed/workflows/33/records").reply(() => [
      200,
      {
        data: {
          items: [{
            createdAt: "2026-07-12T09:00:00.000Z",
            currentNodeId: "start",
            customer: { avatar: null, name: "张三" },
            nextExecuteAt: null,
            recordId: "31",
            revision: 1,
            status: "waiting",
            subjectType: "wecom_contact",
            updatedAt: "2026-07-12T10:00:00.000Z",
          }],
          nextCursor: null,
        },
        success: true,
      },
    ]);
    const repository = createWorkflowDataRepository("/server/embed/workflows");

    const [first, second] = await Promise.all([
      repository.listRecords({ workflowId: "33" }),
      repository.listRecords({ workflowId: "33" }),
    ]);

    expect(first).toEqual(second);
    expect(first.items[0]?.customer.name).toBe("张三");
    expect(mock.history.get.filter((request) => request.url === "/server/embed/workflows/33/records"))
      .toHaveLength(1);
  });

  it("does not reuse records requests after the first page finishes", async () => {
    mock.onGet("/server/embed/workflows/33/records").reply(200, {
      data: { items: [], nextCursor: null },
      success: true,
    });
    const repository = createWorkflowDataRepository("/server/embed/workflows");

    await repository.listRecords({ workflowId: "33" });
    await repository.listRecords({ workflowId: "33" });

    expect(mock.history.get.filter((request) => request.url === "/server/embed/workflows/33/records"))
      .toHaveLength(2);
  });

  it("keeps distinct record filters on separate requests", async () => {
    mock.onGet("/server/embed/workflows/33/records").reply(200, {
      data: { items: [], nextCursor: null },
      success: true,
    });
    const repository = createWorkflowDataRepository("/server/embed/workflows");

    await Promise.all([
      repository.listRecords({ workflowId: "33" }),
      repository.listRecords({ nodeId: "wait-1", workflowId: "33" }),
    ]);

    expect(mock.history.get.filter((request) => request.url === "/server/embed/workflows/33/records"))
      .toHaveLength(2);
  });

  it("loads an execution log only on demand and reuses it after it finishes", async () => {
    mock.onGet("/server/embed/workflows/33/records/31/executions/2").reply(200, {
      data: {
        completedAt: "2026-07-12T09:00:01.000Z",
        errorCode: null,
        errorMessage: null,
        inputSnapshot: { subjectId: "customer-1" },
        nodeId: "message-query-1",
        nodeKind: "message-query",
        output: { messages: [] },
        sequence: 2,
        sourceOutletId: null,
        startedAt: "2026-07-12T09:00:00.000Z",
        status: "completed",
      },
      success: true,
    });
    const repository = createWorkflowDataRepository("/server/embed/workflows");

    const first = await repository.getExecutionLog("33", "31", 2);
    const second = await repository.getExecutionLog("33", "31", 2);

    expect(first).toEqual(second);
    expect(mock.history.get.filter(request => request.url === "/server/embed/workflows/33/records/31/executions/2"))
      .toHaveLength(1);
  });
});
