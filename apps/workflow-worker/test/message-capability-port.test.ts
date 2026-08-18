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
import type { WorkflowMessageCommand } from "@chatai/contracts";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import {
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

  it("prefers an active customer binding and sends ordered messages with stable child keys", async () => {
    const { database, queries } = createRecordingDatabase((query) => {
      if (query.sql.includes("xy_wap_embed_user_seat")) {
        return {
          rows: [
            seatRow(101, "work-user-1", "2026-08-01T00:00:00.000Z"),
            seatRow(102, "work-user-2", "2026-08-02T00:00:00.000Z"),
          ],
        };
      }
      return {
        rows: [{
          add_time: 1_786_000_000,
          id: 501,
          platform: 5,
          third_userid: "work-user-2",
        }],
      };
    });
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
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      token: "internal-token",
      uid: 9,
    })).resolves.toEqual({});

    expect(queries).toHaveLength(2);
    expect(queries[0]?.sql).toContain("`id` in (?, ?)");
    expect(queries[0]?.parameters).toEqual(expect.arrayContaining([9, 101, 102, 1]));
    expect(queries[1]?.sql).toContain("`third_external_userid` = ?");
    expect(queries[1]?.parameters).toEqual(expect.arrayContaining([
      9,
      5,
      "customer-1",
      "work-user-1",
      "work-user-2",
      1,
    ]));
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
        source: 3,
        thirdExternalUserid: "customer-1",
        thirdUserId: "work-user-2",
        uid: 9,
      },
      {
        msgData: { fileUrl: "https://cdn.example.com/image.png", msgtype: "image" },
        platform: 5,
        sendType: 1,
        source: 3,
        thirdExternalUserid: "customer-1",
        thirdUserId: "work-user-2",
        uid: 9,
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer internal-token",
    });
  });

  it("uses the configured account order when no selected account has a customer binding", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? {
          rows: [
            seatRow(101, "work-user-1", "2026-08-01T00:00:00.000Z"),
            seatRow(102, "work-user-2", "2026-08-02T00:00:00.000Z"),
          ],
        }
      : { rows: [] });

    await expect(resolveWorkflowMessageSeat(database, {
      seatIds: [101, 102],
      strategy: "latest-added",
      subjectId: "customer-1",
      uid: 9,
    })).resolves.toMatchObject({ id: 102, thirdUserId: "work-user-2" });
  });

  it("classifies Java business rejection as terminal and service failure as retryable", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [seatRow(101, "work-user-1", "2026-08-01T00:00:00.000Z")] }
      : { rows: [] });
    const baseInput = {
      baseUrl: "https://java.example.com",
      command: messageCommand({ content: "欢迎咨询" }),
      idempotencyKey: "9:run-1:message-1:2",
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      token: null,
      uid: 9,
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
  });
});

function messageCommand(overrides: Partial<WorkflowMessageCommand> = {}): WorkflowMessageCommand {
  return {
    accountSelection: { seatIds: [101, 102], strategy: "earliest-added" },
    attachments: [],
    content: "",
    recipient: { thirdExternalUserId: "customer-1" },
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

function seatRow(id: number, thirdUserId: string, createdAt: string) {
  return {
    biz_status: 1,
    create_time: new Date(createdAt),
    id,
    platform: 5,
    third_userid: thirdUserId,
  };
}

function javaResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: 0, success: true, ...body }), {
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
