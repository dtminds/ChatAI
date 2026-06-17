import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type WorkbenchQuickReplyCategoryListRequest,
  type WorkbenchQuickReplyCategoryListResponse,
} from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { useQuickReplies } from "@/pages/chat/hooks/use-quick-replies";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe("useQuickReplies", () => {
  afterEach(() => {
    resetWorkbenchService();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads active top category content only after the panel is enabled", async () => {
    const baseService = createMockWorkbenchService();
    const listQuickReplies = vi.fn(baseService.listQuickReplies);
    const listQuickReplyCategories = vi.fn().mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          parentId: 0,
          scopeType: 1,
          sort: 100,
          title: "售前",
        },
      ],
    });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [
        {
          id: "cat-2",
          parentId: "cat-1",
          scopeType: 1,
          sort: 90,
          title: "报价",
        },
      ],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {
        "cat-2": [
          {
            attachments: [],
            categoryId: "cat-2",
            contentText: "您好，这是报价",
            id: "reply-1",
            labelColor: "",
            labelText: "",
            scopeType: 1,
            sort: 100,
          },
        ],
      },
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      listQuickReplies,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQuickReplies({ enabled }),
      {
        initialProps: { enabled: false },
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(listQuickReplies).not.toHaveBeenCalled();
    expect(listQuickReplyCategories).not.toHaveBeenCalled();
    expect(listQuickReplyCategoryContent).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(listQuickReplyCategories).toHaveBeenCalledTimes(1);
    });
    expect(listQuickReplies).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(listQuickReplyCategoryContent).toHaveBeenCalledWith({
        parentCategoryId: "cat-1",
        scopeType: 1,
      });
    });
    await waitFor(() => {
      expect(result.current.activeTopCategoryId).toBe("cat-1");
    });
    expect(result.current.quickRepliesByCategoryId).toMatchObject({
      "cat-2": [
        expect.objectContaining({
          contentText: "您好，这是报价",
        }),
      ],
    });
  });

  it("keeps mutation failures rejected so dialogs can stay open", async () => {
    const baseService = createMockWorkbenchService();
    const createQuickReply = vi.fn().mockRejectedValue(new Error("保存失败"));

    setWorkbenchService({
      ...baseService,
      createQuickReply,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(() =>
        result.current.createQuickReply({
          attachments: [],
          categoryId: 0,
          contentText: "您好",
          labelColor: "",
          labelText: "",
        }),
      ),
    ).rejects.toThrow("保存失败");
    expect(toast.warning).toHaveBeenCalledWith("保存失败");
  });

  it("reloads category content when the active top category changes", async () => {
    const baseService = createMockWorkbenchService();
    const listQuickReplyCategories = vi.fn().mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          parentId: 0,
          scopeType: 1,
          sort: 100,
          title: "售前",
        },
        {
          id: "cat-4",
          parentId: 0,
          scopeType: 1,
          sort: 90,
          title: "售后",
        },
      ],
    });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(listQuickReplyCategoryContent).toHaveBeenCalledWith({
        parentCategoryId: "cat-1",
        scopeType: 1,
      });
    });

    act(() => {
      result.current.setActiveTopCategoryId("cat-4");
    });

    await waitFor(() => {
      expect(listQuickReplyCategoryContent).toHaveBeenLastCalledWith({
        parentCategoryId: "cat-4",
        scopeType: 1,
      });
    });
  });

  it("changes keyword locally without reloading quick replies", async () => {
    const baseService = createMockWorkbenchService();
    const listQuickReplies = vi.fn(baseService.listQuickReplies);
    const listQuickReplyCategories = vi.fn().mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          parentId: 0,
          scopeType: 1,
          sort: 100,
          title: "售前",
        },
      ],
    });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      listQuickReplyCategories,
      listQuickReplies,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(listQuickReplyCategoryContent).toHaveBeenCalledTimes(1);
    });
    expect(listQuickReplies).not.toHaveBeenCalled();
    act(() => {
      result.current.setKeyword("退款");
    });

    expect(result.current.keyword).toBe("退款");
    expect(listQuickReplies).not.toHaveBeenCalled();
    expect(listQuickReplyCategoryContent).toHaveBeenCalledTimes(1);
  });

  it("enters loading state immediately when switching scope", async () => {
    const baseService = createMockWorkbenchService();
    const personalCategories =
      createDeferred<WorkbenchQuickReplyCategoryListResponse>();
    const listQuickReplyCategories = vi.fn(
      (
        request: WorkbenchQuickReplyCategoryListRequest,
      ): Promise<WorkbenchQuickReplyCategoryListResponse> => {
        if (request.scopeType === QUICK_REPLY_SCOPE_TYPE.PERSONAL) {
          return personalCategories.promise;
        }

        return Promise.resolve({
          categories: [
            {
              id: "cat-1",
              parentId: 0,
              scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
              sort: 100,
              title: "售前",
            },
          ],
        });
      },
    );
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.categories).toHaveLength(1);

    act(() => {
      result.current.setActiveScopeType(2);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.categories).toEqual([]);
  });

  it("keeps the submitted category when creating quick replies", async () => {
    const baseService = createMockWorkbenchService();
    const createQuickReply = vi.fn(baseService.createQuickReply);

    setWorkbenchService({
      ...baseService,
      createQuickReply,
      listQuickReplyCategories: vi.fn().mockResolvedValue({
        categories: [
          {
            id: "cat-1",
            parentId: 0,
            scopeType: 1,
            sort: 100,
            title: "售前",
          },
        ],
      }),
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setActiveCategoryId("cat-1");
    });
    await waitFor(() => {
      expect(result.current.activeCategoryId).toBe("cat-1");
    });

    await act(async () => {
      await result.current.createQuickReply({
        attachments: [],
        categoryId: 0,
        contentText: "您好",
        labelColor: "",
        labelText: "",
      });
    });

    expect(createQuickReply).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 0,
      }),
    );
  });

  it("moves secondary categories and quick replies through the workbench service", async () => {
    const baseService = createMockWorkbenchService();
    const moveQuickReplyCategory = vi.fn().mockResolvedValue({ ok: true });
    const moveQuickReply = vi.fn().mockResolvedValue({ ok: true });

    setWorkbenchService({
      ...baseService,
      listQuickReplyCategories: vi.fn().mockResolvedValue({
        categories: [
          {
            id: "cat-1",
            parentId: 0,
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 100,
            title: "售前",
          },
        ],
      }),
      moveQuickReply,
      moveQuickReplyCategory,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.moveCategory(
        {
          id: "cat-2",
          parentId: "cat-1",
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 90,
          title: "报价",
        },
        "cat-4",
      );
    });
    await act(async () => {
      await result.current.moveQuickReply(
        {
          attachments: [],
          categoryId: "cat-2",
          contentText: "您好",
          id: "reply-1",
          labelColor: "",
          labelText: "",
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100,
        },
        "cat-3",
      );
    });

    expect(moveQuickReplyCategory).toHaveBeenCalledWith(
      "cat-2",
      QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      { parentId: "cat-4" },
    );
    expect(moveQuickReply).toHaveBeenCalledWith(
      "reply-1",
      QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      { categoryId: "cat-3" },
    );
  });

  it("imports quick replies by ensuring categories then posting 100-item batches", async () => {
    const baseService = createMockWorkbenchService();
    const ensureQuickReplyCategories = vi.fn().mockResolvedValue({
      categories: [
        {
          children: [{ id: "11", title: "开场" }],
          id: "10",
          title: "售前",
        },
      ],
      ok: true,
      summary: {
        createdPrimaryCategoryCount: 1,
        createdSecondaryCategoryCount: 1,
      },
    });
    const batchCreateQuickReplies = vi.fn((request: { items: unknown[] }) =>
      Promise.resolve({
        ok: true,
        summary: { createdQuickReplyCount: request.items.length },
      } as const),
    );
    const listQuickReplyCategories = vi.fn().mockResolvedValue({ categories: [] });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      batchCreateQuickReplies,
      ensureQuickReplyCategories,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const rows = Array.from({ length: 101 }, (_, index) => ({
      contentText: `话术${index}`,
      labelText: "开场",
      primaryCategory: "售前",
      rowNumber: index + 2,
      secondaryCategory: "开场",
    }));

    await act(async () => {
      const response = await result.current.importQuickReplies(rows);
      expect(response).toEqual({ importedCount: 101, ok: true });
    });

    expect(ensureQuickReplyCategories).toHaveBeenCalledOnce();
    expect(batchCreateQuickReplies).toHaveBeenCalledTimes(2);
    expect(batchCreateQuickReplies.mock.calls[0]?.[0].items).toHaveLength(100);
    expect(batchCreateQuickReplies.mock.calls[1]?.[0].items).toHaveLength(1);
    expect(listQuickReplyCategories).toHaveBeenCalledTimes(2);
  });

  it("reloads quick replies when a later import batch fails", async () => {
    const baseService = createMockWorkbenchService();
    const ensureQuickReplyCategories = vi.fn().mockResolvedValue({
      categories: [
        {
          children: [{ id: "11", title: "开场" }],
          id: "10",
          title: "售前",
        },
      ],
      ok: true,
      summary: {
        createdPrimaryCategoryCount: 1,
        createdSecondaryCategoryCount: 1,
      },
    });
    const batchCreateQuickReplies = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        summary: { createdQuickReplyCount: 100 },
      })
      .mockResolvedValueOnce({
        errorMsg: "导入数据有误",
        errors: [{ message: "请选择二级分类", rowNumber: 102 }],
        importedCount: 0,
        ok: false,
      });
    const listQuickReplyCategories = vi.fn().mockResolvedValue({ categories: [] });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      batchCreateQuickReplies,
      ensureQuickReplyCategories,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const rows = Array.from({ length: 101 }, (_, index) => ({
      contentText: `话术${index}`,
      labelText: "开场",
      primaryCategory: "售前",
      rowNumber: index + 2,
      secondaryCategory: "开场",
    }));

    await act(async () => {
      const response = await result.current.importQuickReplies(rows);
      expect(response).toEqual({
        errorMsg: "导入数据有误",
        errors: [{ message: "请选择二级分类", rowNumber: 102 }],
        importedCount: 100,
        ok: false,
      });
    });

    expect(listQuickReplyCategories).toHaveBeenCalledTimes(2);
  });

  it("returns an import failure when category ensure throws", async () => {
    const baseService = createMockWorkbenchService();
    const ensureQuickReplyCategories = vi
      .fn()
      .mockRejectedValue(new Error("network failed"));
    const listQuickReplyCategories = vi.fn().mockResolvedValue({ categories: [] });
    const listQuickReplyCategoryContent = vi.fn().mockResolvedValue({
      categories: [],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {},
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });

    setWorkbenchService({
      ...baseService,
      ensureQuickReplyCategories,
      listQuickReplyCategories,
      listQuickReplyCategoryContent,
    });

    const { result } = renderHook(() => useQuickReplies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.importQuickReplies([
        {
          contentText: "您好",
          labelText: "开场",
          primaryCategory: "售前",
          rowNumber: 2,
          secondaryCategory: "开场",
        },
      ]);

      expect(response).toEqual({
        errorMsg: "网络异常，请重试",
        errors: [],
        importedCount: 0,
        ok: false,
      });
    });
  });
});

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
