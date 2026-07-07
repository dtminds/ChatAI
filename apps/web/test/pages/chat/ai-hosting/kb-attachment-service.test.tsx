import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getKbAttachmentStatus,
  listKbAttachments,
  initKbAttachments,
} from "@/pages/chat/ai-hosting/api/kb-attachment-service";
import { KbAttachmentsTab } from "@/pages/chat/ai-hosting/kb-components/kb-attachments-tab";
import { KbAttachmentsTable } from "@/pages/chat/ai-hosting/kb-components/kb-attachments-table";
import {
  KB_ATTACHMENT_TYPE,
  isKbLocalUploadedImageMaterial,
  toKbAttachmentContent,
  toKbAttachmentItem,
  toQuickReplyDraftAttachment,
  type KbAttachmentItem,
} from "@/pages/chat/ai-hosting/kb-components/kb-attachment-types";

vi.mock("@/pages/chat/ai-hosting/api/kb-attachment-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/pages/chat/ai-hosting/api/kb-attachment-service")
  >();

  return {
    ...actual,
    getKbAttachmentStatus: vi.fn(),
    initKbAttachments: vi.fn(),
    listKbAttachments: vi.fn(),
    createKbAttachment: vi.fn(),
    updateKbAttachment: vi.fn(),
    deleteKbAttachment: vi.fn(),
    batchDeleteKbAttachments: vi.fn(),
    buildKbAttachmentCreateRequest: vi.fn(),
    buildKbAttachmentUpdateRequest: vi.fn(),
  };
});

vi.mock("@/pages/chat/ai-hosting/api/kb-service", () => ({
  getKbDoc: vi.fn(),
}));

vi.mock("@/pages/chat/lib/image-ocr", () => ({
  recognizeImageText: vi.fn(),
}));

vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();

  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

describe("kb attachment mappers", () => {
  it("maps list item to view item and back to attachment content", () => {
    const listItem = {
      attachmentContent: {
        content: {
          fileName: "产品说明书.pdf",
          fileUrl: "https://example.com/manual.pdf",
        },
        materialCollectionId: "mc-1",
        msgInfoId: "msg-1",
        type: "file" as const,
      },
      materialCollectionId: "mc-1",
      attachmentType: 2 as const,
      chunkId: "chunk-1",
      createdAt: "2026-07-03 12:00:00",
      description: "安装说明",
      fileSizeLabel: "2MB",
      title: "产品说明书.pdf",
      updatedAt: "2026-07-03 12:00:00",
    };

    const viewItem = toKbAttachmentItem(listItem);

    expect(viewItem).toMatchObject({
      attachmentType: 2,
      description: "安装说明",
      fileSizeLabel: "2MB",
      id: "chunk-1",
      title: "产品说明书.pdf",
    });
    expect(viewItem.payload.type).toBe("file");

    const content = toKbAttachmentContent(viewItem.payload);

    expect(content).toEqual(listItem.attachmentContent);
    expect(toQuickReplyDraftAttachment(listItem.attachmentContent)).toEqual(viewItem.payload);
  });

  it("detects local kb image by msgInfoId 0", () => {
    expect(isKbLocalUploadedImageMaterial("0")).toBe(true);
    expect(isKbLocalUploadedImageMaterial("9001")).toBe(false);
    expect(isKbLocalUploadedImageMaterial(undefined)).toBe(false);
  });

  it("preserves msgInfoId 0 in attachment content roundtrip", () => {
    const payload = toQuickReplyDraftAttachment({
      content: {
        fileUrl: "https://example.com/poster.png",
      },
      materialCollectionId: "mc-local",
      msgInfoId: "0",
      type: "image",
    });

    expect(isKbLocalUploadedImageMaterial(payload.msgInfoId)).toBe(true);
    expect(toKbAttachmentContent(payload)).toMatchObject({
      materialCollectionId: "mc-local",
      msgInfoId: "0",
      type: "image",
    });
  });

  it("maps link list item title from attachment content instead of chunk title", () => {
    const viewItem = toKbAttachmentItem({
      attachmentContent: {
        content: {
          coverUrl: "https://example.com/cover.png",
          href: "https://example.com/article",
          title: "私域操盘手专访",
        },
        materialCollectionId: "mc-1",
        msgInfoId: "msg-1",
        type: "h5",
      },
      attachmentType: 4,
      chunkId: "chunk-2",
      createdAt: "2026-07-03 12:00:00",
      description: "这是用户填写的链接描述",
      materialCollectionId: "mc-1",
      title: "这是用户填写的链接描述",
      updatedAt: "2026-07-03 12:00:00",
    });

    expect(viewItem.title).toBe("私域操盘手专访");
    expect(viewItem.description).toBe("这是用户填写的链接描述");
  });
});

