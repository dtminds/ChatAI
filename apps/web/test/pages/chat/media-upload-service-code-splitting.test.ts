import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchUploadCredentialResponse } from "@chatai/contracts";

const MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE = "MEDIA_UPLOAD_SDK_LOAD_FAILED";

const cosModuleLoadMock = vi.hoisted(() => vi.fn());
const cosUploadFileMock = vi.hoisted(() => vi.fn());
const cosConstructorMock = vi.hoisted(() =>
  vi.fn(function CosMock() {
    return {
      uploadFile: cosUploadFileMock,
    };
  }),
);
const getUploadCredentialMock = vi.hoisted(() => vi.fn());

vi.mock("@/pages/chat/api/workbench-gateway", () => ({
  getUploadCredential: getUploadCredentialMock,
}));

describe("media upload service code splitting", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("cos-js-sdk-v5");
    cosModuleLoadMock.mockClear();
    cosUploadFileMock.mockReset();
    cosConstructorMock.mockClear();
    getUploadCredentialMock.mockReset();
    vi.useRealTimers();
  });

  it("does not import the COS SDK while loading the upload service module", async () => {
    await import("@/pages/chat/api/media-upload-service");

    expect(cosModuleLoadMock).not.toHaveBeenCalled();
  });

  it("imports the COS SDK when uploading a file for the first time", async () => {
    mockCosSdkLoadSuccess();
    const credential = createUploadCredential({
      allowPerfixs: ["chat-files/"],
    });
    const { uploadWorkbenchFile } = await import(
      "@/pages/chat/api/media-upload-service"
    );
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });

    getUploadCredentialMock.mockResolvedValue(credential);
    cosUploadFileMock.mockResolvedValue({ ETag: '"mock-etag"' });

    await uploadWorkbenchFile("conv-001", file);

    expect(cosModuleLoadMock).toHaveBeenCalledTimes(1);
    expect(cosConstructorMock).toHaveBeenCalledTimes(1);
    expect(cosUploadFileMock).toHaveBeenCalledTimes(1);
  });

  it("classifies COS SDK chunk load failures before uploading", async () => {
    vi.doMock("cos-js-sdk-v5", () => {
      cosModuleLoadMock();
      throw new Error("Failed to fetch dynamically imported module");
    });
    const credential = createUploadCredential({
      allowPerfixs: ["chat-files/"],
    });
    const { uploadWorkbenchFile } = await import(
      "@/pages/chat/api/media-upload-service"
    );
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });

    getUploadCredentialMock.mockResolvedValue(credential);

    await expect(uploadWorkbenchFile("conv-001", file)).rejects.toMatchObject({
      code: MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
      message: "上传组件加载失败，请刷新页面后重试",
    });
    expect(cosModuleLoadMock).toHaveBeenCalledTimes(1);
    expect(cosConstructorMock).not.toHaveBeenCalled();
    expect(cosUploadFileMock).not.toHaveBeenCalled();
  });

  it("classifies cause-only COS SDK chunk load failures before uploading", async () => {
    vi.doMock("cos-js-sdk-v5", () => {
      cosModuleLoadMock();
      throw {
        cause: new Error("Failed to fetch dynamically imported module"),
      };
    });
    const credential = createUploadCredential({
      allowPerfixs: ["chat-files/"],
    });
    const { uploadWorkbenchFile } = await import(
      "@/pages/chat/api/media-upload-service"
    );
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });

    getUploadCredentialMock.mockResolvedValue(credential);

    await expect(uploadWorkbenchFile("conv-001", file)).rejects.toMatchObject({
      code: MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
      message: "上传组件加载失败，请刷新页面后重试",
    });
    expect(cosModuleLoadMock).toHaveBeenCalledTimes(1);
    expect(cosConstructorMock).not.toHaveBeenCalled();
    expect(cosUploadFileMock).not.toHaveBeenCalled();
  });

  it("classifies plain-object COS SDK chunk load failures before uploading", async () => {
    vi.doMock("cos-js-sdk-v5", () => {
      cosModuleLoadMock();
      throw {
        message: "Failed to fetch dynamically imported module",
      };
    });
    const credential = createUploadCredential({
      allowPerfixs: ["chat-files/"],
    });
    const { uploadWorkbenchFile } = await import(
      "@/pages/chat/api/media-upload-service"
    );
    const file = new File(["file-bytes"], "报价单.pdf", {
      type: "application/pdf",
    });

    getUploadCredentialMock.mockResolvedValue(credential);

    await expect(uploadWorkbenchFile("conv-001", file)).rejects.toMatchObject({
      code: MEDIA_UPLOAD_SDK_LOAD_FAILED_CODE,
      message: "上传组件加载失败，请刷新页面后重试",
    });
    expect(cosModuleLoadMock).toHaveBeenCalledTimes(1);
    expect(cosConstructorMock).not.toHaveBeenCalled();
    expect(cosUploadFileMock).not.toHaveBeenCalled();
  });
});

function mockCosSdkLoadSuccess() {
  vi.doMock("cos-js-sdk-v5", () => {
    cosModuleLoadMock();

    return {
      default: cosConstructorMock,
    };
  });
}

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
