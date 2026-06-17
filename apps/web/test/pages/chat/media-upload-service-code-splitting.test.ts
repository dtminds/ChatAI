import { afterEach, describe, expect, it, vi } from "vitest";

const cosModuleLoadMock = vi.hoisted(() => vi.fn());

vi.mock("cos-js-sdk-v5", () => {
  cosModuleLoadMock();

  return {
    default: vi.fn(),
  };
});

describe("media upload service code splitting", () => {
  afterEach(() => {
    vi.resetModules();
    cosModuleLoadMock.mockClear();
  });

  it("does not import the COS SDK while loading the upload service module", async () => {
    await import("@/pages/chat/api/media-upload-service");

    expect(cosModuleLoadMock).not.toHaveBeenCalled();
  });
});
