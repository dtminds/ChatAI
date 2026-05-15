import { describe, expect, it, vi } from "vitest";
import type { MessageRow } from "../../../src/modules/chat/workbench-mappers.js";
import { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

function createFailingDb() {
  return {
    selectFrom() {
      throw new Error("database should not be queried for invalid ids");
    },
  };
}

function createMessagesDb(rows: MessageRow[], quoteRows: MessageRow[] = []) {
  const messageQueries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];

  return {
    messageQueries,
    selectFrom(table: string) {
      if (table === "xy_wap_embed_conversation as conversation") {
        return createQueryBuilder({
          conversation_external_id: "external-1",
          conversation_group_id: "",
          conversation_id: 88,
          chat_type: 1,
          platform: 5,
          seat_id: 12,
          third_userid: "seat-third-user-1",
          uid: 9001,
        });
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        const queryIndex = messageQueries.filter((query) => query.table === table).length;
        const query = createQueryBuilder(queryIndex === 0 ? rows : quoteRows);
        messageQueries.push({ table, wheres: query.wheres });
        return query;
      }

      if (
        table === "xy_wap_embed_group_member as member" ||
        table === "xy_wap_embed_user_seat" ||
        table === "xy_wap_embed_contact"
      ) {
        return createQueryBuilder([]);
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createQueryBuilder(result: unknown) {
  let currentResult = result;
  const wheres: Array<[string, string, unknown]> = [];

  return {
    wheres,
    innerJoin() {
      return this;
    },
    limit() {
      return this;
    },
    orderBy() {
      return this;
    },
    select(selection?: unknown) {
      if (typeof selection === "function") {
        currentResult = Array.isArray(currentResult)
          ? currentResult.map((item) => ({ ...item, seat_unread_count: 6 }))
          : { ...(currentResult as object), seat_unread_count: 6 };
      }

      return this;
    },
    where(column: string, operator: string, value: unknown) {
      wheres.push([column, operator, value]);
      return this;
    },
    execute() {
      return Promise.resolve(Array.isArray(currentResult) ? currentResult : [currentResult]);
    },
    executeTakeFirst() {
      return Promise.resolve(Array.isArray(currentResult) ? currentResult[0] : currentResult);
    },
  };
}

describe("WorkbenchRepository", () => {
  it("does not send NaN to MySQL when subUserId is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSubUser("sub-user-001")).resolves.toBeUndefined();
    await expect(repository.listSeats("sub-user-001")).resolves.toEqual([]);
    await expect(repository.canAccessSeat("sub-user-001", "1")).resolves.toBe(false);
  });

  it("does not send NaN to MySQL when route ids are invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSeat("not-a-seat")).resolves.toBeUndefined();
    await expect(repository.getSeat("1e2")).resolves.toBeUndefined();
    await expect(repository.getSeat("1.2")).resolves.toBeUndefined();
    await expect(repository.getSeat(" 1")).resolves.toBeUndefined();
    await expect(repository.listConversations("not-a-seat")).resolves.toEqual([]);
    await expect(
      repository.getConversationLookup("not-a-conversation"),
    ).resolves.toBeUndefined();
    await expect(
      repository.listMessages("not-a-conversation", { limit: 30 }),
    ).resolves.toEqual({
      filteredCount: 0,
      hasMore: false,
      messages: [],
      scannedCount: 0,
    });
    await expect(repository.listGroupMembers("not-a-conversation")).resolves.toBeUndefined();
    await expect(repository.canAccessSeat("1", "not-a-seat")).resolves.toBe(false);
  });

  it("does not update pinned state when the conversation id is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.updateConversationPinned({
        conversationId: "not-a-conversation",
        isPinned: true,
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not update seat host when the seat or sub-user id is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.updateSeatHostSubUser({
        platform: 5,
        seatId: "not-a-seat",
        subUserId: "101",
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.updateSeatHostSubUser({
        platform: 5,
        seatId: "12",
        subUserId: "not-a-sub-user",
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("updates seat host sub-user in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_user_seat");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateSeatHostSubUser({
      platform: 5,
      seatId: "12",
      subUserId: "101",
      uid: 9001,
    });

    expect(updates).toEqual([{ host_sub_id: 101 }]);
    expect(wheres).toEqual([
      ["id", "=", 12],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
  });

  it("returns conversation tenant scope and takeover sub-user for Java write operations", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          return createQueryBuilder({
            id: 88,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 6,
            third_external_userid: "external-001",
            third_group_id: null,
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 2,
          });
        },
      } as never,
    );

    await expect(repository.getConversationLookup("88")).resolves.toEqual({
      id: "88",
      platform: 5,
      seatHostSubUserId: "101",
      seatId: "12",
      seatUnreadCount: 6,
      thirdExternalUserId: "external-001",
      thirdGroupId: undefined,
      thirdUserId: "seat-user-001",
      uid: 9001,
      unreadCount: 2,
    });
  });

  it("reads quote content base64 from audit extend origin data", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info_extend");
          const result = {
            origin_data: JSON.stringify({
              quote_content_base64: " base64-quote-content ",
            }),
          };
          const query = createQueryBuilder(result);
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.getQuoteContentBase64({
        messageId: "remote-msg-538",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBe("base64-quote-content");

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info_extend",
      wheres: [
        ["msgid", "=", "remote-msg-538"],
        ["platform", "=", 5],
        ["uid", "=", 9001],
      ],
    });
  });

  it("reads message file transfer status by audit id in tenant scope", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info");
          const query = createQueryBuilder({
            content: JSON.stringify({
              downloadStatus: "finished",
              fileSerialNo: "serial-file-001",
              fileUrlExpireTime: 1778919538036,
              fileUrl: "chat-files/quote.pdf",
            }),
          });
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.getMessageFileDownloadStatus({
        auditId: 321,
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toEqual({
      downloadStatus: "finished",
      fileSerialNo: "serial-file-001",
      fileUrlExpireTime: 1778919538036,
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info",
      wheres: [
        ["id", "=", 321],
        ["uid", "=", 9001],
        ["platform", "=", 5],
      ],
    });
  });

  it("calculates seat unread after mark-read with a lightweight aggregate query", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return createQueryBuilder({
            unread_count: 5,
          });
        },
      } as never,
    );

    await expect(
      repository.getSeatUnreadCountAfterMarkRead({
        conversationId: "88",
        platform: 5,
        seatId: "12",
        uid: 9001,
      }),
    ).resolves.toBe(5);
  });

  it("updates conversation pinned time in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_778_564_899_123);
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateConversationPinned({
      conversationId: "88",
      isPinned: true,
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ pinned_time: 1_778_564_899 }]);
    expect(wheres).toEqual([
      ["id", "=", 88],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
    nowSpy.mockRestore();
  });

  it("clears conversation pinned time in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable() {
          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where() {
              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateConversationPinned({
      conversationId: "88",
      isPinned: false,
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ pinned_time: 0 }]);
  });

  it("hides a conversation in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.hideConversation({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ biz_status: 0 }]);
    expect(wheres).toEqual([
      ["id", "=", 88],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
  });

  it("ignores nullable third-party ids when collecting message hydration sources", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);
    const sources = await (
      repository as unknown as {
        getMessageHydrationSources: (
          rows: Array<{
            chat_type: number;
            conversation_external_id: string | null | undefined;
            conversation_group_id: string | null | undefined;
            from_type: number | null;
            third_external_id: string | null | undefined;
            third_from_id: string | null | undefined;
            third_group_id: string | null | undefined;
            third_user_id: string | null | undefined;
          }>,
          uid: number,
          platform: number,
        ) => Promise<{
          contactsByThirdExternalId: Map<string, unknown>;
          groupMembersByGroupAndThirdUserId: Map<string, unknown>;
          seatsByThirdUserId: Map<string, unknown>;
        }>;
      }
    ).getMessageHydrationSources(
      [
        {
          chat_type: 2,
          conversation_external_id: undefined,
          conversation_group_id: undefined,
          from_type: 2,
          third_external_id: null,
          third_from_id: null,
          third_group_id: undefined,
          third_user_id: undefined,
        },
        {
          chat_type: 1,
          conversation_external_id: undefined,
          conversation_group_id: undefined,
          from_type: 2,
          third_external_id: null,
          third_from_id: undefined,
          third_group_id: undefined,
          third_user_id: null,
        },
      ],
      9001,
      5,
    );

    expect(sources.contactsByThirdExternalId.size).toBe(0);
    expect(sources.groupMembersByGroupAndThirdUserId.size).toBe(0);
    expect(sources.seatsByThirdUserId.size).toBe(0);
  });

  it("hides revoke event rows before mapping database messages", async () => {
    const repository = new WorkbenchRepository(createMessagesDb([
      messageRow({
        content: JSON.stringify({ type: "revoke", revokeMsgId: "516" }),
        id: 103,
        msgid: "remote-msg-103",
        msgtype: "system",
      }),
      messageRow({
        content: JSON.stringify({ revokeMsgId: "515" }),
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "revoke",
      }),
      messageRow({
        content: JSON.stringify({ text: "visible" }),
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "text",
      }),
    ]) as never);

    await expect(repository.listMessages("88", { limit: 3 })).resolves.toMatchObject({
      filteredCount: 2,
      messages: [
        {
          content: { text: "visible" },
          messageId: "remote-msg-101",
        },
      ],
      nextBeforeSeq: 101,
      scannedCount: 3,
    });
  });

  it("hydrates quote previews from current page rows without an extra quote query", async () => {
    const db = createMessagesDb([
      messageRow({
        content: JSON.stringify({
          content: "正式引用消息",
          quoteMsgId: 101,
        }),
        from_type: 1,
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "quote",
      }),
      messageRow({
        content: JSON.stringify({ text: "测试被引用" }),
        from_type: 2,
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "text",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 2 })).resolves.toMatchObject({
      messages: [
        {
          content: { text: "测试被引用" },
          messageId: "remote-msg-101",
        },
        {
          content: {
            quotedMessage: {
              contentType: "text",
              senderName: "external-1",
              text: "测试被引用",
            },
            quoteMsgId: "101",
            text: "正式引用消息",
          },
          contentType: "quote",
          messageId: "remote-msg-102",
        },
      ],
    });
    expect(db.messageQueries).toHaveLength(1);
  });

  it("fetches missing quoted rows in one scoped query and normalizes previews", async () => {
    const db = createMessagesDb(
      [
        messageRow({
          content: JSON.stringify({
            content: "引用图片",
            quoteMsgId: 201,
          }),
          from_type: 1,
          id: 103,
          msgid: "remote-msg-103",
          msgtype: "quote",
        }),
        messageRow({
          content: JSON.stringify({
            content: "引用名片",
            quoteMsgId: 202,
          }),
          from_type: 1,
          id: 102,
          msgid: "remote-msg-102",
          msgtype: "quote",
        }),
      ],
      [
        messageRow({
          content: JSON.stringify({ fileUrl: "media/quote-image.jpg" }),
          from_type: 2,
          id: 201,
          msgid: "remote-msg-201",
          msgtype: "image",
        }),
        messageRow({
          content: JSON.stringify({
            avatar: "https://example.com/avatar.png",
            name: "binarywang",
          }),
          from_type: 2,
          id: 202,
          msgid: "remote-msg-202",
          msgtype: "card",
        }),
      ],
    );
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 2 })).resolves.toMatchObject({
      messages: [
        {
          content: {
            quotedMessage: {
              contentType: "contact-card",
              imageUrl: "https://example.com/avatar.png",
              senderName: "external-1",
              title: "binarywang",
            },
            quoteMsgId: "202",
            text: "引用名片",
          },
        },
        {
          content: {
            quotedMessage: {
              contentType: "image",
              imageUrl: "https://b5.bokr.com.cn/media/quote-image.jpg",
              senderName: "external-1",
            },
            quoteMsgId: "201",
            text: "引用图片",
          },
        },
      ],
    });

    expect(db.messageQueries).toHaveLength(2);
    expect(
      [...((db.messageQueries[1]?.wheres.find(
        ([column, operator]) => column === "message.id" && operator === "in",
      )?.[2] as number[]) ?? [])].sort(),
    ).toEqual([201, 202]);
    expect(db.messageQueries[1]?.wheres).toContainEqual(["message.uid", "=", 9001]);
    expect(db.messageQueries[1]?.wheres).toContainEqual(["message.platform", "=", 5]);
    expect(db.messageQueries[1]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "seat-third-user-1",
    ]);
    expect(db.messageQueries[1]?.wheres).toContainEqual([
      "message.third_external_id",
      "=",
      "external-1",
    ]);
  });
});

function messageRow(overrides: Partial<MessageRow>): MessageRow {
  return {
    chat_type: 1,
    content: null,
    conversation_external_id: "external-1",
    conversation_group_id: "",
    conversation_id: 88,
    from_type: 3,
    id: 101,
    msgid: "remote-msg-101",
    msgtime: 1778240200000,
    msgtype: "text",
    seat_id: 12,
    third_external_id: "external-1",
    third_from_id: "",
    third_group_id: "",
    third_user_id: "seat-third-user-1",
    ...overrides,
  };
}
