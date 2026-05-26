import { describe, expect, it } from "vitest";
import {
  isSmartReplyPollTerminalGenerateStatus,
  mapJavaGeneralAnswer,
  mapJavaUserHistoryAnswerList,
  normalizeSmartReplyMsgIds,
} from "../../../src/modules/chat/smart-reply-mappers.js";

describe("normalizeSmartReplyMsgIds", () => {
  it("deduplicates numeric message ids for Java request body", () => {
    expect(normalizeSmartReplyMsgIds([1022692, 1022694, 1022692])).toEqual([
      1022692, 1022694,
    ]);
  });

  it("drops invalid numeric ids", () => {
    expect(normalizeSmartReplyMsgIds([0, -1, 1.5, 1022692])).toEqual([1022692]);
  });
});

describe("mapJavaUserHistoryAnswerList", () => {
  it("maps array payloads by analyseMsgId", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 1022692,
        assistantName: "护肤小助手",
        id: 88001,
        recommendAnswer: "您好，可以先告诉我肤质吗",
        status: 2,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "护肤小助手",
        content: "您好，可以先告诉我肤质吗",
        generateStatus: 2,
        messageId: "1022692",
        pollComplete: true,
        status: "ready",
        recordId: "88001",
      },
    ]);
  });

  it("maps SCRM user-history-answer-list payloads", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 1121,
        assistantName: "名字超长的ai助手名字超长的ai助手名字",
        recommendAnswer: "您好，请问您具体是遇到了什么问题呢",
        status: 2,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "名字超长的ai助手名字超长的ai助手名字",
        content: "您好，请问您具体是遇到了什么问题呢",
        generateStatus: 2,
        messageId: "1121",
        pollComplete: true,
        status: "ready",
      },
    ]);
  });

  it("marks failed and sent statuses as poll complete", () => {
    expect(
      mapJavaUserHistoryAnswerList([
        {
          analyseMsgId: 2001,
          assistantName: "护肤小助手",
          failReason: "生成失败",
          status: 3,
        },
        {
          analyseMsgId: 2003,
          assistantName: "护肤小助手",
          failReason: "knowledge_miss",
          status: 3,
        },
        {
          analyseMsgId: 2002,
          assistantName: "护肤小助手",
          recommendAnswer: "已发送的话术",
          status: 4,
        },
      ]).suggestions,
    ).toEqual([
      {
        assistantName: "护肤小助手",
        content: "",
        failReason: "生成失败",
        generateStatus: 3,
        messageId: "2001",
        pollComplete: true,
        status: undefined,
      },
      {
        assistantName: "护肤小助手",
        content: "",
        failReason: "knowledge_miss",
        generateStatus: 3,
        messageId: "2003",
        pollComplete: true,
        status: undefined,
      },
      {
        assistantName: "护肤小助手",
        content: "已发送的话术",
        generateStatus: 4,
        messageId: "2002",
        pollComplete: true,
        status: "ready",
      },
    ]);
  });

  it("detects terminal generate statuses", () => {
    expect(isSmartReplyPollTerminalGenerateStatus(2)).toBe(true);
    expect(isSmartReplyPollTerminalGenerateStatus(3)).toBe(true);
    expect(isSmartReplyPollTerminalGenerateStatus(4)).toBe(true);
    expect(isSmartReplyPollTerminalGenerateStatus(1)).toBe(false);
  });

  it("maps nested list payloads and thinking status", () => {
    const response = mapJavaUserHistoryAnswerList({
      list: [
        {
          analyseMsgId: 1002,
          assistantName: "客服助手",
          status: 0,
        },
      ],
    });

    expect(response.suggestions).toEqual([
      {
        assistantName: "客服助手",
        content: "",
        generateStatus: 0,
        messageId: "1002",
        status: "thinking",
      },
    ]);
  });

  it("maps single general-answer payloads", () => {
    expect(
      mapJavaGeneralAnswer({
        analyseMsgId: 1121,
        assistantName: "护肤小助手",
        recommendAnswer: "您好",
        status: 2,
      }),
    ).toEqual({
      assistantName: "护肤小助手",
      content: "您好",
      generateStatus: 2,
      messageId: "1121",
      pollComplete: true,
      status: "ready",
    });
  });

  it("parses comma-separated refAttachIds", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 1121,
        assistantName: "护肤小助手",
        recommendAnswer: "您好",
        refAttachIds: "101, 102",
        status: 2,
      },
    ]);

    expect(response.suggestions[0]?.refAttachIds).toEqual(["101", "102"]);
  });
});
