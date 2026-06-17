import { QUICK_REPLY_SCOPE_TYPE } from "@chatai/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_REPLY_IMPORT_HEADERS,
  QUICK_REPLY_IMPORT_TEMPLATE_URL,
  assignQuickReplyImportColors,
  buildQuickReplyCategoryEnsureRequest,
  buildQuickReplyImportFailureDisplay,
  buildQuickReplyImportPrecheckFromRows,
  chunkQuickReplyImportItems,
  downloadQuickReplyImportTemplate,
} from "@/pages/chat/components/quick-reply/quick-reply-import";

describe("quick reply import", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the fixed CDN import template", () => {
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        tagName,
      ) as HTMLAnchorElement;
      if (tagName === "a") {
        element.click = click;
      }
      return element;
    });

    downloadQuickReplyImportTemplate();

    expect(appendChild).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
    expect(click).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));

    const link = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(link.href).toBe(QUICK_REPLY_IMPORT_TEMPLATE_URL);
    expect(link.download).toBe("快捷话术导入模板.xlsx");
    expect(link.target).toBe("_blank");
  });

  it("parses strict template rows and reports summary", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        [...QUICK_REPLY_IMPORT_HEADERS],
        ["售前", "开场", "欢迎", "您好"],
        ["售前", "开场", "欢迎", "请问有什么可以帮您"],
      ],
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      creatableQuickReplyCount: 2,
      distinctPrimaryCategoryCount: 1,
      distinctSecondaryCategoryCount: 1,
      errorCount: 0,
    });
  });

  it("trims template header cells before validation", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        QUICK_REPLY_IMPORT_HEADERS.map((header) => ` ${header} `),
        ["售前", "开场", "欢迎", "您好"],
      ],
    );

    expect(result.ok).toBe(true);
  });

  it("reports distinct categories from the file", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        [...QUICK_REPLY_IMPORT_HEADERS],
        ["售前", "报价", "欢迎", "您好"],
        ["售前", "报价", "报价", "这是报价"],
        ["售后", "物流", "发货", "您的订单会尽快安排发出"],
      ],
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      distinctPrimaryCategoryCount: 2,
      distinctSecondaryCategoryCount: 2,
    });
  });

  it("rejects non-exact headers and blank rows", () => {
    const result = buildQuickReplyImportPrecheckFromRows(
      [
        ["分类", "话术分组", "话术标题", "话术内容"],
        ["", "", "", ""],
      ],
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { rowNumber: 1, message: "表头必须完全等于模板" },
      { rowNumber: 2, message: "整行不能为空" },
    ]);
  });

  it("assigns colors by secondary category and label first appearance", () => {
    const rows = [
      {
        contentText: "您好",
        labelText: "欢迎",
        primaryCategory: "售前",
        rowNumber: 2,
        secondaryCategory: "开场",
      },
      {
        contentText: "再次您好",
        labelText: "欢迎",
        primaryCategory: "售前",
        rowNumber: 3,
        secondaryCategory: "开场",
      },
      {
        contentText: "发货说明",
        labelText: "欢迎",
        primaryCategory: "售前",
        rowNumber: 4,
        secondaryCategory: "发货",
      },
    ];

    expect(assignQuickReplyImportColors(rows).map((item) => item.labelColor)).toEqual([
      "orange",
      "orange",
      "orange",
    ]);
  });

  it("builds category ensure request and 100-item chunks", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      contentText: `内容${index}`,
      labelText: "",
      primaryCategory: "售前",
      rowNumber: index + 2,
      secondaryCategory: index === 100 ? "发货" : "开场",
    }));

    expect(
      buildQuickReplyCategoryEnsureRequest(
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        rows,
      ),
    ).toEqual({
      categories: [{ children: ["开场", "发货"], title: "售前" }],
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    });
    expect(chunkQuickReplyImportItems(rows, 100)).toHaveLength(2);
  });

  it("builds import failure display for partial success and backend errors", () => {
    expect(
      buildQuickReplyImportFailureDisplay({
        errorMsg: "导入数据有误",
        errors: [{ message: "请选择二级分类", rowNumber: 102 }],
        importedCount: 100,
        ok: false,
      }),
    ).toEqual({
      summary: "导入中断，已成功导入 100 条，请检查后重试",
      errors: [{ message: "请选择二级分类", rowNumber: 102 }],
    });
  });

  it("builds import failure display for category ensure errors", () => {
    expect(
      buildQuickReplyImportFailureDisplay({
        errorMsg: "一级分类数量已达上限",
        errors: [{ message: "一级分类数量已达上限", rowNumber: 0 }],
        importedCount: 0,
        ok: false,
      }),
    ).toEqual({
      summary: "一级分类数量已达上限",
      errors: [],
    });
  });

  it("builds import failure display for network errors", () => {
    expect(
      buildQuickReplyImportFailureDisplay({
        errorMsg: "网络异常，请重试",
        errors: [],
        importedCount: 0,
        ok: false,
      }),
    ).toEqual({
      summary: "网络异常，请重试",
      errors: [],
    });
  });
});
