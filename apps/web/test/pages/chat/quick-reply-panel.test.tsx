import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSheet } from "read-excel-file/browser";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  QUICK_REPLY_SCOPE_TYPE,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import { mediaUploadMocks } from "./workbench-test-utils";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { QuickReplyFormDialog } from "@/pages/chat/components/quick-reply/quick-reply-form-dialog";
import { QuickReplyPanel } from "@/pages/chat/components/quick-reply/quick-reply-panel";
import { QUICK_REPLY_IMPORT_HEADERS } from "@/pages/chat/components/quick-reply/quick-reply-import";

vi.mock("read-excel-file/browser", () => ({
  readSheet: vi.fn().mockRejectedValue(new Error("invalid zip data")),
}));

const categories: WorkbenchQuickReplyCategoryDto[] = [
  {
    id: "cat-1",
    parentId: 0,
    scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    sort: 100,
    title: "售前",
  },
  {
    id: "cat-2",
    parentId: "cat-1",
    scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    sort: 90,
    title: "报价",
  },
  {
    id: "cat-3",
    parentId: "cat-1",
    scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    sort: 80,
    title: "致歉",
  },
  {
    id: "cat-4",
    parentId: 0,
    scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    sort: 70,
    title: "售后",
  },
  {
    id: "cat-5",
    parentId: "cat-4",
    scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    sort: 60,
    title: "物流",
  },
];

const quickReply: WorkbenchQuickReplyDto = {
  attachments: [
    {
      content: {
        href: "https://example.com/activity",
        title: "活动链接",
      },
      materialCollectionId: "material-h5-1",
      msgid: "msg-h5-1",
      type: "h5",
    },
  ],
  categoryId: "cat-2",
  contentText: "您好，这是报价信息",
  id: "reply-1",
  labelColor: "orange",
  labelText: "报价",
  scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
  sort: 100,
};

