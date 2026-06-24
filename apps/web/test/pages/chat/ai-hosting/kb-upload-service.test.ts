import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KbDocUploadCredentialResponse } from "@chatai/contracts";
import {
  uploadKbDocFileToCos,
  uploadKbImageToCos,
  uploadKbQaFileToCos,
} from "@/pages/chat/ai-hosting/api/kb-upload-service";

const requestMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/request", () => ({
  request: requestMock,
}));

vi.mock("cos-js-sdk-v5", () => ({
  default: cosConstructorMock,
}));

function createUploadCredential(
  overrides: Partial<KbDocUploadCredentialResponse> = {},
): KbDocUploadCredentialResponse {
  return {
    allowPerfixs: ["kb-docs/"],
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

describe("kb-upload-service", () => {
  beforeEach(() => {
    requestMock.mockReset();
    cosCancelTaskMock.mockReset();
    cosUploadFileMock.mockReset();
    cosConstructorMock.mockClear();
    vi.useRealTimers();
  });

  it("uploads kb documents to COS and returns object path and public url", async () => {
    const credential = createUploadCredential();
    requestMock.mockResolvedValue({ data: credential });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    const file = new File(["demo"], "产品手册.pdf", {
      type: "application/pdf",
    });
    const result = await uploadKbDocFileToCos(file);

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/server/ai-hosting/kb-docs/upload-credential",
    });
    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: file,
        Bucket: credential.bucket,
        ContentType: "application/pdf",
        Key: "kb-docs/1778659200000-4fzyo82m.pdf",
        Region: credential.region,
        SliceSize: 1024 * 1024,
      }),
    );
    expect(result).toEqual({
      docUrl: "kb-docs/1778659200000-4fzyo82m.pdf",
      url: "https://b5.bokr.com.cn/kb-docs/1778659200000-4fzyo82m.pdf",
    });
  });

  it("uploads kb images to COS and returns object path and public url", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["kb-images/"],
    });
    requestMock.mockResolvedValue({ data: credential });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    const file = new File(["demo"], "封面.png", {
      type: "image/png",
    });
    const result = await uploadKbImageToCos(file);

    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: file,
        ContentType: "image/png",
        Key: "kb-images/1778659200000-4fzyo82m.png",
      }),
    );
    expect(result).toEqual({
      docUrl: "kb-images/1778659200000-4fzyo82m.png",
      url: "https://b5.bokr.com.cn/kb-images/1778659200000-4fzyo82m.png",
    });
  });

  it("uploads kb qa files to COS and preserves the faq.xlsx suffix", async () => {
    const credential = createUploadCredential({
      allowPerfixs: ["kb-faqs/"],
    });
    requestMock.mockResolvedValue({ data: credential });
    vi.setSystemTime(new Date("2026-05-13T08:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    cosUploadFileMock.mockImplementation(async (params) => ({
      ETag: '"mock-etag"',
      Location: `${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`,
    }));

    const file = new File(["demo"], "快捷话术导入.faq.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const result = await uploadKbQaFileToCos(file);

    expect(cosUploadFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Body: file,
        ContentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Key: "kb-faqs/1778659200000-4fzyo82m.faq.xlsx",
      }),
    );
    expect(result).toEqual({
      docUrl: "kb-faqs/1778659200000-4fzyo82m.faq.xlsx",
      url: "https://b5.bokr.com.cn/kb-faqs/1778659200000-4fzyo82m.faq.xlsx",
    });
  });
});
