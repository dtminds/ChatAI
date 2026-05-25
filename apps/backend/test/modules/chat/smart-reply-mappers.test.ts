import { describe, expect, it } from "vitest";
import {
  mapJavaUserHistoryAnswerList,
  normalizeSmartReplyMsgIds,
  parseSmartReplyJavaMsgIds,
  summarizeJavaUserHistoryAnswerRawData,
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

describe("parseSmartReplyJavaMsgIds", () => {
  it("parses legacy string message ids", () => {
    expect(parseSmartReplyJavaMsgIds(["1022692", "msg-001"])).toEqual([1022692]);
  });
});

describe("summarizeJavaUserHistoryAnswerRawData", () => {
  it("summarizes empty array payloads from Java", () => {
    expect(summarizeJavaUserHistoryAnswerRawData([])).toEqual({
      dataType: "array",
      itemCount: 0,
      objectKeys: undefined,
      preview: [],
    });
  });
});

describe("mapJavaUserHistoryAnswerList", () => {
  it("maps array payloads by msgId", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        answerContent: "您好，可以先告诉我肤质吗",
        answerStatus: 2,
        assistantName: "护肤小助手",
        msgId: "msg-001",
        versionCount: 3,
        versionIndex: 1,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "护肤小助手",
        content: "您好，可以先告诉我肤质吗",
        messageId: "msg-001",
        status: "ready",
        versionCount: 3,
        versionIndex: 1,
      },
    ]);
  });

  it("maps numeric msgId from Java payloads", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        answerContent: "您好",
        answerStatus: 2,
        assistantName: "护肤小助手",
        msgId: 1022692,
        versionCount: 1,
        versionIndex: 0,
      },
    ]);

    expect(response.suggestions[0]?.messageId).toBe("1022692");
  });

  it("maps SCRM user-history-answer-list payloads with analyseMsgId", () => {
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
        messageId: "1121",
        status: "ready",
        versionCount: 1,
        versionIndex: 0,
      },
    ]);
  });

  it("maps nested list payloads and thinking status", () => {
    const response = mapJavaUserHistoryAnswerList({
      list: [
        {
          answerStatus: 0,
          botName: "客服助手",
          msgid: "msg-002",
        },
      ],
    });

    expect(response.suggestions).toEqual([
      {
        assistantName: "客服助手",
        content: "",
        messageId: "msg-002",
        status: "thinking",
        versionCount: 1,
        versionIndex: 0,
      },
    ]);
  });
});
