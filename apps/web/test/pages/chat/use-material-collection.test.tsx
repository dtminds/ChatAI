import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMaterialCollection } from "@/pages/chat/hooks/use-material-collection";
import type { ChatMessage } from "@/pages/chat/chat-types";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";

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
  id: "local-msg-001",
  remoteMessageId: "msg-file-001",
  role: "customer",
  sender: {
    id: "customer-001",
    name: "客户",
  },
  sentAt: "2026-06-14 10:00:00",
  status: "sent",
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
    messageId: "msg-file-001",
    sort: 1_781_244_000_000,
    title: "报价单.pdf",
    ...overrides,
  };
}

describe("useMaterialCollection", () => {
  afterEach(() => {
    resetWorkbenchService();
    vi.clearAllMocks();
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
      messageId: "msg-file-001",
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
        type: "file",
        url: "https://example.com/files/quote.pdf",
      },
    ]);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(requestActiveConversationRead).toHaveBeenCalledTimes(1);
    expect(result.current.activeMaterialLibraryBizType).toBeNull();
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
        messageId: "msg-file-001",
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
});
