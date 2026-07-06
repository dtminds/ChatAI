import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMaterialCollection } from "@/pages/chat/hooks/use-material-collection";
import type { ChatMessage } from "@/pages/chat/chat-types";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";

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

type MaterialCollectionOptions = Parameters<typeof useMaterialCollection>[0];

function createDeferred<T>() {
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

const fileMessage = {
  author: "客户",
  content: {
    extension: "pdf",
    fileName: "报价单.pdf",
    fileUrl: "https://example.com/files/quote.pdf",
    type: "file",
  },
  conversationId: "conv-001",
  msgid: "msg-file-001",
  role: "customer",
  sender: {
    id: "customer-001",
    name: "客户",
  },
  sentAt: "2026-06-14 10:00:00",
  seq: 7001,
  status: "sent",
  uiMessageKey: "7001",
} satisfies ChatMessage;

const miniProgramMessage = {
  author: "客户",
  content: {
    appName: "企微助手",
    coverImageUrl: "https://example.com/mini-cover.png",
    title: "客户跟进小程序",
    type: "mini-program",
  },
  conversationId: "conv-001",
  msgid: "msg-mini-001",
  role: "customer",
  sender: {
    id: "customer-001",
    name: "客户",
  },
  sentAt: "2026-06-14 10:01:00",
  seq: 7002,
  status: "sent",
  uiMessageKey: "7002",
} satisfies ChatMessage;

function createDefaultOptions(
  overrides: Partial<MaterialCollectionOptions> = {},
): MaterialCollectionOptions {
  return {
    bootstrapStatus: "ready",
    isMountedRef: { current: true },
    onSendFailure: vi.fn(),
    onSent: vi.fn(),
    requestActiveConversationRead: vi.fn(),
    resolvedActiveConversationId: "conv-001",
    sendAgentMessageSegments: vi.fn(),
    ...overrides,
  };
}

function createFileMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: 2,
    content: {
      extension: "pdf",
      fileName: "报价单.pdf",
      fileUrl: "https://example.com/files/quote.pdf",
    },
    contentType: "file",
    groupId: "group-file",
    id: "material-file",
    msgInfoId: "9101",
    sort: 1_781_244_000_000,
    title: "报价单.pdf",
    ...overrides,
  };
}

function createMiniProgramMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: 3,
    content: {
      appName: "企微助手",
      title: "客户跟进小程序",
    },
    contentType: "mini-program",
    groupId: "group-mini",
    id: "material-mini",
    msgInfoId: "9102",
    sort: 1_781_244_000_000,
    title: "客户跟进小程序",
    ...overrides,
  };
}

function createSphfeedMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: 5,
    content: {
      title: "都市快报",
    },
    contentType: "sphfeed",
    groupId: "group-sphfeed",
    id: "material-sphfeed",
    msgInfoId: "9103",
    sort: 1_781_244_000_000,
    title: "都市快报",
    ...overrides,
  };
}

function createVideoMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: 7,
    content: {
      coverUrl: "https://example.com/video-cover.jpg",
      fileUrl: "https://example.com/video.mp4",
    },
    contentType: "video",
    groupId: "group-video",
    id: "material-video",
    msgInfoId: "9105",
    sort: 1_781_244_000_000,
    title: "视频",
    ...overrides,
  };
}

function createExpressionMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: 1,
    content: {
      fileUrl: "https://example.com/expression.gif",
    },
    contentType: "emotion",
    groupId: 0,
    id: "material-expression",
    msgInfoId: "9104",
    sort: 1_781_244_000_000,
    title: "贴贴表情",
    ...overrides,
  };
}

