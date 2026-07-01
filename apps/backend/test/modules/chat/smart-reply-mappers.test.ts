import { describe, expect, it } from "vitest";
import {
  buildJavaGenAnswerFromText,
  isSmartReplyPollTerminalGenerateStatus,
  mapJavaGeneralAnswer,
  mapJavaUserHistoryAnswerList,
  normalizeSmartReplyMsgIds,
  parseJavaGenAnswerContent,
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

describe("parseJavaGenAnswerContent", () => {
  it("extracts text from genAnswer message segment json", () => {
    expect(
      parseJavaGenAnswerContent(
        '[{"msgtype":"text","text":"麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~"}]',
      ),
    ).toBe(
      "麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~",
    );
  });

  it("joins multiple text segments with newline", () => {
    expect(
      parseJavaGenAnswerContent(
        '[{"msgtype":"text","text":"第一段"},{"msgtype":"text","text":"第二段"}]',
      ),
    ).toBe("第一段\n第二段");
  });

  it("excludes image segments from display content", () => {
    expect(
      parseJavaGenAnswerContent(
        '[{"msgtype":"text","text":"第一段"},{"msgtype":"image","alt":"推荐图"}]',
      ),
    ).toBe("第一段");
  });

  it("returns plain text unchanged", () => {
    expect(parseJavaGenAnswerContent("您好，可以先告诉我肤质吗")).toBe(
      "您好，可以先告诉我肤质吗",
    );
  });

  it("returns invalid json string unchanged", () => {
    expect(parseJavaGenAnswerContent("[not-json")).toBe("[not-json");
  });
});

describe("mapJavaUserHistoryAnswerList", () => {
  it("parses genAnswer json segments into display content", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 2395,
        assistantName: "护肤小助手",
        genAnswer:
          '[{"msgtype":"text","text":"麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~"}]',
        genStatus: 2,
        id: 88001,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "护肤小助手",
        content:
          "麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~",
        genAnswer:
          '[{"msgtype":"text","text":"麻烦您告知一下所在的城市，还有家里宠物的具体情况哦，我会给您介绍合适的上门服务哒~"}]',
        generateStatus: 2,
        messageId: "2395",
        pollComplete: true,
        status: "ready",
        recordId: "88001",
      },
    ]);
  });

  it("maps wap-embed-agent-answer-record payloads by gen* fields", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 2395,
        assistantName: "护肤小助手",
        genAnswer: "您好，可以先告诉我肤质吗",
        genStatus: 2,
        id: 88001,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "护肤小助手",
        content: "您好，可以先告诉我肤质吗",
        genAnswer: "您好，可以先告诉我肤质吗",
        generateStatus: 2,
        messageId: "2395",
        pollComplete: true,
        status: "ready",
        recordId: "88001",
      },
    ]);
  });

  it("maps genFailReason when genStatus is failed", () => {
    expect(
      mapJavaUserHistoryAnswerList([
        {
          analyseMsgId: 2001,
          assistantName: "护肤小助手",
          genFailReason: "生成失败",
          genStatus: 3,
        },
        {
          analyseMsgId: 2003,
          assistantName: "护肤小助手",
          genFailReason: "knowledge_miss",
          genStatus: 3,
        },
        {
          analyseMsgId: 2002,
          assistantName: "护肤小助手",
          genAnswer: "已转人工的话术",
          genStatus: 4,
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
        content: "已转人工的话术",
        genAnswer: "已转人工的话术",
        generateStatus: 4,
        messageId: "2002",
        pollComplete: true,
        status: undefined,
      },
    ]);
  });

  it("maps initialization and generating statuses", () => {
    expect(
      mapJavaUserHistoryAnswerList([
        {
          analyseMsgId: 1002,
          assistantName: "客服助手",
          genStatus: 0,
        },
        {
          analyseMsgId: 1003,
          assistantName: "客服助手",
          genStatus: 1,
        },
      ]).suggestions,
    ).toEqual([
      {
        assistantName: "客服助手",
        content: "",
        generateStatus: 0,
        messageId: "1002",
        status: "thinking",
      },
      {
        assistantName: "客服助手",
        content: "",
        generateStatus: 1,
        messageId: "1003",
        status: "processing",
      },
    ]);
  });

  it("falls back to legacy recommendAnswer/status fields", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 1121,
        assistantName: "护肤小助手",
        recommendAnswer: "您好，请问您具体是遇到了什么问题呢",
        status: 2,
      },
    ]);

    expect(response.suggestions).toEqual([
      {
        assistantName: "护肤小助手",
        content: "您好，请问您具体是遇到了什么问题呢",
        genAnswer: buildJavaGenAnswerFromText("您好，请问您具体是遇到了什么问题呢"),
        generateStatus: 2,
        messageId: "1121",
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

  it("maps nested list payloads", () => {
    const response = mapJavaUserHistoryAnswerList({
      list: [
        {
          analyseMsgId: 1002,
          assistantName: "客服助手",
          genStatus: 0,
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
        genAnswer: "您好",
        genStatus: 2,
      }),
    ).toEqual({
      assistantName: "护肤小助手",
      content: "您好",
      genAnswer: "您好",
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
        genAnswer: "您好",
        genStatus: 2,
        refAttachIds: "101, 102",
      },
    ]);

    expect(response.suggestions[0]?.refAttachIds).toEqual(["101", "102"]);
  });

  it("parses array refAttachIds and genAnswer image ids", () => {
    const response = mapJavaUserHistoryAnswerList([
      {
        analyseMsgId: 1121,
        assistantName: "护肤小助手",
        genAnswer:
          '[{"msgtype":"text","text":"第一段"},{"msgtype":"image","id":103,"fileUrl":"s5/msg/cover.png"}]',
        genStatus: 2,
        refAttachIds: [101, "102"],
      },
    ]);

    expect(response.suggestions[0]?.refAttachIds).toEqual(["101", "102", "103"]);
  });
});
