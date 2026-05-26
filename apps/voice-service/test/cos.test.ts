import { describe, expect, it } from "vitest";
import { createCosClientFromEnv, fetchCosObject } from "../src/shared/cos.js";

describe("COS client credentials", () => {
  it("uses SCF runtime temporary credentials when available", () => {
    const client = createCosClientFromEnv({
      TENCENTCLOUD_SECRETID: "scf-secret-id",
      TENCENTCLOUD_SECRETKEY: "scf-secret-key",
      TENCENTCLOUD_SESSIONTOKEN: "scf-session-token",
    } as NodeJS.ProcessEnv);

    expect(client.options).toMatchObject({
      SecretId: "scf-secret-id",
      SecretKey: "scf-secret-key",
      XCosSecurityToken: "scf-session-token",
    });
  });

  it("keeps supporting manually configured permanent credentials", () => {
    const client = createCosClientFromEnv({
      TENCENT_SECRET_ID: "manual-secret-id",
      TENCENT_SECRET_KEY: "manual-secret-key",
    } as NodeJS.ProcessEnv);

    expect(client.options).toMatchObject({
      SecretId: "manual-secret-id",
      SecretKey: "manual-secret-key",
    });
  });

  it("treats an empty COS object body as an empty byte array", async () => {
    const client = {
      getObject: async () => ({
        Body: undefined,
        headers: {
          "content-length": "0",
          "content-type": "application/octet-stream",
        },
      }),
    };

    await expect(
      fetchCosObject(client as never, "scrm-msg-audit-1304132716", "ap-shanghai", "s5/voice/empty.amr"),
    ).resolves.toEqual({
      body: new Uint8Array(0),
      metadata: {
        contentLength: "0",
        contentType: "application/octet-stream",
      },
    });
  });

  it("keeps Uint8Array COS bodies as zero-copy views", async () => {
    const source = Buffer.from([1, 2, 3, 4]);
    const view = new Uint8Array(source.buffer, source.byteOffset + 1, 2);
    const client = {
      getObject: async () => ({
        Body: view,
        headers: {},
      }),
    };

    const result = await fetchCosObject(
      client as never,
      "scrm-msg-audit-1304132716",
      "ap-shanghai",
      "s5/voice/view.amr",
    );

    expect(result.body).toEqual(new Uint8Array([2, 3]));
    expect(result.body.buffer).toBe(view.buffer);
    expect(result.body.byteOffset).toBe(view.byteOffset);
    expect(result.body.byteLength).toBe(view.byteLength);
  });
});
