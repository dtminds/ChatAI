import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestNormalizedError } from "@/lib/request";
import {
  isKbAttachmentNotInitialized,
  listKbAttachments,
  initKbAttachments,
} from "@/pages/chat/ai-hosting/api/kb-attachment-service";
import { KbAttachmentsTab } from "@/pages/chat/ai-hosting/kb-components/kb-attachments-tab";
import {
  isKbLocalUploadedImageMaterial,
  toKbAttachmentContent,
  toKbAttachmentItem,
  toQuickReplyDraftAttachment,
} from "@/pages/chat/ai-hosting/kb-components/kb-attachment-types";

vi.mock("@/pages/chat/ai-hosting/api/kb-attachment-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/pages/chat/ai-hosting/api/kb-attachment-service")
  >();

  return {
    ...actual,
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

describe("isKbAttachmentNotInitialized", () => {
  it("detects the not initialized error code", () => {
    const error = new RequestNormalizedError({
      code: "KB_ATTACHMENT_NOT_INITIALIZED",
      message: "请先初始化附件库",
      status: 404,
    });

    expect(isKbAttachmentNotInitialized(error)).toBe(true);
    expect(
      isKbAttachmentNotInitialized(
        new RequestNormalizedError({
          code: "KB_CHUNK_NOT_FOUND",
          message: "附件不存在",
          status: 404,
        }),
      ),
    ).toBe(false);
  });
});

describe("KbAttachmentsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows init state when attachment list returns not initialized", async () => {
    vi.mocked(listKbAttachments).mockRejectedValue(
      new RequestNormalizedError({
        code: "KB_ATTACHMENT_NOT_INITIALIZED",
        message: "请先初始化附件库",
        status: 404,
      }),
    );

    render(<KbAttachmentsTab kbId="kb-1" />);

    expect(await screen.findByRole("button", { name: "开始初始化" })).toBeInTheDocument();
  });

  it("shows init loading when doc status is parsing", async () => {
    const user = userEvent.setup();

    vi.mocked(listKbAttachments)
      .mockRejectedValueOnce(
        new RequestNormalizedError({
          code: "KB_ATTACHMENT_NOT_INITIALIZED",
          message: "请先初始化附件库",
          status: 404,
        }),
      )
      .mockResolvedValue({
        attachments: [],
        pagination: { page: 1, pageSize: 10, total: 0 },
      });
    vi.mocked(initKbAttachments).mockResolvedValue({
      docId: "doc-attachment-1",
      initialized: true,
      status: "parsing",
    });

    render(<KbAttachmentsTab kbId="kb-1" />);

    await user.click(await screen.findByRole("button", { name: "开始初始化" }));

    expect(
      screen.getByRole("progressbar", { name: "附件库初始化进度" }),
    ).toBeInTheDocument();
    expect(initKbAttachments).toHaveBeenCalledWith("kb-1");
    expect(listKbAttachments).toHaveBeenCalledTimes(1);
  });
});
