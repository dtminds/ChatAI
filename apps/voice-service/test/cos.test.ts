import { describe, expect, it } from "vitest";
import { createCosClientFromEnv } from "../src/shared/cos.js";

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
});
