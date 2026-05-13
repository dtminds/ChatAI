import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchUploadCredentialResponse } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";

const cosUploadFileMock = vi.hoisted(() => vi.fn());
const cosConstructorMock = vi.hoisted(() =>
  vi.fn(function CosMock() {
    return {
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

describe("resolveImageSegmentsForSend", () => {
  beforeEach(() => {
    resetWorkbenchService();
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
  });
});
