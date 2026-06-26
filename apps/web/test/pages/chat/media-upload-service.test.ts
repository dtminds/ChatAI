import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { WorkbenchUploadCredentialResponse } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import {
  isLocalImageSegment,
  resolveImageSegmentsForSend,
  uploadWorkbenchFile,
} from "@/pages/chat/api/media-upload-service";

const cosUploadFileMock = vi.hoisted(() => vi.fn());
const cosCancelTaskMock = vi.hoisted(() => vi.fn());
const cosConstructorMock = vi.hoisted(() =>
  vi.fn(function CosMock() {
    return {
      cancelTask: cosCancelTaskMock,
      uploadFile: cosUploadFileMock,
    };
  }),
);

vi.mock("cos-js-sdk-v5", () => ({
  default: cosConstructorMock,
}));

function createUploadCredential(
  overrides: Partial<WorkbenchUploadCredentialResponse> = {},
): WorkbenchUploadCredentialResponse {
  return {
    allowPerfixs: ["chat-images/"],
    bucket: "mock-bucket-1250000000",
    credentials: {
      sessionToken: "mock-session-token",
      tmpSecretId: "mock-tmp-secret-id",
      tmpSecretKey: "mock-tmp-secret-key",
    },
    expiration: "2026-05-13T12:00:00Z",
    expiredTime: 1778673600,
    region: "ap-guangzhou",
    requestId: "mock-request-id",
    startTime: 1778670000,
    ...overrides,
  };
}

describe("isLocalImageSegment", () => {
  it("returns true for image segments that still need upload", () => {
    expect(
      isLocalImageSegment({
        alt: "截图",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      }),
    ).toBe(true);
  });

  it("returns false for collected image segments with a remote url only", () => {
    expect(
      isLocalImageSegment({
        alt: "商品图",
        imageUrl: "https://cdn.example.com/product.png",
        materialCollectionId: "material-image-001",
        type: "image",
        url: "https://cdn.example.com/product.png",
      }),
    ).toBe(false);
  });

  it("returns false for image segments that already have a remote url", () => {
    expect(
      isLocalImageSegment({
        alt: "截图",
        localUrl: "blob:preview",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
      }),
    ).toBe(false);
  });
});