describe("QuickReplyPanel", () => {
  afterEach(() => {
    resetWorkbenchService();
    vi.mocked(readSheet).mockReset();
    vi.mocked(readSheet).mockRejectedValue(new Error("invalid zip data"));
  });

  it("selects a quick reply from the list", async () => {
    const user = userEvent.setup();
    const onSelectQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
        onSelectQuickReply={onSelectQuickReply}
      />,
    );

    await user.click(screen.getByText("您好，这是报价信息"));

    expect(onSelectQuickReply).toHaveBeenCalledWith(quickReply);
  });

  it("opens the quick reply import dialog from the toolbar", async () => {
    const user = userEvent.setup();
    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));

    expect(screen.getByRole("dialog", { name: "导入话术" })).toBeInTheDocument();
  });

  it("shows an import template download action in the import dialog", async () => {
    const user = userEvent.setup();
    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));

    expect(screen.getByText("上传文件：")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传文件" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "下载模板" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "关闭" })).toHaveLength(1);
    expect(screen.getByText("导入说明：")).toBeInTheDocument();
    expect(screen.getByText("请按照模板中要求的字段导入")).toBeInTheDocument();
    expect(
      screen.getByText("模板中要求必填的字段请务必填写完整，否则导入后无法使用"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("单次最多导入1000条话术，超过请拆分成多个文件分批导入"),
    ).toBeInTheDocument();
  });

  it("disables import submit when precheck has errors", async () => {
    const user = userEvent.setup();
    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));

    expect(screen.queryByText("请选择 .xlsx 文件")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
  });

  it("shows a precheck error when the selected xlsx cannot be parsed", async () => {
    const user = userEvent.setup();
    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["not a zip"], "bad.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(
      await screen.findByText("第 0 行：文件解析失败，请确认文件为标准 .xlsx"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新选择" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
  });

  it("accepts uppercase xlsx file extensions", async () => {
    const user = userEvent.setup();
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.XLSX", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("文件校验通过")).toBeInTheDocument();
    expect(screen.queryByText("第 0 行：仅支持 .xlsx 文件")).not.toBeInTheDocument();
  });

  it("renders precheck errors in a constrained scroll region", async () => {
    const user = userEvent.setup();
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ...Array.from({ length: 20 }, (_, index) => [
        "售前",
        "报价",
        `标题${index}`,
        "",
      ]),
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const errorList = await screen.findByLabelText("文件校验失败原因");

    expect(errorList).toBeInTheDocument();
    expect(errorList).toHaveClass("h-[min(240px,32vh)]");
    expect(screen.getByText("第 2 行：话术内容不能为空")).toBeInTheDocument();
    expect(screen.getByText("第 21 行：话术内容不能为空")).toBeInTheDocument();
  });

  it("shows import progress inside the precheck result panel", async () => {
    const user = userEvent.setup();
    const importGate = createDeferred<{ importedCount: number; ok: true }>();
    const onImportQuickReplies = vi.fn(async (_, onProgress) => {
      onProgress({ importedCount: 0, progress: 35, totalCount: 1 });
      return importGate.promise;
    });
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps({ onImportQuickReplies })} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("文件校验通过")).toBeInTheDocument();
    expect(screen.queryByText("上传文件：")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下载模板" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始导入" }));

    const resultPanel = screen.getByRole("region", { name: "文件校验结果" });
    expect(within(resultPanel).getByText("正在导入 35%")).toBeInTheDocument();

    importGate.resolve({ importedCount: 1, ok: true });
    expect(await screen.findByText("导入完成")).toBeInTheDocument();
  });

  it("treats import failure as a terminal dialog state", async () => {
    const user = userEvent.setup();
    const onImportQuickReplies = vi.fn(async () => ({
      errorMsg: "导入数据有误",
      errors: [{ message: "请选择二级分类", rowNumber: 102 }],
      importedCount: 100,
      ok: false as const,
    }));
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps({ onImportQuickReplies })} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "开始导入" }));

    expect(
      await screen.findByText("导入中断，已成功导入 100 条，请检查后重试"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("第 102 行：请选择二级分类"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新选择" }),
    ).not.toBeInTheDocument();
  });

  it("shows backend errors when category ensure fails", async () => {
    const user = userEvent.setup();
    const onImportQuickReplies = vi.fn(async () => ({
      errorMsg: "一级分类数量已达上限",
      errors: [{ message: "一级分类数量已达上限", rowNumber: 0 }],
      importedCount: 0,
      ok: false as const,
    }));
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps({ onImportQuickReplies })} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    await user.click(await screen.findByRole("button", { name: "开始导入" }));

    expect(
      await screen.findByText("一级分类数量已达上限"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("导入中断，已成功导入 0 条，请检查后重试"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
  });

  it("shows a success page after successful import", async () => {
    const user = userEvent.setup();
    const onImportQuickReplies = vi.fn(async () => ({
      importedCount: 1,
      ok: true as const,
    }));
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps({ onImportQuickReplies })} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("已选择 quick-replies.xlsx")).toBeInTheDocument();
    expect(screen.getByText("文件校验通过")).toBeInTheDocument();
    expect(screen.getByText("分类")).toBeInTheDocument();
    expect(screen.getByText("话术分组")).toBeInTheDocument();
    expect(screen.queryByText("新建分类")).not.toBeInTheDocument();
    expect(screen.queryByText("新建话术分组")).not.toBeInTheDocument();
    expect(screen.queryByText("新建一级")).not.toBeInTheDocument();
    expect(screen.queryByText("新建二级")).not.toBeInTheDocument();
    expect(screen.queryByText("确认后将导入 1 条话术")).not.toBeInTheDocument();
    expect(screen.queryByText("确认导入 1 条话术？")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "关闭" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "开始导入" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "开始导入" }));

    expect(await screen.findByText("导入完成")).toBeInTheDocument();
    expect(screen.getByText("共导入 1 条话术")).toBeInTheDocument();
    expect(screen.queryByText("上传文件：")).not.toBeInTheDocument();
    expect(screen.queryByText("文件校验通过")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "上传文件" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "确定" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(
      screen.queryByRole("dialog", { name: "导入话术" }),
    ).not.toBeInTheDocument();
  });

  it("shows distinct category counts from the selected file", async () => {
    const user = userEvent.setup();
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
      ["售后", "物流", "发货", "您的订单会尽快安排发出"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("文件校验通过")).toBeInTheDocument();
    expect(screen.getByText("分类").nextSibling).toHaveTextContent("2 个");
    expect(screen.getByText("话术分组").nextSibling).toHaveTextContent("2 个");
  });

  it("resets selected import state after closing and reopening the dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(readSheet).mockResolvedValue([
      [...QUICK_REPLY_IMPORT_HEADERS],
      ["售前", "报价", "欢迎", "您好"],
    ] as unknown as Awaited<ReturnType<typeof readSheet>>);

    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["xlsx"], "quick-replies.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("文件校验通过")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));

    expect(screen.queryByText("文件校验通过")).not.toBeInTheDocument();
    expect(screen.queryByText("已选择 quick-replies.xlsx")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始导入" }),
    ).not.toBeInTheDocument();
  });

  it("does not close the import dialog from the overlay", async () => {
    const user = userEvent.setup();
    render(<QuickReplyPanel {...createPanelProps()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "导入话术" }));

    expect(screen.getAllByRole("button", { name: "关闭" })).toHaveLength(1);

    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);

    expect(screen.getByRole("dialog", { name: "导入话术" })).toBeInTheDocument();
  });

  it("shows quick replies as compact rows", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickReplies={[quickReply]}
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
      />,
    );

    expect(screen.queryByText("售前 / 报价")).not.toBeInTheDocument();
    expect(screen.getByText("01.")).toBeInTheDocument();
    expect(screen.getAllByText("报价").length).toBeGreaterThan(1);
    expect(screen.getByText("您好，这是报价信息")).toBeInTheDocument();
  });

  it("uses a context menu for quick reply actions", async () => {
    const user = userEvent.setup();
    const onBottomQuickReply = vi.fn();
    const onCopyQuickReply = vi.fn();
    const onTopQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickReplies={[quickReply]}
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
        onBottomQuickReply={onBottomQuickReply}
        onCopyQuickReply={onCopyQuickReply}
        onTopQuickReply={onTopQuickReply}
      />,
    );

    expect(screen.queryByRole("button", { name: "话术操作" })).not.toBeInTheDocument();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.hover(screen.getByRole("menuitem", { name: "排序" }));
    await user.click(screen.getByRole("menuitem", { name: "移到最前" }));

    expect(onTopQuickReply).toHaveBeenCalledWith(quickReply);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.click(screen.getByRole("menuitem", { name: "复制话术" }));

    expect(onCopyQuickReply).toHaveBeenCalledWith(quickReply);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.hover(screen.getByRole("menuitem", { name: "排序" }));
    await user.click(screen.getByRole("menuitem", { name: "移到最后" }));

    expect(onBottomQuickReply).toHaveBeenCalledWith(quickReply);
  });

  it("enters category sort mode and skips saving when order is unchanged", async () => {
    const user = userEvent.setup();
    const onSortCategories = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickReplyPanel
        {...createPanelProps({
          onSortCategories,
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术分组排序" }));

    expect(screen.getByText("已进入话术分组排序模式")).toBeInTheDocument();
    expect(screen.queryByText("您好，这是报价信息")).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: "报价" }));
    expect(screen.queryByRole("menuitem", { name: "新建话术" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSortCategories).not.toHaveBeenCalled();
    expect(screen.queryByText("已进入话术分组排序模式")).not.toBeInTheDocument();
  });

  it("disables top category changes while sorting", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();
    const onTopCategoryChange = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps({
          onCreateCategory,
          onTopCategoryChange,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术分组排序" }));

    await user.click(screen.getByRole("button", { name: "售后" }));
    await user.click(screen.getByRole("button", { name: "新增一级分类" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }));

    expect(onTopCategoryChange).not.toHaveBeenCalled();
    expect(onCreateCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "添加话术分组" })).not.toBeInTheDocument();
  });

  it("enters quick reply sort mode and skips saving when order is unchanged", async () => {
    const user = userEvent.setup();
    const onSortQuickReplies = vi.fn().mockResolvedValue(undefined);
    const secondReply = {
      ...quickReply,
      contentText: "第二条报价话术",
      id: "reply-2",
      sort: 90,
    };

    render(
      <QuickReplyPanel
        {...createPanelProps({
          onSortQuickReplies,
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply, secondReply] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术排序" }));

    expect(screen.getByText("已进入话术排序模式")).toBeInTheDocument();
    expect(screen.getByText("您好，这是报价信息")).toBeInTheDocument();
    expect(screen.getByText("第二条报价话术")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "复制话术" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSortQuickReplies).not.toHaveBeenCalled();
    expect(screen.queryByText("已进入话术排序模式")).not.toBeInTheDocument();
  });

  it("keeps sort rows out of native disabled state while blocking normal actions", async () => {
    const user = userEvent.setup();
    const onSelectQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps({
          onSelectQuickReply,
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术排序" }));

    const categoryButton = screen.getByRole("button", { name: "报价" });
    const quickReplyButton = screen.getByRole("button", {
      name: /01\.报价您好，这是报价信息/,
    });

    expect(categoryButton).toHaveAttribute("aria-disabled", "true");
    expect(quickReplyButton).toHaveAttribute("aria-disabled", "true");
    expect(categoryButton).not.toBeDisabled();
    expect(quickReplyButton).not.toBeDisabled();
    expect(categoryButton).not.toHaveClass("cursor-move");
    expect(quickReplyButton).not.toHaveClass("cursor-move");

    await user.click(categoryButton);
    await user.click(quickReplyButton);

    expect(onSelectQuickReply).not.toHaveBeenCalled();
    expect(screen.getByText("您好，这是报价信息")).toBeInTheDocument();
  });

  it("exits quick reply sort mode without saving when order is unchanged", async () => {
    const user = userEvent.setup();
    const onSortQuickReplies = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickReplyPanel
        {...createPanelProps({
          onSortQuickReplies,
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术排序" }));

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSortQuickReplies).not.toHaveBeenCalled();
    expect(screen.queryByText("已进入话术排序模式")).not.toBeInTheDocument();
  });

  it("clears keyword and shows full reply sort scope when entering sort mode", async () => {
    const user = userEvent.setup();
    const onKeywordChange = vi.fn();
    const onSortQuickReplies = vi.fn().mockResolvedValue(undefined);
    const secondReply = {
      ...quickReply,
      categoryId: "cat-3",
      contentText: "致歉说明",
      id: "reply-2",
      labelText: "致歉",
      sort: 90,
    };

    render(
      <QuickReplyPanel
        {...createPanelProps({
          keyword: "报价",
          onKeywordChange,
          onSortQuickReplies,
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [secondReply],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.hover(screen.getByRole("menuitem", { name: "拖拽排序" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "话术排序" }));

    expect(onKeywordChange).toHaveBeenCalledWith("");
    expect(screen.getByText("致歉说明")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSortQuickReplies).not.toHaveBeenCalled();
    expect(screen.queryByText("已进入话术排序模式")).not.toBeInTheDocument();
  });

  it("confirms before deleting a quick reply", async () => {
    const user = userEvent.setup();
    const onDeleteQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickReplies={[quickReply]}
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
        onDeleteQuickReply={onDeleteQuickReply}
      />,
    );

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.click(screen.getByRole("menuitem", { name: "删除" }));

    expect(onDeleteQuickReply).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "确认删除话术" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onDeleteQuickReply).not.toHaveBeenCalled();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.click(screen.getByRole("menuitem", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onDeleteQuickReply).toHaveBeenCalledWith(quickReply);
  });

  it("opens child category creation from the top-level category context menu", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onCreateCategory={onCreateCategory}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "售前分类操作" }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }));
    await user.click(screen.getByRole("menuitem", { name: "添加话术分组" }));

    expect(onCreateCategory).toHaveBeenCalledWith("cat-1");
  });

  it("keeps category context menus inside the right viewport edge", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 780,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(
        this: HTMLElement,
      ) {
        if (
          this.getAttribute("role") === "menu"
        ) {
          return {
            bottom: 260,
            height: 160,
            left: 760,
            right: 900,
            top: 100,
            width: 140,
            x: 760,
            y: 100,
            toJSON: () => ({}),
          };
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    try {
      render(<QuickReplyPanel {...createPanelProps()} />);

      fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }), {
        clientX: 760,
        clientY: 100,
      });

      expect(screen.getByRole("menu")).toHaveStyle({ left: "632px" });
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("opens sort submenus to the left when the right side has no room", async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 780,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(
        this: HTMLElement,
      ) {
        if (
          this.getAttribute("role") === "menuitem" &&
          this.textContent?.includes("排序")
        ) {
          return {
            bottom: 348,
            height: 32,
            left: 590,
            right: 730,
            top: 316,
            width: 140,
            x: 590,
            y: 316,
            toJSON: () => ({}),
          };
        }

        if (
          this.getAttribute("role") === "menu" &&
          this.textContent?.includes("移到最前") &&
          !this.textContent.includes("编辑")
        ) {
          return {
            bottom: 444,
            height: 96,
            left: 734,
            right: 874,
            top: 316,
            width: 140,
            x: 734,
            y: 316,
            toJSON: () => ({}),
          };
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    try {
      render(<QuickReplyPanel {...createPanelProps()} />);

      fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }), {
        clientX: 590,
        clientY: 250,
      });
      await user.hover(screen.getByRole("menuitem", { name: "排序" }));

      const menus = screen.getAllByRole("menu");
      expect(menus[menus.length - 1]).toHaveAttribute("data-side", "left");
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("labels category top action as moving to front", async () => {
    const user = userEvent.setup();
    const onBottomCategory = vi.fn();
    const onTopCategory = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onBottomCategory={onBottomCategory}
        onTopCategory={onTopCategory}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }));
    expect(screen.getByRole("menuitem", { name: "排序" })).toBeInTheDocument();
    await user.hover(screen.getByRole("menuitem", { name: "排序" }));
    await user.click(screen.getByRole("menuitem", { name: "移到最前" }));

    expect(onTopCategory).toHaveBeenCalledWith(categories[0]);

    fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }));
    await user.hover(screen.getByRole("menuitem", { name: "排序" }));
    await user.click(screen.getByRole("menuitem", { name: "移到最后" }));

    expect(onBottomCategory).toHaveBeenCalledWith(categories[0]);
  });

  it("closes the sort submenu when hovering another category menu item", async () => {
    const user = userEvent.setup();

    render(<QuickReplyPanel {...createPanelProps()} />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "售前" }));
    await user.hover(screen.getByRole("menuitem", { name: "排序" }));
    expect(screen.getByRole("menuitem", { name: "移到最前" })).toBeInTheDocument();

    await user.hover(screen.getByRole("menuitem", { name: "重命名" }));

    expect(screen.queryByRole("menuitem", { name: "移到最前" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "移到最后" })).not.toBeInTheDocument();
  });

  it("uses the primary color for the active top-level category", () => {
    render(<QuickReplyPanel {...createPanelProps()} />);

    expect(screen.getByRole("button", { name: "售前" })).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
  });

  it("uses a compact scope switch and search in the same header row", async () => {
    const user = userEvent.setup();
    const onKeywordChange = vi.fn();
    const onScopeTypeChange = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onKeywordChange={onKeywordChange}
        onScopeTypeChange={onScopeTypeChange}
      />,
    );

    expect(screen.queryByRole("button", { name: "企业话术" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "个人话术" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "个人" }));
    fireEvent.change(screen.getByPlaceholderText("搜索话术"), {
      target: { value: "退款" },
    });

    expect(onScopeTypeChange).toHaveBeenCalledWith(QUICK_REPLY_SCOPE_TYPE.PERSONAL);
    expect(onKeywordChange).toHaveBeenLastCalledWith("退款");
  });

  it("uses an icon-only button to create top-level categories", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onCreateCategory={onCreateCategory}
      />,
    );

    expect(screen.queryByText("分类")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "一级分类" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增一级分类" }));

    expect(onCreateCategory).toHaveBeenCalledWith(0);
  });

  it("shows a direct add category button in the empty state", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps({
          categories: [],
        })}
        onCreateCategory={onCreateCategory}
      />,
    );

    expect(screen.queryByText("暂无一级分类")).not.toBeInTheDocument();
    const manualLink = screen.getByRole("link", { name: "查看使用手册" });

    expect(manualLink).toHaveAttribute(
      "href",
      "https://b5.bokr.com.cn/dist/manual/quickreply.png",
    );
    expect(manualLink).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("button", { name: "添加分类" }));

    expect(onCreateCategory).toHaveBeenCalledWith(0);
  });

  it("shows a manual link in the empty secondary category state", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps({
          categories: [categories[0]],
        })}
      />,
    );

    const manualLink = screen.getByRole("link", { name: "查看使用手册" });

    expect(
      screen.getByText("添加一个话术分组，即可开始创建话术"),
    ).toBeInTheDocument();
    expect(manualLink).toHaveAttribute(
      "href",
      "https://b5.bokr.com.cn/dist/manual/quickreply.png",
    );
    expect(manualLink).toHaveAttribute("target", "_blank");
  });

  it("uses top categories and secondary sections instead of all or uncategorized entries", async () => {
    const user = userEvent.setup();
    const onTopCategoryChange = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onTopCategoryChange={onTopCategoryChange}
      />,
    );

    expect(screen.queryByRole("button", { name: "全部" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "未分类" })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "售前" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "售前" }));

    expect(onTopCategoryChange).toHaveBeenCalledWith("cat-1");
  });

  it("allows multiple secondary categories to stay expanded", async () => {
    const user = userEvent.setup();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
      />,
    );

    await user.click(screen.getByRole("button", { name: "致歉" }));

    expect(screen.getByRole("button", { name: "报价" })).toHaveTextContent("报价");
    expect(screen.getByRole("button", { name: "致歉" })).toHaveTextContent("致歉");
  });

  it("preserves manual secondary category collapse after content refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "报价" }));
    expect(screen.queryByText("您好，这是报价信息")).not.toBeInTheDocument();

    rerender(
      <QuickReplyPanel
        {...createPanelProps({
          categories: [...categories],
        })}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{
          "cat-2": [
            {
              ...quickReply,
              contentText: "刷新后的报价话术",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("刷新后的报价话术")).not.toBeInTheDocument();
  });

  it("expands the active secondary category when the active category changes externally", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "致歉话术",
              id: "reply-2",
              labelText: "致歉",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "致歉" }));
    expect(screen.queryByText("致歉话术")).not.toBeInTheDocument();

    rerender(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-3"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "致歉话术",
              id: "reply-2",
              labelText: "致歉",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("致歉话术")).toBeInTheDocument();
  });

  it("creates quick replies from the secondary category context menu", async () => {
    const user = userEvent.setup();
    const onCreateQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        onCreateQuickReply={onCreateQuickReply}
      />,
    );

    expect(screen.queryByText("选择二级分类")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新建话术" })).not.toBeInTheDocument();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "报价" }) });
    await user.click(screen.getByRole("menuitem", { name: "新建话术" }));

    expect(onCreateQuickReply).toHaveBeenCalledOnce();
  });

  it("moves secondary categories from a scrollable submenu", async () => {
    const user = userEvent.setup();
    const onMoveCategory = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        onMoveCategory={onMoveCategory}
      />,
    );

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: "报价" }),
    });
    await user.hover(screen.getByRole("menuitem", { name: "移动" }));

    const submenu = screen.getByRole("menu", { name: "移动分类" });
    expect(submenu).toHaveStyle({ maxHeight: "240px", overflowY: "auto" });
    expect(screen.queryByRole("menuitem", { name: "售前" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "售后" }));

    expect(onMoveCategory).toHaveBeenCalledWith(categories[1], "cat-4");
  });

  it("moves quick replies only to secondary categories under the current top category", async () => {
    const user = userEvent.setup();
    const onMoveQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        quickRepliesByCategoryId={{ "cat-2": [quickReply] }}
        onMoveQuickReply={onMoveQuickReply}
      />,
    );

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("您好，这是报价信息"),
    });
    await user.hover(screen.getByRole("menuitem", { name: "移动" }));

    const submenu = screen.getByRole("menu", { name: "移动话术" });
    expect(submenu).toHaveStyle({ maxHeight: "240px", overflowY: "auto" });
    expect(screen.queryByRole("menuitem", { name: "物流" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "致歉" }));

    expect(onMoveQuickReply).toHaveBeenCalledWith(quickReply, "cat-3");
  });

  it("opens the secondary category context menu from the whole header row", async () => {
    const user = userEvent.setup();
    const onCreateQuickReply = vi.fn();

    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        onCreateQuickReply={onCreateQuickReply}
      />,
    );

    fireEvent.contextMenu(screen.getByRole("group", { name: "报价分类行" }), {
      clientX: 320,
      clientY: 180,
    });
    await user.click(screen.getByRole("menuitem", { name: "新建话术" }));

    expect(onCreateQuickReply).toHaveBeenCalledOnce();
  });

  it("keeps secondary category headers sticky while scrolling quick replies", () => {
    render(<QuickReplyPanel {...createPanelProps()} activeCategoryId="cat-2" />);

    expect(screen.getByRole("group", { name: "报价分类行" })).toHaveStyle({
      position: "sticky",
      top: "0px",
    });
    expect(screen.getByRole("group", { name: "报价分类行" })).toHaveAttribute(
      "data-stuck",
      "false",
    );
  });

  it("marks a secondary category header as stuck only after it reaches the top", async () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(
        this: HTMLElement,
      ) {
        if (this.getAttribute("data-slot") === "scroll-area-viewport") {
          return {
            bottom: 600,
            height: 400,
            left: 0,
            right: 320,
            top: 200,
            width: 320,
            x: 0,
            y: 200,
            toJSON: () => ({}),
          };
        }

        if (this.getAttribute("aria-label") === "报价分类行") {
          return {
            bottom: 236,
            height: 36,
            left: 0,
            right: 320,
            top: 200,
            width: 320,
            x: 0,
            y: 200,
            toJSON: () => ({}),
          };
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    try {
      render(<QuickReplyPanel {...createPanelProps()} activeCategoryId="cat-2" />);

      const viewport = document.querySelector(
        '[data-slot="scroll-area-viewport"]',
      );

      if (!viewport) {
        throw new Error("missing quick reply scroll viewport");
      }

      Object.defineProperty(viewport, "scrollTop", {
        configurable: true,
        value: 48,
      });
      fireEvent.scroll(viewport);

      await waitFor(() => {
        expect(screen.getByRole("group", { name: "报价分类行" })).toHaveAttribute(
          "data-stuck",
          "true",
        );
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("does not render an empty placeholder when an expanded secondary category has no replies", () => {
    render(<QuickReplyPanel {...createPanelProps()} activeCategoryId="cat-2" />);

    expect(screen.queryByText("暂无话术")).not.toBeInTheDocument();
  });

  it("does not render a loading placeholder inside expanded secondary categories", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps()}
        activeCategoryId="cat-2"
        isLoading
      />,
    );

    expect(screen.queryByText("加载中")).not.toBeInTheDocument();
  });

  it("renders a spinner instead of the empty secondary category state while loading", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps({
          categories: [categories[0]],
        })}
        isLoading
      />,
    );

    expect(screen.getByRole("status", { name: "正在加载话术" })).toBeInTheDocument();
    expect(screen.queryByText("暂无二级分类")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "新建二级分类" }),
    ).not.toBeInTheDocument();
  });

  it("renders a spinner instead of the top-level empty state while loading", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps({
          categories: [],
        })}
        isLoading
      />,
    );

    expect(screen.getByRole("status", { name: "正在加载话术" })).toBeInTheDocument();
    expect(screen.queryByText("暂无一级分类")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加分类" })).not.toBeInTheDocument();
    expect(screen.queryByText("请先新建一级分类")).not.toBeInTheDocument();
  });

  it("filters quick replies on the client and only shows matching secondary categories", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps()}
        keyword="退款"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "退款重拍话术",
              id: "reply-2",
              labelText: "退款",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "报价" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "致歉" })).toBeInTheDocument();
    expect(screen.getByText("退款重拍话术")).toBeInTheDocument();
  });

  it("matches quick reply attachment names case-insensitively", () => {
    render(
      <QuickReplyPanel
        {...createPanelProps()}
        keyword="pdf"
        quickRepliesByCategoryId={{
          "cat-2": [
            {
              ...quickReply,
              attachments: [
                {
                  content: {
                    fileName: "报价单.PDF",
                    fileUrl: "https://cdn.example.com/quote.pdf",
                  },
                  materialCollectionId: "material-file-1",
                  msgid: "msg-file-1",
                  type: "file",
                },
              ],
              contentText: "",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "报价" })).toBeInTheDocument();
    expect(screen.getByText("文件")).toBeInTheDocument();
  });

  it("restores manual secondary category expansion after search is cleared", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <QuickReplyPanel
        {...createPanelProps()}
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "退款重拍话术",
              id: "reply-2",
              labelText: "退款",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "报价" }));
    expect(screen.queryByText("您好，这是报价信息")).not.toBeInTheDocument();

    rerender(
      <QuickReplyPanel
        {...createPanelProps()}
        keyword="报价"
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "退款重拍话术",
              id: "reply-2",
              labelText: "退款",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("您好，这是报价信息")).toBeInTheDocument();

    rerender(
      <QuickReplyPanel
        {...createPanelProps()}
        quickRepliesByCategoryId={{
          "cat-2": [quickReply],
          "cat-3": [
            {
              ...quickReply,
              categoryId: "cat-3",
              contentText: "退款重拍话术",
              id: "reply-2",
              labelText: "退款",
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText("您好，这是报价信息")).not.toBeInTheDocument();
  });

  it("validates empty quick reply in the form dialog", async () => {
    const user = userEvent.setup();

    render(
      <QuickReplyFormDialog
        categories={categories}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("请填写话术内容或添加附件")).toBeInTheDocument();
  });

  it("uses shared quick reply payload validation before saving", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={{
          attachments: [
            {
              content: {
                title: "活动链接",
              },
              materialCollectionId: "material-h5-1",
              msgid: "msg-h5-1",
              type: "h5",
            },
          ],
          categoryId: "cat-2",
          contentText: "您好",
          labelColor: "",
          labelText: "",
        }}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("H5附件数据异常")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a spinner while saving the quick reply form", async () => {
    const user = userEvent.setup();
    const save = createDeferred();

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={() => save.promise}
        open
      />,
    );

    await user.type(screen.getByPlaceholderText("请输入话术内容"), "您好");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const saveButton = screen.getByRole("button", { name: "保存中保存" });
    expect(saveButton).toBeDisabled();
    expect(saveButton.querySelector("[data-slot='spinner']")).toBeInTheDocument();

    save.resolve();
  });

  it("does not render a category selector in the form dialog", () => {
    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("分类")).not.toBeInTheDocument();
  });

  it("uses create title when opening the form with copied values", () => {
    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={{
          attachments: [
            {
              content: {
                fileUrl: "https://cdn.example.com/reply.png",
              },
              type: "image",
            },
          ],
          categoryId: "cat-2",
          contentText: "复制的话术",
          labelColor: "orange",
          labelText: "短标题",
        }}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "新建话术" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "编辑话术" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("短标题")).toBeInTheDocument();
    expect(screen.getByDisplayValue("复制的话术")).toBeInTheDocument();
  });

  it("adds a material file attachment from the picker", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async listMaterialGroups(request) {
        if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
          return baseService.listMaterialGroups(request);
        }

        return {
          groups: [
            {
              bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
              id: "material-file-group-1",
              sort: 100,
              title: "常用文件",
            },
          ],
        };
      },
      async listMaterialCollections(request) {
        if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
          return baseService.listMaterialCollections(request);
        }

        return {
          items: [
            {
              bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
              content: {
                fileName: "报价单.pdf",
                fileUrl: "https://cdn.example.com/quote.pdf",
              },
              contentType: "file",
              groupId: "material-file-group-1",
              id: "material-file-1",
              messageId: "msg-file-1",
              msgInfoId: "9001",
              sort: 100,
              title: "报价单.pdf",
            },
          ],
          pagination: {
            hasMore: false,
            page: 1,
            pageSize: 100,
            total: 1,
          },
        };
      },
    });

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "文件" }));
    expect(await screen.findByRole("dialog", { name: "收录的文件" })).toBeInTheDocument();
    expect(screen.queryByText("从已收录素材中选择一个附件")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "收录文件列表" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /选择 / }));
    await user.click(screen.getByRole("button", { name: "确定" }));
    await user.type(screen.getByPlaceholderText("请输入话术内容"), "您好");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            materialCollectionId: expect.any(String),
            msgInfoId: "9001",
            msgid: expect.any(String),
            type: "file",
          }),
        ],
        contentText: "您好",
      }),
    );
  });

  it("disables adding sphfeed attachments from the quick reply form", async () => {
    const user = userEvent.setup();

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));

    const sphfeedMenuItem = screen.getByRole("menuitem", { name: "视频号" });

    expect(sphfeedMenuItem).toHaveAttribute("aria-disabled", "true");

    await user.click(sphfeedMenuItem);

    expect(
      screen.queryByRole("dialog", { name: "收录的视频号" }),
    ).not.toBeInTheDocument();
  });

  it("previews attachment content from the form dialog", async () => {
    const user = userEvent.setup();

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={{
          ...createQuickReplyInitialValues(),
          attachments: [
            {
              content: {
                description: "查看本期活动规则",
                previewImageUrl: "https://cdn.example.com/activity.png",
                title: "活动链接",
                url: "https://example.com/activity",
              },
              materialCollectionId: "material-h5-1",
              msgid: "msg-h5-1",
              type: "h5",
            },
          ],
        }}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.hover(screen.getByRole("button", { name: "预览附件 活动链接" }));

    expect(await screen.findByTestId("link-card-content")).toBeInTheDocument();
    expect(screen.getByText("查看本期活动规则")).toBeInTheDocument();
  });

  it("keeps the full long attachment title available in the form dialog", () => {
    const longTitle =
      "1-1210已提 不退改)洞门永存! 一加入! 悍在脚上🌊十色洞洞鞋🌴可以穿三个季度的拖孩 全国实拍 芭蕾亲子款 小明星 小特林 贝雅红 云朵 鲸鱼款 鞋花单拍也包邮";

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={{
          ...createQuickReplyInitialValues(),
          attachments: [
            {
              content: {
                title: longTitle,
                url: "https://example.com/activity",
              },
              materialCollectionId: "material-h5-long",
              msgid: "msg-h5-long",
              type: "h5",
            },
          ],
        }}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    expect(screen.getByTitle(longTitle)).toHaveTextContent(longTitle);
  });

  it("shows a tooltip when attachment count reaches the limit", async () => {
    const user = userEvent.setup();

    render(
      <QuickReplyFormDialog
        categories={categories}
        initialValues={{
          ...createQuickReplyInitialValues(),
          attachments: Array.from({ length: 5 }, (_, index) => ({
            content: {
              alt: `图片${index + 1}.png`,
              fileUrl: `https://cdn.example.com/reply-${index + 1}.png`,
            },
            type: "image" as const,
          })),
        }}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    const addButton = screen.getByRole("button", { name: "添加附件" });

    expect(addButton).toBeDisabled();

    await user.hover(addButton);

    expect(
      await screen.findByRole("tooltip", { name: "附件已达数量上限" }),
    ).toBeInTheDocument();
  });

  it("defers image attachment upload until saving the quick reply", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    vi.mocked(mediaUploadMocks.uploadWorkbenchImageFile).mockResolvedValueOnce({
      alt: "reply.png",
      fileId: "chat-images/quick-reply/reply.png",
      type: "image",
      url: "https://b5.bokr.com.cn/chat-images/quick-reply/reply.png",
    });

    render(
      <QuickReplyFormDialog
        categories={categories}
        conversationId="conv-001"
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    const file = new File(["image"], "reply.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [file] },
    });
    expect(screen.queryByRole("dialog", { name: "添加图片" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("请输入图片地址")).not.toBeInTheDocument();
    expect(mediaUploadMocks.uploadWorkbenchImageFile).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText("请输入话术内容"), "您好");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mediaUploadMocks.uploadWorkbenchImageFile).toHaveBeenCalledWith(
      "conv-001",
      file,
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            content: {
              alt: "reply.png",
              fileUrl: "https://b5.bokr.com.cn/chat-images/quick-reply/reply.png",
            },
            type: "image",
          },
        ],
      }),
    );
  });

  it("revokes local image preview url when removing an image attachment", async () => {
    const user = userEvent.setup();
    const objectUrl = "blob:quick-reply-image";
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce(objectUrl);
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    render(
      <QuickReplyFormDialog
        categories={categories}
        conversationId="conv-001"
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: {
        files: [new File(["image"], "reply.png", { type: "image/png" })],
      },
    });
    await user.click(screen.getByRole("button", { name: "删除附件 reply.png" }));

    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });

  it("revokes local image preview url when closing the quick reply form", async () => {
    const user = userEvent.setup();
    const objectUrl = "blob:quick-reply-image-close";
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce(objectUrl);
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const { unmount } = render(
      <QuickReplyFormDialog
        categories={categories}
        conversationId="conv-001"
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: {
        files: [new File(["image"], "reply.png", { type: "image/png" })],
      },
    });
    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });

  it("does not save the quick reply when deferred image upload fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    vi.mocked(mediaUploadMocks.uploadWorkbenchImageFile).mockRejectedValueOnce(
      new Error("upload failed"),
    );

    render(
      <QuickReplyFormDialog
        categories={categories}
        conversationId="conv-001"
        initialValues={createQuickReplyInitialValues()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加附件" }));
    await user.click(screen.getByRole("menuitem", { name: "图片" }));
    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: {
        files: [new File(["image"], "reply.png", { type: "image/png" })],
      },
    });
    await user.type(screen.getByPlaceholderText("请输入话术内容"), "您好");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("图片上传失败，请重试")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

