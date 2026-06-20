import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  renderWithChatWorkbenchRouter,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      warning: vi.fn(),
    },
  };
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

describe("ChatWorkbenchPage download flows", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("restarts video transfer instead of opening an expired finished video URL", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(baseService.downloadMessageFile);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "已过期视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "finished",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  fileUrlExpireTime: Date.now() - 1000,
                  videoUrl: "https://b5.bokr.com.cn/chat-videos/expired.mp4",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-expired-video",
                rawMsgtype: "video",
                seatId: "drc",
                senderType: "customer",
                seq: 539,
                status: "sent",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：已过期视频" }));

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      msgInfoId: 539,
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not update download UI after unmounting during a transfer request", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const transferGate = createDeferred<Awaited<ReturnType<typeof baseService.downloadMessageFile>>>();

    setWorkbenchService({
      ...baseService,
      async downloadMessageFile() {
        return transferGate.promise;
      },
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "待转存视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "failed",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  videoUrl: "",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-video",
                rawMsgtype: "video",
                seatId: "drc",
                senderType: "customer",
                seq: 539,
                status: "sent",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    const { unmount } = renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));

    unmount();
    transferGate.reject(new Error("transfer failed after unmount"));
    await expect(transferGate.promise).rejects.toThrow("transfer failed after unmount");

    expect(toast.warning).not.toHaveBeenCalledWith("下载失败，请稍后重试");
  });

  it("keeps clicked video downloads in loading state without polling download status", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(async () => ({
      messageId: "remote-pending-video",
      status: "accepted" as const,
    }));
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  alt: "待转存视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "failed",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  videoUrl: "",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-video",
                rawMsgtype: "video",
                seatId: "drc",
                senderType: "customer",
                seq: 539,
                status: "sent",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderWithChatWorkbenchRouter(
      <StrictMode>
        <ChatWorkbenchPage />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));
    vi.useFakeTimers();

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      msgInfoId: 539,
    });
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3500);

    expect(getMessageFileDownloadStatus).not.toHaveBeenCalled();
  });

  it("keeps loaded in-progress downloads in loading state without polling download status", async () => {
    const baseService = createMockWorkbenchService();
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              createInProgressVideoDto({
                alt: "最旧视频",
                createdAt: 1778240000000,
                messageId: "remote-old-video",
                seq: 536,
              }),
              createInProgressFileDto({
                createdAt: 1778240100000,
                fileName: "第三新文件.pdf",
                messageId: "remote-third-file",
                seq: 537,
              }),
              createInProgressVideoDto({
                alt: "第二新视频",
                createdAt: 1778240200000,
                messageId: "remote-second-video",
                seq: 538,
              }),
              createInProgressFileDto({
                createdAt: 1778240300000,
                fileName: "最新文件.pdf",
                messageId: "remote-new-file",
                seq: 539,
              }),
            ],
            scannedCount: 4,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getAllByRole("status", { name: "视频下载中" })).toHaveLength(2);
    expect(screen.getAllByRole("status", { name: "文件下载中" })).toHaveLength(2);
    vi.useFakeTimers();

    await vi.advanceTimersByTimeAsync(3500);

    expect(getMessageFileDownloadStatus).not.toHaveBeenCalled();
  });

  it("starts another download when existing messages are already in progress", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(async () => ({
      messageId: "remote-new-video",
      status: "accepted" as const,
    }));

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              createInProgressVideoDto({
                alt: "转存中视频",
                createdAt: 1778240000000,
                messageId: "remote-ing-video",
                seq: 536,
              }),
              createInProgressFileDto({
                createdAt: 1778240100000,
                fileName: "转存中文件一.pdf",
                messageId: "remote-ing-file-1",
                seq: 537,
              }),
              createInProgressFileDto({
                createdAt: 1778240200000,
                fileName: "转存中文件二.pdf",
                messageId: "remote-ing-file-2",
                seq: 538,
              }),
              createInProgressVideoDto({
                alt: "新视频",
                createdAt: 1778240300000,
                downloadStatus: "failed",
                messageId: "remote-new-video",
                seq: 539,
              }),
            ],
            scannedCount: 4,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：新视频" }));

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      msgInfoId: 539,
    });
    expect(toast.warning).not.toHaveBeenCalledWith("下载队列已满，请稍后");
  });

  it("does not restore download-status polling for in-progress downloads after StrictMode remount", async () => {
    const baseService = createMockWorkbenchService();
    const getMessageFileDownloadStatus = vi.fn(
      async (input: { conversationId: string; messageSeq: number }) => ({
        downloadStatus: "ing" as const,
        fileSerialNo: `serial-${input.messageSeq}`,
      }),
    );

    setWorkbenchService({
      ...baseService,
      getMessageFileDownloadStatus,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              createInProgressVideoDto({
                alt: "转存中视频",
                createdAt: 1778240300000,
                messageId: "remote-strict-video",
                seq: 539,
              }),
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderWithChatWorkbenchRouter(
      <StrictMode>
        <ChatWorkbenchPage />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "请输入消息……" });
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();
    vi.useFakeTimers();

    await vi.advanceTimersByTimeAsync(3500);

    expect(getMessageFileDownloadStatus).not.toHaveBeenCalled();
  });
});

function createInProgressVideoDto({
  alt,
  createdAt,
  downloadStatus = "ing",
  fileSerialNo,
  messageId,
  seq,
}: {
  alt: string;
  createdAt: number;
  downloadStatus?: "ing" | "finished" | "failed";
  fileSerialNo?: string;
  messageId: string;
  seq: number;
}) {
  const resolvedFileSerialNo = fileSerialNo ?? `serial-${seq}`;

  return {
    content: {
      alt,
      coverImageUrl: "/covers/stage.jpg",
      downloadStatus,
      durationLabel: "1:01",
      ...(resolvedFileSerialNo === undefined ? {} : { fileSerialNo: resolvedFileSerialNo }),
      videoUrl: "",
    },
    contentType: "video" as const,
    conversationId: "conv-001",
    createdAt,
    customerId: "cust-001",
    messageId,
    rawMsgtype: "video",
    seatId: "drc",
    senderType: "customer" as const,
    seq,
    status: "sent" as const,
  };
}

function createInProgressFileDto({
  createdAt,
  fileName,
  messageId,
  seq,
}: {
  createdAt: number;
  fileName: string;
  messageId: string;
  seq: number;
}) {
  return {
    content: {
      downloadStatus: "ing",
      extension: "pdf",
      fileName,
      fileSerialNo: `serial-${seq}`,
      fileSizeLabel: "2 KB",
      fileUrl: "",
    },
    contentType: "file" as const,
    conversationId: "conv-001",
    createdAt,
    customerId: "cust-001",
    messageId,
    rawMsgtype: "file",
    seatId: "drc",
    senderType: "customer" as const,
    seq,
    status: "sent" as const,
  };
}
