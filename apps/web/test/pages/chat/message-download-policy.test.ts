// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  getMessageDownloadUrl,
  isMessageDownloadUrlReady,
  startMessageFileDownload,
} from "@/pages/chat/lib/message-download";

describe("message download URL readiness", () => {
  it("treats finished videos as ready only when the stored URL has not expired", () => {
    const readyVideo = createVideoMessage({
      downloadStatus: "finished",
      fileUrlExpireTime: Date.now() + 60_000,
      videoUrl: "https://b5.bokr.com.cn/chat-videos/ready.mp4",
    });
    const expiredVideo = createVideoMessage({
      downloadStatus: "finished",
      fileUrlExpireTime: Date.now() - 1000,
      videoUrl: "https://b5.bokr.com.cn/chat-videos/expired.mp4",
    });

    expect(isMessageDownloadUrlReady(readyVideo, getMessageDownloadUrl(readyVideo)))
      .toBe(true);
    expect(
      isMessageDownloadUrlReady(expiredVideo, getMessageDownloadUrl(expiredVideo)),
    ).toBe(false);
  });

  it("treats finished files as ready when a download URL exists", () => {
    const readyFile = createFileMessage({
      downloadStatus: "finished",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });
    const unfinishedFile = createFileMessage({
      downloadStatus: "ing",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });

    expect(isMessageDownloadUrlReady(readyFile, getMessageDownloadUrl(readyFile)))
      .toBe(true);
    expect(
      isMessageDownloadUrlReady(unfinishedFile, getMessageDownloadUrl(unfinishedFile)),
    ).toBe(false);
  });

  it("never opens image URLs directly from the message download path", () => {
    const image = createImageMessage({
      downloadStatus: "finished",
      imageUrl: "https://b5.bokr.com.cn/chat-images/photo.png",
    });

    expect(isMessageDownloadUrlReady(image, getMessageDownloadUrl(image))).toBe(false);
  });
});

describe("startMessageFileDownload", () => {
  it("restarts transfer for an expired finished video instead of opening the URL", async () => {
    const downloadMessageFile = vi.fn(async () => ({ status: "accepted" as const }));
    const openDownloadUrl = vi.fn();
    const updateDownloadContent = vi.fn();
    const message = createVideoMessage({
      downloadStatus: "finished",
      fileSerialNo: "serial-video-001",
      fileUrlExpireTime: Date.now() - 1000,
      seq: 539,
      videoUrl: "https://b5.bokr.com.cn/chat-videos/expired.mp4",
    });

    await startMessageFileDownload(message, {
      activeConversationId: "conv-001",
      downloadMessageFile,
      isMounted: () => true,
      onTransferError: vi.fn(),
      openDownloadUrl,
      updateDownloadContent,
    });

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      msgInfoId: 539,
    });
    expect(openDownloadUrl).not.toHaveBeenCalled();
    expect(updateDownloadContent).toHaveBeenCalledWith("conv-001", "message-video", {
      downloadStatus: "ing",
      updatedAtMs: expect.any(Number),
    });
  });

  it("opens a ready file URL without starting another transfer", () => {
    const downloadMessageFile = vi.fn(async () => ({ status: "accepted" as const }));
    const openDownloadUrl = vi.fn();
    const message = createFileMessage({
      downloadStatus: "finished",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      seq: 540,
    });

    void startMessageFileDownload(message, {
      activeConversationId: "conv-001",
      downloadMessageFile,
      isMounted: () => true,
      onTransferError: vi.fn(),
      openDownloadUrl,
      updateDownloadContent: vi.fn(),
    });

    expect(openDownloadUrl).toHaveBeenCalledWith(
      message,
      "https://b5.bokr.com.cn/chat-files/quote.pdf",
    );
    expect(downloadMessageFile).not.toHaveBeenCalled();
  });

  it("starts a transfer for failed images that still have file serial metadata", async () => {
    const downloadMessageFile = vi.fn(async () => ({ status: "accepted" as const }));
    const updateDownloadContent = vi.fn();
    const message = createImageMessage({
      downloadStatus: "failed",
      fileSerialNo: "serial-image-539",
      seq: 539,
    });

    await startMessageFileDownload(message, {
      activeConversationId: "conv-001",
      downloadMessageFile,
      isMounted: () => true,
      onTransferError: vi.fn(),
      openDownloadUrl: vi.fn(),
      updateDownloadContent,
    });

    expect(downloadMessageFile).toHaveBeenCalledWith({
      conversationId: "conv-001",
      msgInfoId: 539,
    });
    expect(updateDownloadContent).toHaveBeenCalledWith("conv-001", "message-image", {
      downloadStatus: "ing",
      updatedAtMs: expect.any(Number),
    });
  });

  it("does not mark the message failed after unmounting during a transfer request", async () => {
    const onTransferError = vi.fn();
    const updateDownloadContent = vi.fn();
    let rejectTransfer!: (reason?: unknown) => void;
    const downloadMessageFile = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectTransfer = reject;
        }),
    );
    const message = createVideoMessage({
      downloadStatus: "failed",
      fileSerialNo: "serial-video-001",
      seq: 539,
      videoUrl: "",
    });

    const pending = startMessageFileDownload(message, {
      activeConversationId: "conv-001",
      downloadMessageFile,
      isMounted: () => false,
      onTransferError,
      openDownloadUrl: vi.fn(),
      updateDownloadContent,
    });

    rejectTransfer(new Error("transfer failed after unmount"));
    await pending;

    expect(onTransferError).not.toHaveBeenCalled();
    expect(updateDownloadContent).toHaveBeenCalledTimes(1);
    expect(updateDownloadContent).toHaveBeenCalledWith("conv-001", "message-video", {
      downloadStatus: "ing",
      updatedAtMs: expect.any(Number),
    });
  });
});