function createPanelProps(
  overrides: Partial<React.ComponentProps<typeof QuickReplyPanel>> = {},
) {
  return {
    activeCategoryId: null,
    activeScopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    activeTopCategoryId: "cat-1",
    categories,
    isLoading: false,
    keyword: "",
    onBottomCategory: vi.fn(),
    onBottomQuickReply: vi.fn(),
    onCategoryChange: vi.fn(),
    onCreateCategory: vi.fn(),
    onCreateQuickReply: vi.fn(),
    onDeleteCategory: vi.fn(),
    onDeleteQuickReply: vi.fn(),
    onEditCategory: vi.fn(),
    onEditQuickReply: vi.fn(),
    onImportQuickReplies: vi.fn(),
    onCopyQuickReply: vi.fn(),
    onKeywordChange: vi.fn(),
    onMoveCategory: vi.fn(),
    onMoveQuickReply: vi.fn(),
    onScopeTypeChange: vi.fn(),
    onSelectQuickReply: vi.fn(),
    onSortCategories: vi.fn(),
    onSortQuickReplies: vi.fn(),
    onTopCategoryChange: vi.fn(),
    onTopCategory: vi.fn(),
    onTopQuickReply: vi.fn(),
    quickReplies: [],
    ...overrides,
  };
}

function createQuickReplyInitialValues() {
  return {
    attachments: [],
    categoryId: "cat-2",
    contentText: "",
    labelColor: "",
    labelText: "",
  };
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}