describe("KbAttachmentsTable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens image attachments in the preview dialog", async () => {
    const user = userEvent.setup();

    renderKbAttachmentsTable({
      activeType: KB_ATTACHMENT_TYPE.IMAGE,
      items: [
        createKbAttachmentItem({
          attachmentType: KB_ATTACHMENT_TYPE.IMAGE,
          payload: {
            content: {
              alt: "产品图",
              fileUrl: "https://example.com/product.png",
            },
            type: "image",
          },
          title: "产品图",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "查看图片 产品图" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("图片预览")).toBeInTheDocument();
  });

  it("opens video, link, and file attachments in a new window", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderKbAttachmentsTable({
      activeType: KB_ATTACHMENT_TYPE.VIDEO,
      items: [
        createKbAttachmentItem({
          attachmentType: KB_ATTACHMENT_TYPE.VIDEO,
          payload: {
            content: {
              coverUrl: "https://example.com/video-cover.png",
              fileName: "安装视频.mp4",
              fileUrl: "s5/msg/20260706/video.mp4",
            },
            type: "file",
          },
          title: "安装视频.mp4",
        }),
        createKbAttachmentItem({
          attachmentType: KB_ATTACHMENT_TYPE.LINK,
          payload: {
            content: {
              href: "https://example.com/article",
              title: "活动链接",
            },
            type: "h5",
          },
          title: "活动链接",
        }),
        createKbAttachmentItem({
          attachmentType: KB_ATTACHMENT_TYPE.FILE,
          payload: {
            content: {
              fileName: "产品手册.pdf",
              fileUrl: "https://example.com/manual.pdf",
            },
            type: "file",
          },
          title: "产品手册.pdf",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "播放视频 安装视频.mp4" }));
    await user.click(screen.getByRole("button", { name: "打开链接 活动链接" }));
    await user.click(screen.getByRole("button", { name: "打开文件 产品手册.pdf" }));

    expect(openSpy).toHaveBeenNthCalledWith(
      1,
      "https://b5.bokr.com.cn/s5/msg/20260706/video.mp4",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openSpy).toHaveBeenNthCalledWith(
      2,
      "https://example.com/article",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openSpy).toHaveBeenNthCalledWith(
      3,
      "https://example.com/manual.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("KbAttachmentsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows init state when attachment status is uninitialized", async () => {
    vi.mocked(getKbAttachmentStatus).mockResolvedValue({ initialized: false });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "立即启用" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "图片" })).not.toBeInTheDocument();
    expect(listKbAttachments).not.toHaveBeenCalled();
  });

  it("shows init loading when doc status is parsing", async () => {
    const user = userEvent.setup();

    vi.mocked(getKbAttachmentStatus).mockResolvedValue({ initialized: false });
    vi.mocked(listKbAttachments).mockResolvedValue({
      attachments: [],
      pagination: { page: 1, pageSize: 10, total: 0 },
    });
    vi.mocked(initKbAttachments).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      status: "parsing",
    });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "立即启用" }));

    expect(
      screen.getByRole("progressbar", { name: "附件库初始化进度" }),
    ).toBeInTheDocument();
    expect(initKbAttachments).toHaveBeenCalledWith("kb-1");
    expect(listKbAttachments).not.toHaveBeenCalled();
  });

  it("continues polling when existing attachment doc is still parsing on first load", async () => {
    vi.mocked(getKbAttachmentStatus)
      .mockResolvedValueOnce({
        docId: "doc-attachment-1",
        initialized: true,
        syncStatus: 3,
      })
      .mockResolvedValueOnce({
        docId: "doc-attachment-1",
        initialized: true,
        syncStatus: 0,
      });
    vi.mocked(listKbAttachments).mockResolvedValue({
      attachments: [],
      pagination: { page: 1, pageSize: 10, total: 0 },
    });
    vi.useFakeTimers();

    try {
      render(
        <KbAttachmentsTab
          activeType={KB_ATTACHMENT_TYPE.IMAGE}
          kbId="kb-1"
          onActiveTypeChange={vi.fn()}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(
        screen.getByRole("progressbar", { name: "附件库初始化进度" }),
      ).toBeInTheDocument();
      expect(listKbAttachments).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(getKbAttachmentStatus).toHaveBeenCalledTimes(2);
      expect(getKbAttachmentStatus).toHaveBeenLastCalledWith("kb-1");
      expect(listKbAttachments).toHaveBeenCalledWith("kb-1", expect.objectContaining({
        docId: "doc-attachment-1",
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows retry state when existing attachment doc failed on first load", async () => {
    vi.mocked(getKbAttachmentStatus).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      syncStatus: 1,
    });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(listKbAttachments).not.toHaveBeenCalled();
  });

  it("polls attachment status instead of init while attachment doc is syncing", async () => {
    vi.mocked(getKbAttachmentStatus)
      .mockResolvedValueOnce({ initialized: false })
      .mockResolvedValueOnce({ initialized: false })
      .mockResolvedValueOnce({
        docId: "doc-attachment-1",
        initialized: true,
        syncStatus: 3,
      });
    vi.mocked(initKbAttachments).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      status: "parsing",
    });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    const initializeButton = await screen.findByRole("button", { name: "立即启用" });
    vi.useFakeTimers();

    try {
      await act(async () => {
        fireEvent.click(initializeButton);
      });

      expect(initKbAttachments).toHaveBeenCalledTimes(1);
      expect(getKbAttachmentStatus).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(initKbAttachments).toHaveBeenCalledTimes(1);
      expect(getKbAttachmentStatus).toHaveBeenCalledTimes(3);
      expect(getKbAttachmentStatus).toHaveBeenLastCalledWith("kb-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails initialization when attachment doc remains invisible after timeout", async () => {
    vi.mocked(getKbAttachmentStatus).mockResolvedValue({ initialized: false });
    vi.mocked(initKbAttachments).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      status: "parsing",
    });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    const initializeButton = await screen.findByRole("button", { name: "立即启用" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T00:00:00.000Z"));

    try {
      await act(async () => {
        fireEvent.click(initializeButton);
      });

      vi.setSystemTime(new Date("2026-07-07T00:03:00.000Z"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(toast.error).toHaveBeenCalledWith("初始化失败，请稍后重试");
      expect(screen.getByRole("button", { name: "立即启用" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reload again after correcting an out-of-range page", async () => {
    const user = userEvent.setup();

    vi.mocked(getKbAttachmentStatus).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      syncStatus: 0,
    });
    vi.mocked(listKbAttachments)
      .mockResolvedValueOnce({
        attachments: [
          createKbAttachmentListItem({
            chunkId: "chunk-page-1",
            description: "第一页附件",
            title: "第一页附件",
          }),
        ],
        pagination: { page: 1, pageSize: 10, total: 11 },
      })
      .mockResolvedValueOnce({
        attachments: [],
        pagination: { page: 2, pageSize: 10, total: 0 },
      });

    render(
      <KbAttachmentsTab
        activeType={KB_ATTACHMENT_TYPE.IMAGE}
        kbId="kb-1"
        onActiveTypeChange={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: "下一页" });
    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(listKbAttachments).toHaveBeenCalledTimes(2);
    expect(listKbAttachments).toHaveBeenNthCalledWith(
      2,
      "kb-1",
      expect.objectContaining({ page: 2 }),
    );
  });
});

function renderKbAttachmentsTable({
  activeType,
  items,
}: {
  activeType: KbAttachmentItem["attachmentType"];
  items: KbAttachmentItem[];
}) {
  return render(
    <KbAttachmentsTable
      activeType={activeType}
      items={items}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onToggleSelectAll={vi.fn()}
      onToggleSelectItem={vi.fn()}
      selectedIds={[]}
    />,
  );
}

function createKbAttachmentItem(
  overrides: Partial<KbAttachmentItem> & Pick<KbAttachmentItem, "attachmentType" | "payload" | "title">,
): KbAttachmentItem {
  return {
    createdAt: new Date("2026-07-06T10:00:00+08:00").getTime(),
    description: "附件描述",
    id: `chunk-${overrides.title}`,
    ...overrides,
  };
}

function createKbAttachmentListItem(overrides: {
  chunkId: string;
  description: string;
  title: string;
}) {
  return {
    attachmentContent: {
      content: {
        alt: overrides.title,
        fileUrl: "https://example.com/product.png",
      },
      materialCollectionId: "mc-1",
      msgInfoId: "msg-1",
      type: "image" as const,
    },
    attachmentType: KB_ATTACHMENT_TYPE.IMAGE,
    chunkId: overrides.chunkId,
    createdAt: "2026-07-03 12:00:00",
    description: overrides.description,
    materialCollectionId: "mc-1",
    title: overrides.title,
    updatedAt: "2026-07-03 12:00:00",
  };
}
