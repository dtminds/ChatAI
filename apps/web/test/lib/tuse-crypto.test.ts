import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  encryptTuseAesCbcPkcs7Base64,
  encryptTuseFswFromThirdExternalUserId,
  encryptTuseRdFromThirdUserId,
  encryptTuseTsFromUnixSeconds,
} from "../../src/lib/tuse-crypto";

describe("tuse-crypto AES-256-CBC", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
      writable: true,
    });

    globalThis.btoa = (binary: string) => Buffer.from(binary, "latin1").toString("base64");
  });

  const tuseKey = "03A2056448BF1-BD0B89DE-10E2-4732-96E0-1D85B30731BF";
  const tuseIv = "03A2056448BF2-06C002FB-1688-4A2F-B25A-F20AD4C89CB2";
  const thirdExternalUserId =
    "FBCB888A7D21A2CEC18A2D2C665B51005194F219CF554649F1C4F9C615435A82";
  const thirdUserId =
    "73E453A96BB8A1A941C3AA6D13498D325194F219CF554649F1C4F9C615435A82";

  /** 手写密文里的空格替代了 Base64 的 `+` */
  function normalizeFixtureBase64(s: string): string {
    return s.replace(/\s/g, "+");
  }

  it("encrypts thirdExternalUserId to fsw Base64 cipher (raw id plaintext)", async () => {
    const expected =
      "Fwoqgeh6ZK9YA30ZH8Lj8Tapm/fYCNBGLeDXGqZinE4Wc7N1pSH1G4pr5zfoaY1d/e9KRhcYa7fVH3yUXdmBbqW/TBJWbUtKxIEFljtnoXc=";

    await expect(
      encryptTuseFswFromThirdExternalUserId(tuseKey, tuseIv, thirdExternalUserId),
    ).resolves.toBe(expected);

    await expect(
      encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdExternalUserId),
    ).resolves.toBe(expected);
  });

  it("encrypts thirdUserId to rd Base64 cipher (raw id plaintext)", async () => {
    const spacedFixture =
      "V6 dfexyzPJoQG 0Eb6ZB/irUvdV8y21/72CVTBtRQZsS38vfZCd7fQdSmR7YlQsmDYfxE58ZRywVdL1Srjzq/KARO f74JjXzQicqelUJo=";

    await expect(
      encryptTuseRdFromThirdUserId(tuseKey, tuseIv, thirdUserId),
    ).resolves.toBe(normalizeFixtureBase64(spacedFixture));

    await expect(encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdUserId)).resolves.toBe(
      normalizeFixtureBase64(spacedFixture),
    );
  });

  it("encrypts Unix seconds to ts Base64 cipher (decimal seconds plaintext)", async () => {
    const unixSeconds = 1735689600;

    await expect(
      encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, unixSeconds),
    ).resolves.toBe(await encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, String(unixSeconds)));
  });
});