describe("useMaterialCollection", () => {
  afterEach(() => {
    resetWorkbenchService();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("clears pending collection state when active conversation changes", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      listMaterialGroups: vi.fn(async () => ({
        groups: [
          {
            bizType: 2 as const,
            id: "group-file",
            sort: 1_781_244_000_000,
            title: "常用文件",
          },
        ],
      })),
    });

    const { rerender, result } = renderHook(
      ({ resolvedActiveConversationId }: { resolvedActiveConversationId: string }) =>
        useMaterialCollection(
          createDefaultOptions({
            resolvedActiveConversationId,
          }),
        ),
      {
        initialProps: {
          resolvedActiveConversationId: "conv-001",
        },
      },
    );

    await act(async () => {
      await result.current.handleCollectMaterial(fileMessage);
    });

    expect(result.current.pendingMaterialCollection).toMatchObject({
      conversationId: "conv-001",
      msgInfoId: "7001",
    });

    rerender({
      resolvedActiveConversationId: "conv-002",
    });

    await waitFor(() => {
      expect(result.current.pendingMaterialCollection).toBeNull();
    });
    expect(result.current.materialCollectionGroups).toEqual([]);
  });

  it("does not restore pending collection when group loading resolves after conversation changes", async () => {
    const baseService = createMockWorkbenchService();
    const groupsGate = createDeferred<{
      groups: Array<{
        bizType: 2;
        id: string;
        sort: number;
        title: string;
      }>;
    }>();

    setWorkbenchService({
      ...baseService,
      listMaterialGroups: vi.fn(() => groupsGate.promise),
    });

    const { rerender, result } = renderHook(
      ({ resolvedActiveConversationId }: { resolvedActiveConversationId: string }) =>
        useMaterialCollection(
          createDefaultOptions({
            resolvedActiveConversationId,
          }),
        ),
      {
        initialProps: {
          resolvedActiveConversationId: "conv-001",
        },
      },
    );

    let collectPromise!: Promise<void>;

    act(() => {
      collectPromise = result.current.handleCollectMaterial(fileMessage);
    });

    rerender({
      resolvedActiveConversationId: "conv-002",
    });

    await act(async () => {
      groupsGate.resolve({
        groups: [
          {
            bizType: 2,
            id: "group-file",
            sort: 1_781_244_000_000,
            title: "常用文件",
          },
        ],
      });
      await collectPromise;
    });

    expect(result.current.pendingMaterialCollection).toBeNull();
    expect(result.current.materialCollectionGroups).toEqual([]);
  });

  it("calls sent callbacks after selecting a sendable material", async () => {
    const onSent = vi.fn();
    const requestActiveConversationRead = vi.fn();
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          onSent,
          requestActiveConversationRead,
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createFileMaterialItem());
    });

    expect(sendAgentMessageSegments).toHaveBeenCalledWith([
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        materialCollectionId: "material-file",
        msgInfoId: "9101",
        type: "file",
        url: "https://example.com/files/quote.pdf",
      },
    ]);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(requestActiveConversationRead).toHaveBeenCalledTimes(1);
    expect(result.current.activeMaterialLibraryBizType).toBeNull();
  });

  it("sends a collected mini-program material by forwarding its source message", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createMiniProgramMaterialItem());
    });

    expect(sendAgentMessageSegments).toHaveBeenCalledWith([
      expect.objectContaining({
        materialCollectionId: "material-mini",
        type: "weapp",
      }),
    ]);
  });

  it("sends a collected sphfeed material by forwarding its source message", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createSphfeedMaterialItem());
    });

    expect(sendAgentMessageSegments).toHaveBeenCalledWith([
      expect.objectContaining({
        materialCollectionId: "material-sphfeed",
        msgInfoId: "9103",
        title: "都市快报",
        type: "sphfeed",
      }),
    ]);
  });

  it("sends a collected video material by forwarding its source message", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createVideoMaterialItem());
    });

    expect(sendAgentMessageSegments).toHaveBeenCalledWith([
      expect.objectContaining({
        materialCollectionId: "material-video",
        msgInfoId: "9105",
        title: "视频",
        type: "video",
      }),
    ]);
    expect(toast.warning).not.toHaveBeenCalledWith("暂未支持");
  });

  it("sends a collected expression material as an emotion segment", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createExpressionMaterialItem());
    });

    expect(sendAgentMessageSegments).toHaveBeenCalledWith([
      {
        imageUrl: "https://example.com/expression.gif",
        materialCollectionId: "material-expression",
        type: "emotion",
      },
    ]);
  });

  it("rejects collected expression material without fileUrl", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(
        createExpressionMaterialItem({
          content: {
            url: "https://example.com/legacy-expression.gif",
          },
        }),
      );
    });

    expect(sendAgentMessageSegments).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith("表情素材数据异常");
  });

  it("shows an incomplete content warning when video material content is invalid", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(
        createVideoMaterialItem({
          content: {
            fileUrl: "https://example.com/video.mp4",
          },
        }),
      );
    });

    expect(sendAgentMessageSegments).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith("视频素材数据异常");
  });

  it("calls send failure callback when material send fails", async () => {
    const onSendFailure = vi.fn();
    const onSent = vi.fn();
    const sendAgentMessageSegments = vi.fn(async () => ({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      ok: false as const,
      reason: "send" as const,
    }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          onSendFailure,
          onSent,
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(createFileMaterialItem());
    });

    expect(onSendFailure).toHaveBeenCalledWith({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      reason: "send",
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("shows an incomplete content warning when file material content is invalid", async () => {
    const sendAgentMessageSegments = vi.fn(async () => ({ ok: true as const }));

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          sendAgentMessageSegments,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSelectMaterial(
        createFileMaterialItem({
          content: null as unknown as WorkbenchMaterialCollectionItemDto["content"],
        }),
      );
    });

    expect(sendAgentMessageSegments).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith("文件素材数据异常");
  });

  it("does not refresh collected expressions after expression mutation resolves when unmounted", async () => {
    const baseService = createMockWorkbenchService();
    const isMountedRef = { current: true };
    const topGate = createDeferred<{ ok: true }>();
    const listMaterialCollections = vi.fn(baseService.listMaterialCollections);

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      topMaterialCollection: vi.fn(() => topGate.promise),
    });

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          isMountedRef,
        }),
      ),
    );

    act(() => {
      result.current.handleTopCollectedExpression(
        createFileMaterialItem({
          bizType: 1,
          contentType: "emotion",
          groupId: "0",
          id: "material-expression",
        }),
      );
    });

    isMountedRef.current = false;

    await act(async () => {
      topGate.resolve({ ok: true });
      await topGate.promise;
    });

    expect(listMaterialCollections).not.toHaveBeenCalled();
  });

  it("does not refresh material library after material mutation resolves when unmounted", async () => {
    const baseService = createMockWorkbenchService();
    const isMountedRef = { current: true };
    const topGate = createDeferred<{ ok: true }>();
    const listMaterialCollections = vi.fn(baseService.listMaterialCollections);

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      topMaterialCollection: vi.fn(() => topGate.promise),
    });

    const { result } = renderHook(() =>
      useMaterialCollection(
        createDefaultOptions({
          isMountedRef,
        }),
      ),
    );

    act(() => {
      result.current.handleOpenMaterialLibrary(2);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryGroupId).toBe(
        "mock-material-group-file",
      );
    });
    listMaterialCollections.mockClear();

    act(() => {
      result.current.handleTopMaterial(
        createFileMaterialItem({
          groupId: "mock-material-group-file",
        }),
      );
    });

    isMountedRef.current = false;

    await act(async () => {
      topGate.resolve({ ok: true });
      await topGate.promise;
    });

    expect(listMaterialCollections).not.toHaveBeenCalled();
  });

  it("ignores stale material library group responses when opening another biz type", async () => {
    const baseService = createMockWorkbenchService();
    const fileGroupsGate = createDeferred<{
      groups: Array<{
        bizType: 2;
        id: string;
        sort: number;
        title: string;
      }>;
    }>();

    setWorkbenchService({
      ...baseService,
      listMaterialCollections: vi.fn(baseService.listMaterialCollections),
      listMaterialGroups: vi.fn((request) => {
        if (request.bizType === 2) {
          return fileGroupsGate.promise;
        }

        return Promise.resolve({
          groups: [
            {
              bizType: 4 as const,
              id: "group-h5",
              sort: 1_781_244_000_001,
              title: "常用链接",
            },
          ],
        });
      }),
    });

    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    act(() => {
      result.current.handleOpenMaterialLibrary(2);
    });
    act(() => {
      result.current.handleOpenMaterialLibrary(4);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryBizType).toBe(4);
      expect(result.current.materialLibraryGroups).toEqual([
        {
          bizType: 4,
          id: "group-h5",
          sort: 1_781_244_000_001,
          title: "常用链接",
        },
      ]);
    });

    await act(async () => {
      fileGroupsGate.resolve({
        groups: [
          {
            bizType: 2,
            id: "group-file-stale",
            sort: 1_781_244_000_000,
            title: "过期文件分组",
          },
        ],
      });
      await fileGroupsGate.promise;
    });

    expect(result.current.activeMaterialLibraryBizType).toBe(4);
    expect(result.current.materialLibraryGroups).toEqual([
      {
        bizType: 4,
        id: "group-h5",
        sort: 1_781_244_000_001,
        title: "常用链接",
      },
    ]);
  });

  it("refreshes the active material library after submitting collection", async () => {
    const baseService = createMockWorkbenchService();
    const collectMaterial = vi.fn(async () => ({
      success: true as const,
    }));
    const listMaterialCollections = vi.fn(baseService.listMaterialCollections);

    setWorkbenchService({
      ...baseService,
      collectMaterial,
      listMaterialCollections,
      listMaterialGroups: vi.fn(baseService.listMaterialGroups),
    });

    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    await act(async () => {
      result.current.handleOpenMaterialLibrary(2);
    });
    await waitFor(() => {
      expect(result.current.activeMaterialLibraryGroupId).toBe(
        "mock-material-group-file",
      );
    });

    await act(async () => {
      await result.current.handleCollectMaterial(fileMessage);
    });
    await act(async () => {
      await result.current.handleSubmitMaterialCollection({
        fileName: "报价单.pdf",
        groupId: "mock-material-group-file",
      });
    });

    expect(collectMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: 2,
        fileName: "报价单.pdf",
        groupId: "mock-material-group-file",
        msgInfoId: "7001",
      }),
    );
    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: 2,
      groupId: "mock-material-group-file",
      page: 1,
      pageSize: 100,
    });
    expect(result.current.pendingMaterialCollection).toBeNull();
  });

  it("shows a success toast after saving edited material", async () => {
    const baseService = createMockWorkbenchService();
    const updateMaterialCollection = vi.fn(async () => ({ ok: true as const }));

    setWorkbenchService({
      ...baseService,
      updateMaterialCollection,
    });

    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    act(() => {
      result.current.handleEditMaterial(createMiniProgramMaterialItem(), {
        description: "",
        fileExtension: "",
        fileName: "",
        title: "更新后的小程序",
      });
    });

    await waitFor(() => {
      expect(updateMaterialCollection).toHaveBeenCalledWith("material-mini", {
        title: "更新后的小程序",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("已保存");
  });

  it("searches material titles in the active group and clears search on group switch", async () => {
    const baseService = createMockWorkbenchService();
    const groupFileA = {
      bizType: 2 as const,
      id: "group-file-a",
      sort: 2,
      title: "文件A",
    };
    const groupFileB = {
      bizType: 2 as const,
      id: "group-file-b",
      sort: 1,
      title: "文件B",
    };
    const listMaterialCollections = vi.fn(async (request) => ({
      items: [],
      pagination: {
        hasMore: false,
        page: request.page ?? 1,
        pageSize: request.pageSize ?? 100,
        total: 0,
      },
    }));
    const listMaterialGroups = vi
      .fn()
      .mockResolvedValueOnce({ groups: [groupFileA, groupFileB] })
      .mockResolvedValue({ groups: [groupFileA] });

    setWorkbenchService({
      ...baseService,
      deleteMaterialGroup: vi.fn(async () => ({ ok: true as const })),
      listMaterialCollections,
      listMaterialGroups,
    });

    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    act(() => {
      result.current.handleOpenMaterialLibrary(2);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryGroupId).toBe("group-file-a");
    });

    vi.useFakeTimers();
    const callsBeforeSearch = listMaterialCollections.mock.calls.length;

    act(() => {
      result.current.handleSearchMaterialLibraryKeyword(" 报 ");
      result.current.handleSearchMaterialLibraryKeyword(" 报价 ");
    });

    expect(result.current.materialLibrarySearchKeyword).toBe(" 报价 ");
    expect(listMaterialCollections).toHaveBeenCalledTimes(callsBeforeSearch);

    await act(() => vi.advanceTimersByTimeAsync(299));

    expect(listMaterialCollections).toHaveBeenCalledTimes(callsBeforeSearch);

    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: 2,
      groupId: "group-file-a",
      keyword: "报价",
      page: 1,
      pageSize: 100,
    });

    await act(async () => {
      await result.current.handleSelectMaterialLibraryGroup("group-file-b");
    });

    expect(result.current.materialLibrarySearchKeyword).toBe("");
    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: 2,
      groupId: "group-file-b",
      page: 1,
      pageSize: 100,
    });

    const callsBeforeSecondSearch = listMaterialCollections.mock.calls.length;

    act(() => {
      result.current.handleSearchMaterialLibraryKeyword(" 合 ");
      result.current.handleSearchMaterialLibraryKeyword(" 合同 ");
    });

    expect(result.current.materialLibrarySearchKeyword).toBe(" 合同 ");
    expect(listMaterialCollections).toHaveBeenCalledTimes(callsBeforeSecondSearch);

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: 2,
      groupId: "group-file-b",
      keyword: "合同",
      page: 1,
      pageSize: 100,
    });

    vi.useRealTimers();

    act(() => {
      result.current.handleDeleteMaterialGroup(groupFileB);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryGroupId).toBe("group-file-a");
    });

    expect(result.current.materialLibrarySearchKeyword).toBe("");
    expect(listMaterialCollections).toHaveBeenLastCalledWith({
      bizType: 2,
      groupId: "group-file-a",
      page: 1,
      pageSize: 100,
    });
  });

  it("prefills mini-program collection title from message title", async () => {
    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    await act(async () => {
      await result.current.handleCollectMaterial(miniProgramMessage);
    });

    expect(result.current.pendingMaterialCollection?.formValues).toMatchObject({
      title: "客户跟进小程序",
    });
  });

  it("opens mini-program collection with an empty title when title fields are missing", async () => {
    const malformedMiniProgramMessage = {
      ...miniProgramMessage,
      content: {
        type: "mini-program",
      },
    } as unknown as ChatMessage;
    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    await act(async () => {
      await result.current.handleCollectMaterial(malformedMiniProgramMessage);
    });

    expect(result.current.pendingMaterialCollection?.formValues).toMatchObject({
      title: "",
    });
  });

  it("clears material library and pending collection state on session reset", async () => {
    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    act(() => {
      result.current.handleOpenMaterialLibrary(2);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryBizType).toBe(2);
    });

    await act(async () => {
      await result.current.handleCollectMaterial(fileMessage);
    });

    act(() => {
      result.current.resetMaterialSessionState();
    });

    expect(result.current).toMatchObject({
      activeMaterialLibraryBizType: null,
      activeMaterialLibraryGroupId: null,
      collectedExpressions: [],
      hasMoreCollectedExpressions: false,
      isMaterialLibraryBusy: false,
      materialCollectionGroups: [],
      materialLibraryGroups: [],
      materialLibraryItems: [],
      pendingMaterialCollection: null,
    });
  });

  it("clears material library busy state when session reset invalidates in-flight loads", async () => {
    const baseService = createMockWorkbenchService();
    const deferredItems = createDeferred<
      Awaited<ReturnType<typeof baseService.listMaterialCollections>>
    >();

    setWorkbenchService({
      ...baseService,
      listMaterialCollections: vi.fn(() => deferredItems.promise),
    });

    const { result } = renderHook(() =>
      useMaterialCollection(createDefaultOptions()),
    );

    act(() => {
      result.current.handleOpenMaterialLibrary(2);
    });

    await waitFor(() => {
      expect(result.current.activeMaterialLibraryGroupId).toBe(
        "mock-material-group-file",
      );
    });

    await act(async () => {
      void result.current.handleSelectMaterialLibraryGroup("mock-material-group-file");
    });

    await waitFor(() => {
      expect(result.current.isMaterialLibraryBusy).toBe(true);
    });

    act(() => {
      result.current.resetMaterialSessionState();
    });

    expect(result.current.isMaterialLibraryBusy).toBe(false);

    await act(async () => {
      deferredItems.resolve({
        items: [],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 0,
        },
      });
      await deferredItems.promise;
    });

    expect(result.current.isMaterialLibraryBusy).toBe(false);
  });
});
