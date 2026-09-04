import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJavaSmpEmbedDecryptPort,
  SMP_EMBED_AES_DECRYPT_PATH,
} from "../../../src/modules/auth/smp-embed-decrypt-port.js";

describe("Java SMP embed decrypt port", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("decrypts cipher text through the Java internal API", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal/");
    vi.stubEnv("JAVA_INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: "101",
      error: 0,
      errorMsg: "",
      success: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const port = createJavaSmpEmbedDecryptPort();

    await expect(port.decrypt("enc-id")).resolves.toBe("101");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`https://java.internal${SMP_EMBED_AES_DECRYPT_PATH}`);
    expect(init).toMatchObject({
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ content: "enc-id" });
  });

  it("requires the authoritative Java success flag", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: "101",
      error: 62001,
      errorMsg: "cipher is invalid",
      success: false,
    }), { status: 200 })));
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const port = createJavaSmpEmbedDecryptPort(logger);

    await expect(port.decrypt("enc-id")).rejects.toMatchObject({
      code: "SMP_EMBED_DECRYPT_INTERNAL_API_FAILED",
      details: {
        error: 62001,
        errorMsg: "cipher is invalid",
        operation: "smp-embed-aes-decrypt",
      },
      statusCode: 502,
    });
    expect(logger.error).toHaveBeenCalledWith({
      error: 62001,
      errorMsg: "cipher is invalid",
      operation: "smp-embed-aes-decrypt",
    }, "内部接口业务失败");
  });

  it("rejects empty decrypted data from a successful Java response", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: "  ",
      error: 0,
      errorMsg: "",
      success: true,
    }), { status: 200 })));
    const port = createJavaSmpEmbedDecryptPort();

    await expect(port.decrypt("enc-id")).rejects.toMatchObject({
      code: "SMP_EMBED_DECRYPT_INTERNAL_API_FAILED",
      statusCode: 502,
    });
  });

  it("fails when the Java internal API is not configured", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "");
    const port = createJavaSmpEmbedDecryptPort();

    await expect(port.decrypt("enc-id")).rejects.toMatchObject({
      code: "SMP_EMBED_DECRYPT_INTERNAL_API_NOT_CONFIGURED",
      statusCode: 503,
    });
  });
});
