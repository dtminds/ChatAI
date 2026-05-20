import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createMockWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { ChatWorkbenchPage } from "@/pages/chat/chat-workbench-page";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
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

  it("updates video download state from poll message-update events", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadMessageFile = vi.fn(async () => ({
      messageId: "remote-pending-video",
      status: "accepted" as const,
    }));
    const poll = vi.fn(async (request) => ({
      activeConversationMessages: [],
      conversationChanges: [],
      messageStatusChanges: [],
      messageUpdateEvents: [
        {
          conversationId: request.activeConversationId ?? "conv-001",
          eventId: 4,
          messageId: "remote-pending-video",
        },
      ],
      nextMessageUpdateCursor: 1_778_840_010_000,
      nextVersion: request.sinceVersion + 1,
      seatChanges: [],
    }));

    setWorkbenchService({
      ...baseService,
      downloadMessageFile,
      poll,
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
                seatId: "drc",
                senderType: "customer",
                seq: 539,
                status: "read",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
      async getMessagesByIds(input) {
        if (input.conversationId === "conv-001" && input.messageIds.includes("remote-pending-video")) {
          return {
            messages: [
              {
                content: {
                  alt: "待转存视频",
                  coverImageUrl: "/covers/stage.jpg",
                  downloadStatus: "finished",
                  durationLabel: "1:01",
                  fileSerialNo: "serial-video-001",
                  fileUrlExpireTime: Date.now() + 30 * 60 * 1000,
                  videoUrl: "https://b5.bokr.com.cn/chat-videos/pending.mp4",
                },
                contentType: "video",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-video",
                seatId: "drc",
                senderType: "customer",
                seq: 539,
                status: "read",
              },
            ],
          };
        }

        return baseService.getMessagesByIds(input);
      },
    });

    render(
      <StrictMode>
        <ChatWorkbenchPage />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载视频：待转存视频" }));

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageId: "remote-pending-video",
      messageSeq: 539,
    });
    expect(screen.getByRole("status", { name: "视频下载中" })).toBeInTheDocument();

    await useWorkbenchStore.getState().pollWorkbench();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "播放视频：待转存视频" })).toBeInTheDocument();
    });
  });

  it("marks the message loading immediately and keeps the store in sync when poll updates arrive", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const downloadGate = createDeferred<Awaited<ReturnType<typeof baseService.downloadMessageFile>>>();
    const poll = vi.fn(async () => ({
      activeConversationMessages: [],
      conversationChanges: [],
      messageStatusChanges: [],
      messageUpdateEvents: [
        {
          conversationId: "conv-001",
          eventId: 4,
          messageId: "remote-pending-file",
        },
      ],
      nextMessageUpdateCursor: 1_778_840_010_000,
      nextVersion: 1_778_840_020_000,
      seatChanges: [],
    }));

    setWorkbenchService({
      ...baseService,
      async downloadMessageFile() {
        return downloadGate.promise;
      },
      poll,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: {
                  downloadStatus: "failed",
                  extension: "pdf",
                  fileName: "报价单.pdf",
                  fileSerialNo: "serial-file-001",
                  fileSizeLabel: "2 KB",
                  fileUrl: "",
                },
                contentType: "file",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-file",
                seatId: "drc",
                senderType: "customer",
                seq: 540,
                status: "read",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
      async getMessagesByIds(input) {
        if (input.conversationId === "conv-001" && input.messageIds.includes("remote-pending-file")) {
          return {
            messages: [
              {
                content: {
                  downloadStatus: "finished",
                  extension: "pdf",
                  fileName: "报价单.pdf",
                  fileSerialNo: "serial-file-001",
                  fileSizeLabel: "2 KB",
                  fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
                },
                contentType: "file",
                conversationId: "conv-001",
                createdAt: 1778240300000,
                customerId: "cust-001",
                messageId: "remote-pending-file",
                seatId: "drc",
                senderType: "customer",
                seq: 540,
                status: "read",
              },
            ],
          };
        }

        return baseService.getMessagesByIds(input);
      },
    });

    const { unmount } = renderChatWorkbenchPage();

    await screen.findByRole("textbox", { name: "请输入消息……" });
    await user.click(screen.getByRole("button", { name: "下载文件：报价单.pdf" }));

    expect(screen.getByRole("status", { name: "文件下载中" })).toBeInTheDocument();

    downloadGate.resolve({
      messageId: "remote-pending-file",
      status: "accepted" as const,
    });

    await useWorkbenchStore.getState().pollWorkbench();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "下载文件：报价单.pdf" })).toBeInTheDocument();
    });

    unmount();
    expect(toast.warning).not.toHaveBeenCalledWith("下载失败，请稍后重试");
  });
});