function createVideoMessage({
  downloadStatus,
  fileSerialNo,
  fileUrlExpireTime,
  seq,
  videoUrl,
}: {
  downloadStatus?: "ing" | "finished" | "failed";
  fileSerialNo?: string;
  fileUrlExpireTime?: number;
  seq?: number;
  videoUrl: string;
}): ChatMessage {
  return {
    author: "客户",
    content: {
      alt: "视频",
      coverImageUrl: "/covers/stage.jpg",
      downloadStatus,
      durationLabel: "1:01",
      fileSerialNo,
      fileUrlExpireTime,
      type: "video",
      videoUrl,
    },
    conversationId: "conv-001",
    msgid: "message-video",
    role: "customer",
    sender: {
      id: "cust-001",
      name: "客户",
    },
    sentAt: "2026-05-15 10:00:00",
    seq,
    status: "sent",
    uiMessageKey: "message-video",
  };
}

function createFileMessage({
  downloadStatus,
  fileUrl,
  seq,
}: {
  downloadStatus?: "ing" | "finished" | "failed";
  fileUrl?: string;
  seq?: number;
}): ChatMessage {
  return {
    author: "客户",
    content: {
      downloadStatus,
      extension: "pdf",
      fileName: "报价单.pdf",
      fileSerialNo: "serial-file-001",
      fileSizeLabel: "2 KB",
      fileUrl,
      type: "file",
    },
    conversationId: "conv-001",
    msgid: "message-file",
    role: "customer",
    sender: {
      id: "cust-001",
      name: "客户",
    },
    sentAt: "2026-05-15 10:00:00",
    seq,
    status: "sent",
    uiMessageKey: "message-file",
  };
}

function createImageMessage({
  downloadStatus,
  fileSerialNo,
  imageUrl = "https://b5.bokr.com.cn/chat-images/photo.png",
  seq,
}: {
  downloadStatus?: "ing" | "finished" | "failed";
  fileSerialNo?: string;
  imageUrl?: string;
  seq?: number;
}): ChatMessage {
  return {
    author: "客户",
    content: {
      alt: "图片",
      downloadStatus,
      fileSerialNo,
      imageUrl,
      type: "image",
    },
    conversationId: "conv-001",
    msgid: "message-image",
    role: "customer",
    sender: {
      id: "cust-001",
      name: "客户",
    },
    sentAt: "2026-05-15 10:00:00",
    seq,
    status: "sent",
    uiMessageKey: "message-image",
  };
}
