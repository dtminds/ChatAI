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
import {
  WORKBENCH_MESSAGE_SOURCE,
  type WorkflowMessageCommand,
} from "@chatai/contracts";
import {
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import {
  MysqlWorkflowMessageCapabilityPort,
  buildWorkflowJavaMessages,
  executeWorkflowMessage,
  resolveWorkflowMessageSeat,
} from "../src/message-capability-port.js";

describe("Workflow Message capability port", () => {
  it("maps text and every supported attachment to the existing Java message contract", () => {
    expect(buildWorkflowJavaMessages(messageCommand({
      attachments: [
        attachment("image", { fileUrl: "https://cdn.example.com/image.png" }),
        attachment("file", {
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        attachment("h5", {
          coverUrl: "https://cdn.example.com/cover.png",
          desc: "活动介绍",
          href: "https://example.com/campaign",
          title: "本周活动",
        }),
        attachment("weapp", {}, "301"),
        attachment("sphfeed", {}, "302"),
      ],
      content: "欢迎咨询",
    }))).toEqual([
      { msgtype: "text", text: "欢迎咨询" },
      { fileUrl: "https://cdn.example.com/image.png", msgtype: "image" },
      {
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/quote.pdf",
        msgtype: "file",
      },
      {
        coverUrl: "https://cdn.example.com/cover.png",
        desc: "活动介绍",
        href: "https://example.com/campaign",
        msgtype: "link",
        title: "本周活动",
      },
      { msgtype: "weapp", transMsgInfoId: 301 },
      { msgtype: "sphfeed", transMsgInfoId: 302 },
    ]);
  });

  it("uses the Run-frozen seat and sends ordered messages with stable child keys", async () => {
    const { database, queries } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const fetchMock = vi.fn(async () => javaResponse({ data: { optNo: "opt-1" } }));

    await expect(executeWorkflowMessage(database, {
      baseUrl: "https://java.example.com",
      command: messageCommand({
        attachments: [attachment("image", {
          fileUrl: "https://cdn.example.com/image.png",
        })],
        content: "欢迎咨询",
      }),
      fetch: fetchMock as typeof fetch,
      idempotencyKey: "9:run-1:message-1:2",
      signal: new AbortController().signal,
      token: "internal-token",
      uid: 9,
      workflowId: "31",
    })).resolves.toEqual({});

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).not.toContain("biz_status");
    expect(queries[0]?.sql).not.toContain("customer_bind_relation");
    expect(queries[0]?.sql).toContain("`id` = ?");
    expect(queries[0]?.parameters).toEqual([9, 101]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://java.example.com/third-internal/wap-embed/conversation/send-message?idempotentKey=9%3Arun-1%3Amessage-1%3A2%3A0",
      "https://java.example.com/third-internal/wap-embed/conversation/send-message?idempotentKey=9%3Arun-1%3Amessage-1%3A2%3A1",
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      {
        msgData: { msgtype: "text", text: "欢迎咨询" },
        platform: 5,
        sendType: 1,
        source: WORKBENCH_MESSAGE_SOURCE.WORKFLOW,
        sourceId: "31",
        thirdExternalUserid: "customer-1",
        thirdUserId: "work-user-1",
        uid: 9,
      },
      {
        msgData: { fileUrl: "https://cdn.example.com/image.png", msgtype: "image" },
        platform: 5,
        sendType: 1,
        source: WORKBENCH_MESSAGE_SOURCE.WORKFLOW,
        sourceId: "31",
        thirdExternalUserid: "customer-1",
        thirdUserId: "work-user-1",
        uid: 9,
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer internal-token",
    });
  });

  it("uses the prepared command recipient instead of the Run subject", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const fetchMock = vi.fn(async () => javaResponse({ data: { optNo: "opt-1" } }));
    const port = new MysqlWorkflowMessageCapabilityPort(database, {
      baseUrl: "https://java.example.com",
      fetch: fetchMock as typeof fetch,
    });

    await expect(port.execute(WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition, {
      command: messageCommand({ content: "欢迎咨询" }),
      deadlineAt: new Date("2026-08-20T08:00:00.000Z"),
      execution: {
        nodeId: "message-1",
        revision: 1,
        runId: "run-1",
        sequence: 2,
        workflowId: "workflow-1",
      },
      identities: { thirdExternalUserId: "customer-1" },
      idempotencyKey: "9:run-1:message-1:2",
      signal: new AbortController().signal,
      subjectId: "wecom-contact-101",
      subjectType: "wecom_contact",
      uid: 9,
    })).resolves.toEqual({});

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      source: WORKBENCH_MESSAGE_SOURCE.WORKFLOW,
      sourceId: "workflow-1",
      thirdExternalUserid: "customer-1",
    });
  });

  it("does not substitute another seat when the Run-frozen seat is unavailable", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));

    await expect(resolveWorkflowMessageSeat(database, {
      seatId: 101,
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_ACCOUNT_UNAVAILABLE",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.parameters).toEqual([9, 101]);
  });

  it("classifies Java business rejection as terminal and service failure as retryable", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const baseInput = {
      baseUrl: "https://java.example.com",
      command: messageCommand({ content: "欢迎咨询" }),
      idempotencyKey: "9:run-1:message-1:2",
      signal: new AbortController().signal,
      token: null,
      uid: 9,
      workflowId: "31",
    };

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => javaResponse({
        data: null,
        error: 40001,
        errorMsg: "客户关系不可用",
        success: false,
      })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_REJECTED",
      failureKind: "terminal",
      message: "执行所需数据不可用，流程已停止",
    });

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => javaResponse({
        data: { optNo: 123 },
        error: 0,
        success: false,
      })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_REJECTED",
      failureKind: "terminal",
    });

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
      failureKind: "retryable",
      message: "消息发送暂时失败",
    });

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => new Response(null, { status: 408 })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
      failureKind: "retryable",
    });

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => new Response(null, { status: 400 })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
      failureKind: "retryable",
    });

    await expect(executeWorkflowMessage(database, {
      ...baseInput,
      fetch: vi.fn(async () => new Response(null, { status: 201 })) as typeof fetch,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_SEND_UNAVAILABLE",
      failureKind: "retryable",
    });
  });

  it("treats invalid HTTP 200 responses as terminal contract failures", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [seatRow(101, "work-user-1")],
    }));
    const baseInput = {
      baseUrl: "https://java.example.com",
      command: messageCommand({ content: "欢迎咨询" }),
      idempotencyKey: "9:run-1:message-1:2",
      signal: new AbortController().signal,
      token: null,
      uid: 9,
      workflowId: "31",
    };
    const fetches: Array<typeof fetch> = [
      vi.fn(async () => new Response("not-json", { status: 200 })) as typeof fetch,
      vi.fn(async () => new Response(JSON.stringify({ data: { optNo: 123 } }), {
        status: 200,
      })) as typeof fetch,
      vi.fn(async () => javaResponse({ data: null })) as typeof fetch,
    ];

    for (const fetchImplementation of fetches) {
      await expect(executeWorkflowMessage(database, {
        ...baseInput,
        fetch: fetchImplementation,
      })).rejects.toMatchObject({
        code: "WORKFLOW_MESSAGE_RESPONSE_INVALID",
        failureKind: "terminal",
      });
    }
  });
});

function messageCommand(overrides: Partial<WorkflowMessageCommand> = {}): WorkflowMessageCommand {
  return {
    attachments: [],
    content: "",
    recipient: { thirdExternalUserId: "customer-1" },
    seatId: 101,
    source: "workflow",
    ...overrides,
  };
}

function attachment(
  type: WorkflowMessageCommand["attachments"][number]["type"],
  content: Record<string, unknown>,
  msgInfoId = "300",
): WorkflowMessageCommand["attachments"][number] {
  return {
    content,
    materialCollectionId: `material-${type}`,
    msgInfoId,
    type,
  };
}

function seatRow(id: number, thirdUserId: string) {
  return {
    id,
    platform: 5,
    third_userid: thirdUserId,
  };
}

function javaResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: 0, errorMsg: "", success: true, ...body }), {
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
