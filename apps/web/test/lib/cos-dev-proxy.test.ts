import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCosDevProxyClientOptions,
  buildCosSignHost,
  createCosClientOptions,
  COS_DEV_PROXY_PREFIX,
  isCosDevProxyEnabled,
} from "@/lib/cos-dev-proxy";

const credential = {
  bucket: "examplebucket-1250000000",
  credentials: {
    sessionToken: "session-token",
    tmpSecretId: "tmp-secret-id",
    tmpSecretKey: "tmp-secret-key",
  },
  expiredTime: 1778673600,
  region: "ap-guangzhou",
  startTime: 1778670000,
};

const getAuthorizationMock = vi.fn(() => "signed-authorization");

const COS = {
  getAuthorization: getAuthorizationMock,
} as never;

describe("cos-dev-proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getAuthorizationMock.mockClear();
  });

  it("disables proxy in test mode", () => {
    vi.stubEnv("MODE", "test");

    expect(isCosDevProxyEnabled()).toBe(false);
    expect(createCosClientOptions(COS, credential)).toEqual({
      ExpiredTime: credential.expiredTime,
      SecretId: "tmp-secret-id",
      SecretKey: "tmp-secret-key",
      SecurityToken: "session-token",
      StartTime: credential.startTime,
    });
  });

  it("signs every request with the real cos host in development", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", {
      location: {
        host: "localhost:8086",
        protocol: "http:",
      },
    });

    const config = applyCosDevProxyClientOptions(COS, credential, {
      SecretId: "tmp-secret-id",
      SecretKey: "tmp-secret-key",
    });

    expect(config.Domain).toBe(
      `localhost:8086${COS_DEV_PROXY_PREFIX}/{Bucket}.cos.{Region}.myqcloud.com`,
    );
    expect(config.getAuthorization).toBeTypeOf("function");

    const callback = vi.fn();
    config.getAuthorization?.(
      {
        Bucket: credential.bucket,
        Headers: {},
        Key: "",
        Method: "GET",
        Pathname: "/",
        Query: {
          prefix: "s5/upload/demo.pdf",
          uploads: "",
        },
        Region: credential.region,
        Scope: [],
        SystemClockOffset: 0,
      },
      callback,
    );

    expect(getAuthorizationMock).toHaveBeenCalledWith({
      Headers: {
        Host: buildCosSignHost(credential),
      },
      KeyTime: "1778670000;1778673600",
      Method: "GET",
      Pathname: "/",
      Query: {
        prefix: "s5/upload/demo.pdf",
        uploads: "",
      },
      SecretId: "tmp-secret-id",
      SecretKey: "tmp-secret-key",
    });
    expect(callback).toHaveBeenCalledWith({
      Authorization: "signed-authorization",
      SecurityToken: "session-token",
    });
  });
});
