import { describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import type { WorkflowHandoffCommand } from "@chatai/contracts";
import {
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import {
  MysqlWorkflowHandoffCapabilityPort,
  executeWorkflowHandoff,
} from "../src/handoff-capability-port.js";

describe("Workflow Handoff Java port", () => {
  it("uses the frozen seat and maps one idempotent composite Java request", async () => {
    const { database, queries } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const fetchMock = vi.fn(async () => javaResponse({ data: 9001, success: true }));

    await expect(executeWorkflowHandoff(database, {
      baseUrl: "https://java.example.com/internal",
      command: handoffCommand({ customerMessage: "正在转接" }),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:handoff-1:2",
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({});

    expect(queries).toHaveLength(1);
    expect(queries[0]?.parameters).toEqual([9, 101]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://java.example.com/third-internal/wap-embed/conversation/close-full-auto-with-message?idempotentKey=9%3Arun-1%3Ahandoff-1%3A2",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        externalMessage: "正在转接",
        platform: 5,
        systemMessage: "客户需要人工处理",
        thirdExternalUserid: "customer-1",
        thirdUserid: "work-user-1",
        uid: 9,
      }),
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("omits externalMessage when the node did not configure customer content", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const fetchMock = vi.fn(async () => javaResponse({ data: 9001, success: true }));

    await executeWorkflowHandoff(database, {
      baseUrl: "https://java.example.com",
      command: handoffCommand(),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "stable-key",
      signal: new AbortController().signal,
      token: null,
      uid: 9,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      platform: 5,
      systemMessage: "客户需要人工处理",
      thirdExternalUserid: "customer-1",
      thirdUserid: "work-user-1",
      uid: 9,
    });
  });

  it("rejects an identity mismatch before querying the seat or calling Java", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));
    const fetchMock = vi.fn();
    const port = new MysqlWorkflowHandoffCapabilityPort(database, {
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(WORKFLOW_HANDOFF_CAPABILITY_BINDING.definition, {
      ...request(),
      identities: { thirdExternalUserId: "another-customer" },
    })).rejects.toMatchObject({
      code: "WORKFLOW_HANDOFF_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not substitute another seat when the Run-frozen seat is unavailable", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));

    await expect(executeWorkflowHandoff(database, {
      baseUrl: "https://java.example.com",
      command: handoffCommand(),
      fetch: vi.fn() as typeof fetch,
      idempotencyKey: "stable-key",
      signal: new AbortController().signal,
      token: null,
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_HANDOFF_ACCOUNT_UNAVAILABLE",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.parameters).toEqual([9, 101]);
  });

  it("classifies transport and non-200 responses as retryable", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const cases = [
      {
        code: "WORKFLOW_HANDOFF_FAILED",
        fetch: vi.fn(async () => { throw new Error("network"); }),
      },
      {
        code: "WORKFLOW_HANDOFF_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status: 400 })),
      },
      {
        code: "WORKFLOW_HANDOFF_UNAVAILABLE",
        fetch: vi.fn(async () => new Response(null, { status: 503 })),
      },
    ];

    for (const item of cases) {
      await expect(executeWorkflowHandoff(database, {
        baseUrl: "https://java.example.com",
        command: handoffCommand(),
        fetch: item.fetch as typeof fetch,
        idempotencyKey: "stable-key",
        signal: new AbortController().signal,
        token: null,
        uid: 9,
      })).rejects.toMatchObject({ code: item.code, failureKind: "retryable" });
    }
  });

  it("treats business rejection and invalid HTTP 200 envelopes as terminal", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const cases = [
      {
        code: "WORKFLOW_HANDOFF_REJECTED",
        diagnosticMessage:
          "Workflow Handoff Java endpoint rejected the request: 40001 会话不可转",
        fetch: vi.fn(async () => javaResponse({
          error: 40001,
          errorMsg: " 会话不可转 ",
          success: false,
        })),
      },
      {
        code: "WORKFLOW_HANDOFF_RESPONSE_INVALID",
        fetch: vi.fn(async () => javaResponse({ data: 9001 })),
      },
      {
        code: "WORKFLOW_HANDOFF_RESPONSE_INVALID",
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      },
    ];

    for (const item of cases) {
      await expect(executeWorkflowHandoff(database, {
        baseUrl: "https://java.example.com",
        command: handoffCommand(),
        fetch: item.fetch as typeof fetch,
        idempotencyKey: "stable-key",
        signal: new AbortController().signal,
        token: null,
        uid: 9,
      })).rejects.toMatchObject({
        code: item.code,
        ...(item.diagnosticMessage ? { diagnosticMessage: item.diagnosticMessage } : {}),
        failureKind: "terminal",
      });
    }
  });

  it("reuses the caller-provided idempotency key on a retry", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(javaResponse({ data: 9001, success: true }));
    const input = {
      baseUrl: "https://java.example.com",
      command: handoffCommand(),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "stable-key",
      signal: new AbortController().signal,
      token: null,
      uid: 9,
    };

    await expect(executeWorkflowHandoff(database, input)).rejects.toMatchObject({
      failureKind: "retryable",
    });
    await expect(executeWorkflowHandoff(database, input)).resolves.toEqual({});
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/wap-embed/conversation/close-full-auto-with-message?idempotentKey=stable-key",
      "https://java.example.com/third-internal/wap-embed/conversation/close-full-auto-with-message?idempotentKey=stable-key",
    ]);
  });

  it("propagates cancellation before querying the seat or calling Java", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowHandoff(database, {
      baseUrl: "https://java.example.com",
      command: handoffCommand(),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "stable-key",
      signal: controller.signal,
      token: null,
      uid: 9,
    })).rejects.toBe(reason);
    expect(queries).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function handoffCommand(
  overrides: Partial<WorkflowHandoffCommand> = {},
): WorkflowHandoffCommand {
  return {
    customerMessage: "",
    operatorMessage: "客户需要人工处理",
    recipient: { thirdExternalUserId: "customer-1" },
    seatId: 101,
    source: "workflow",
    ...overrides,
  };
}

function request() {
  return {
    command: handoffCommand(),
    deadlineAt: new Date("2026-08-20T10:00:15.000Z"),
    execution: {
      nodeId: "handoff-1",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { thirdExternalUserId: "customer-1" },
    idempotencyKey: "9:run-1:handoff-1:2",
    signal: new AbortController().signal,
    subjectId: "customer-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function seatRow(id: number, thirdUserId: string) {
  return { id, platform: 5, third_userid: thirdUserId };
}

function javaResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function createRecordingDatabase(resolve: (query: CompiledQuery) => QueryResult<unknown>) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);
      return resolve(query) as QueryResult<R>;
    },
    streamQuery: async function* <R>(): AsyncIterableIterator<QueryResult<R>> {
      yield { rows: [] };
    },
  };
  const fallback = new DummyDriver();
  const driver: Driver = {
    ...fallback,
    acquireConnection: async () => connection,
    beginTransaction: async () => undefined,
    commitTransaction: async () => undefined,
    destroy: async () => undefined,
    init: async () => undefined,
    releaseConnection: async () => undefined,
    releaseSavepoint: async () => undefined,
    rollbackToSavepoint: async () => undefined,
    rollbackTransaction: async () => undefined,
    savepoint: async () => undefined,
  };
  const database = new Kysely<WorkflowDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: db => new MysqlIntrospector(db),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
  });
  return { database, queries };
}
