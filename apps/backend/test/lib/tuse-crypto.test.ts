import { describe, expect, it } from "vitest";

import {
  buildSidebarIframeTuseCipherTexts,
  encryptTuseAesCbcPkcs7Base64,
  encryptTuseFswFromThirdExternalUserId,
  encryptTuseRdFromThirdUserId,
  encryptTuseTsFromUnixSeconds,
} from "../../src/lib/tuse-crypto.js";

describe("tuse-crypto AES-256-CBC", () => {
  const tuseKey = "03A2056448BF1-BD0B89DE-10E2-4732-96E0-1D85B30731BF";
  const tuseIv = "03A2056448BF2-06C002FB-1688-4A2F-B25A-F20AD4C89CB2";
  const thirdExternalUserId =
    "FBCB888A7D21A2CEC18A2D2C665B51005194F219CF554649F1C4F9C615435A82";
  const thirdUserId =
    "73E453A96BB8A1A941C3AA6D13498D325194F219CF554649F1C4F9C615435A82";

  function normalizeFixtureBase64(value: string): string {
    return value.replace(/\s/g, "+");
  }

  it("encrypts thirdExternalUserId to fsw Base64 cipher (raw id plaintext)", () => {
    const expected =
      "Fwoqgeh6ZK9YA30ZH8Lj8Tapm/fYCNBGLeDXGqZinE4Wc7N1pSH1G4pr5zfoaY1d/e9KRhcYa7fVH3yUXdmBbqW/TBJWbUtKxIEFljtnoXc=";

    expect(encryptTuseFswFromThirdExternalUserId(tuseKey, tuseIv, thirdExternalUserId)).toBe(
      expected,
    );
    expect(encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdExternalUserId)).toBe(expected);
  });

  it("encrypts thirdUserId to rd Base64 cipher (raw id plaintext)", () => {
    const spacedFixture =
      "V6 dfexyzPJoQG 0Eb6ZB/irUvdV8y21/72CVTBtRQZsS38vfZCd7fQdSmR7YlQsmDYfxE58ZRywVdL1Srjzq/KARO f74JjXzQicqelUJo=";
    const expected = normalizeFixtureBase64(spacedFixture);

    expect(encryptTuseRdFromThirdUserId(tuseKey, tuseIv, thirdUserId)).toBe(expected);
    expect(encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdUserId)).toBe(expected);
  });

  it("encrypts Unix seconds to ts Base64 cipher (decimal seconds plaintext)", () => {
    const unixSeconds = 1735689600;

    expect(encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, unixSeconds)).toBe(
      encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, String(unixSeconds)),
    );
  });

  it("builds sidebar iframe cipher texts with a single key/iv derivation", () => {
    const unixSeconds = 1735689600;

    expect(
      buildSidebarIframeTuseCipherTexts({
        aesIvUtf8Secret: tuseIv,
        aesKeyUtf8Secret: tuseKey,
        thirdExternalUserId,
        thirdUserId,
        unixSeconds,
      }),
    ).toEqual({
      fsw: encryptTuseFswFromThirdExternalUserId(tuseKey, tuseIv, thirdExternalUserId),
      rd: encryptTuseRdFromThirdUserId(tuseKey, tuseIv, thirdUserId),
      ts: encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, unixSeconds),
    });
  });

  it("encrypts group identifiers for sidebar iframe params", () => {
    const unixSeconds = 1735689600;
    const thirdGroupId = "group-001";
    const thirdGroupName = "测试群002";

    expect(
      buildSidebarIframeTuseCipherTexts({
        aesIvUtf8Secret: tuseIv,
        aesKeyUtf8Secret: tuseKey,
        thirdGroupId,
        thirdGroupName,
        thirdUserId,
        unixSeconds,
      }),
    ).toEqual({
      rd: encryptTuseRdFromThirdUserId(tuseKey, tuseIv, thirdUserId),
      thirdGroupId: encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdGroupId),
      thirdGroupName: encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdGroupName),
      ts: encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, unixSeconds),
    });
  });

  it("always encrypts thirdGroupName when only thirdGroupId is available", () => {
    const unixSeconds = 1735689600;
    const thirdGroupId = "group-001";

    expect(
      buildSidebarIframeTuseCipherTexts({
        aesIvUtf8Secret: tuseIv,
        aesKeyUtf8Secret: tuseKey,
        thirdGroupId,
        thirdUserId,
        unixSeconds,
      }),
    ).toEqual({
      rd: encryptTuseRdFromThirdUserId(tuseKey, tuseIv, thirdUserId),
      thirdGroupId: encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdGroupId),
      thirdGroupName: encryptTuseAesCbcPkcs7Base64(tuseKey, tuseIv, thirdGroupId),
      ts: encryptTuseTsFromUnixSeconds(tuseKey, tuseIv, unixSeconds),
    });
  });
});