describe("resolveImageSegmentsForSend", () => {
  beforeEach(() => {
    resetWorkbenchService();
    cosCancelTaskMock.mockReset();
    cosUploadFileMock.mockReset();
    cosConstructorMock.mockClear();
    vi.useRealTimers();
  });

  it("uploads local image segments to COS and returns remote image segments", async () => {
    const credential = createUploadCredential();
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    const segments = await resolveImageSegmentsForSend("conv-001", [
      {
        text: "看这个",
        type: "text",
      },
      {
        alt: "截图",
        height: 240,
        localUrl: "data:image/png;base64,aGVsbG8=",
        type: "image",
        width: 320,
      },
    ]);

    expect(getUploadCredential).toHaveBeenCalledTimes(1);
    expect(getUploadCredential).toHaveBeenCalledWith("conv-001");
    expect(cosConstructorMock).toHaveBeenCalledWith({
      ExpiredTime: credential.expiredTime,
      SecretId: credential.credentials.tmpSecretId,
      SecretKey: credential.credentials.tmpSecretKey,
      SecurityToken: credential.credentials.sessionToken,
      StartTime: credential.startTime,
    });
    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: expect.any(Blob),
        Bucket: credential.bucket,
        ContentType: "image/png",
        Key: "chat-images/1778659200000-4fzyo82m.png",
        Region: credential.region,
        SliceSize: 1024 * 1024,
      }),
    );
    expect(segments).toEqual([
      {
        text: "看这个",
        type: "text",
      },
      {
        alt: "截图",
        fileId: "chat-images/1778659200000-4fzyo82m.png",
        height: 240,
        type: "image",
        url: "https://b5.bokr.com.cn/chat-images/1778659200000-4fzyo82m.png",
        width: 320,
      },
    ]);
  });

  it("uploads composer-exported images whose url is still the local data URL", async () => {
    const credential = createUploadCredential();
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    const dataUrl = "data:image/png;base64,aGVsbG8=";
    const segments = await resolveImageSegmentsForSend("conv-001", [
      {
        alt: "截图",
        localUrl: dataUrl,
        type: "image",
        url: dataUrl,
      },
    ]);

    expect(getUploadCredential).toHaveBeenCalledTimes(1);
    expect(cosUploadFileMock).toHaveBeenCalledTimes(1);
    expect(segments[0]).toMatchObject({
      alt: "截图",
      fileId: expect.stringMatching(/^chat-images\/.+\.png$/),
      type: "image",
      url: expect.stringMatching(
        /^https:\/\/b5\.bokr\.com\.cn\/chat-images\/.+\.png$/,
      ),
    });
  });

  it("uses the credential upload prefix without appending the conversation id", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["s5/upload/2026/05/13//272/"],
      bucket: "scrm-msg-audit-1304132716",
      region: "ap-shanghai",
    });
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    await resolveImageSegmentsForSend("85", [
      {
        alt: "截图",
        localUrl: "data:image/png;base64,aGVsbG8=",
        type: "image",
      },
    ]);

    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: "s5/upload/2026/05/13/272/1778659200000-4fzyo82m.png",
      }),
    );
  });

  it("uploads multiple local image segments in parallel", async () => {
    const credential = createUploadCredential();
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);
    const firstUpload = createDeferred();
    const secondUpload = createDeferred();

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    cosUploadFileMock
      .mockImplementationOnce(() => firstUpload.promise)
      .mockImplementationOnce(() => secondUpload.promise);

    const resultPromise = resolveImageSegmentsForSend("conv-001", [
      {
        alt: "截图 A",
        localUrl: "data:image/png;base64,YQ==",
        type: "image",
      },
      {
        alt: "截图 B",
        localUrl: "data:image/png;base64,Yg==",
        type: "image",
      },
    ]);

    await waitFor(() => {
      expect(cosUploadFileMock).toHaveBeenCalledTimes(2);
    });

    firstUpload.resolve({ ETag: '"mock-etag-a"' });
    secondUpload.resolve({ ETag: '"mock-etag-b"' });

    await expect(resultPromise).resolves.toHaveLength(2);
    expect(getUploadCredential).toHaveBeenCalledTimes(1);
  });

  it("does not request credentials for text-only segments", async () => {
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(baseService.getUploadCredential);

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });

    await expect(
      resolveImageSegmentsForSend("conv-001", [
        {
          text: "纯文本",
          type: "text",
        },
      ]),
    ).resolves.toEqual([
      {
        text: "纯文本",
        type: "text",
      },
    ]);
    expect(getUploadCredential).not.toHaveBeenCalled();
    expect(cosUploadFileMock).not.toHaveBeenCalled();
    expect(cosConstructorMock).not.toHaveBeenCalled();
  });

  it("does not re-upload image segments that already have remote URLs", async () => {
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(baseService.getUploadCredential);
    const segments = [
      {
        alt: "已上传图片",
        clientId: "composer-image-001",
        fileId: "chat-images/uploaded.png",
        localUrl: "data:image/png;base64,aGVsbG8=",
        type: "image" as const,
        url: "https://b5.bokr.com.cn/chat-images/uploaded.png",
      },
    ];

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });

    await expect(
      resolveImageSegmentsForSend("conv-001", segments),
    ).resolves.toEqual(segments);
    expect(getUploadCredential).not.toHaveBeenCalled();
    expect(cosUploadFileMock).not.toHaveBeenCalled();
    expect(cosConstructorMock).not.toHaveBeenCalled();
  });

  it("uploads a selected file to COS and returns a sendable file segment", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["s5/upload/2026/05/13/272/"],
    });
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async () => ({
      ETag: '"mock-etag"',
    }));

    await expect(uploadWorkbenchFile("conv-001", file)).resolves.toMatchObject({
      extension: "pdf",
      fileId: "s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
      fileName: "报价单.pdf",
      fileSize: file.size,
      fileSizeLabel: "10 B",
      type: "file",
      url: "https://b5.bokr.com.cn/s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
    });
    expect(getUploadCredential).toHaveBeenCalledWith("conv-001");
    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: file,
        ContentType: "application/pdf",
        Key: "s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
      }),
    );
  });

  it("cancels the COS upload task when the file upload signal aborts", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["s5/upload/2026/05/13/272/"],
    });
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });
    const upload = createDeferred();
    const abortController = new AbortController();

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    cosUploadFileMock.mockImplementation((params) => {
      params.onTaskReady?.("cos-task-001");
      return upload.promise;
    });

    const uploadPromise = uploadWorkbenchFile("conv-001", file, {
      signal: abortController.signal,
    });

    await waitFor(() => {
      expect(cosUploadFileMock).toHaveBeenCalledTimes(1);
    });

    abortController.abort();

    expect(cosCancelTaskMock).toHaveBeenCalledWith("cos-task-001");
    upload.reject(new DOMException("文件上传已取消", "AbortError"));
    await expect(uploadPromise).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("derives the COS object extension from MIME type when the file name has no extension", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["s5/upload/2026/05/13/272/"],
    });
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);
    const file = new File(["file-bytes"], "报价单", {
      type: "application/pdf",
    });

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async () => ({
      ETag: '"mock-etag"',
    }));

    await expect(uploadWorkbenchFile("conv-001", file)).resolves.toMatchObject({
      extension: "pdf",
      fileId: "s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
      url: "https://b5.bokr.com.cn/s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
    });
    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: "s5/upload/2026/05/13/272/1778659200000-4fzyo82m.pdf",
      }),
    );
  });

  it("formats uploaded file sizes in GB", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["s5/upload/2026/05/13/272/"],
    });
    const baseService = createMockWorkbenchService();
    const getUploadCredential = vi.fn(async () => credential);
    const file = new File(["file-bytes"], "large-video.mov", {
      type: "video/quicktime",
    });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: 3 * 1024 * 1024 * 1024,
    });

    setWorkbenchService({
      ...baseService,
      getUploadCredential,
    });
    cosUploadFileMock.mockImplementation(async () => ({
      ETag: '"mock-etag"',
    }));

    await expect(uploadWorkbenchFile("conv-001", file)).resolves.toMatchObject({
      fileSizeLabel: "3.00 GB",
    });
  });
});

function createDeferred<T = unknown>() {
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
