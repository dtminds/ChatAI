import { createCipheriv } from "node:crypto";

/**
 * 侧栏 rd / fsw / ts 密文与 Java 端 AES/CBC/PKCS5Padding 对齐；密钥材料规则见本文件 `deriveTuse*`。
 */

export function deriveTuseAes256KeyBytes(aesKeyUtf8Secret: string): Buffer {
  return utf8SliceToFixedLength(aesKeyUtf8Secret.trim(), 32);
}

export function deriveTuseAesIvBytes(aesIvUtf8Secret: string): Buffer {
  return utf8SliceToFixedLength(aesIvUtf8Secret.trim(), 16);
}

function utf8SliceToFixedLength(secret: string, outLength: number): Buffer {
  const src = Buffer.from(secret, "utf8");
  const out = Buffer.alloc(outLength);
  src.copy(out, 0, 0, Math.min(src.length, outLength));
  return out;
}

export type TuseCryptoMaterial = {
  iv: Buffer;
  key: Buffer;
};

export function createTuseCryptoMaterial(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
): TuseCryptoMaterial {
  return {
    key: deriveTuseAes256KeyBytes(aesKeyUtf8Secret),
    iv: deriveTuseAesIvBytes(aesIvUtf8Secret),
  };
}

export function encryptTuseAesCbcPkcs7Base64WithMaterial(
  material: TuseCryptoMaterial,
  plaintextUtf8: string,
): string {
  const cipher = createCipheriv("aes-256-cbc", material.key, material.iv);
  return Buffer.concat([cipher.update(plaintextUtf8, "utf8"), cipher.final()]).toString("base64");
}

export function encryptTuseAesCbcPkcs7Base64(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  plaintextUtf8: string,
): string {
  return encryptTuseAesCbcPkcs7Base64WithMaterial(
    createTuseCryptoMaterial(aesKeyUtf8Secret, aesIvUtf8Secret),
    plaintextUtf8,
  );
}

export type SidebarIframeTuseCipherTexts = {
  fsw?: string;
  rd?: string;
  ts: string;
  thirdGroupId?: string;
  thirdGroupName?: string;
};

/** 使用同一组密钥材料签发 rd / fsw / ts，避免重复派生 key 与 IV */
export function buildSidebarIframeTuseCipherTexts(input: {
  aesIvUtf8Secret: string;
  aesKeyUtf8Secret: string;
  thirdExternalUserId?: string;
  thirdGroupId?: string;
  thirdGroupName?: string;
  thirdUserId?: string;
  unixSeconds: number;
}): SidebarIframeTuseCipherTexts {
  const material = createTuseCryptoMaterial(input.aesKeyUtf8Secret, input.aesIvUtf8Secret);
  const encrypt = (plaintextUtf8: string) =>
    encryptTuseAesCbcPkcs7Base64WithMaterial(material, plaintextUtf8);
  const thirdUserId = input.thirdUserId?.trim() ?? "";
  const thirdExternalUserId = input.thirdExternalUserId?.trim() ?? "";
  const thirdGroupId = input.thirdGroupId?.trim() ?? "";
  const thirdGroupName = input.thirdGroupName?.trim() ?? "";

  return {
    ...(thirdUserId ? { rd: encrypt(thirdUserId) } : {}),
    ...(thirdExternalUserId ? { fsw: encrypt(thirdExternalUserId) } : {}),
    ...(thirdGroupId
      ? {
          thirdGroupId: encrypt(thirdGroupId),
          thirdGroupName: encrypt(thirdGroupName || thirdGroupId),
        }
      : {}),
    ts: encrypt(String(Math.trunc(input.unixSeconds))),
  };
}

export function encryptTuseRdFromThirdUserId(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  thirdUserId: string,
): string {
  return encryptTuseAesCbcPkcs7Base64(aesKeyUtf8Secret, aesIvUtf8Secret, thirdUserId);
}

export function encryptTuseFswFromThirdExternalUserId(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  thirdExternalUserId: string,
): string {
  return encryptTuseAesCbcPkcs7Base64(aesKeyUtf8Secret, aesIvUtf8Secret, thirdExternalUserId);
}

export function encryptTuseTsFromUnixSeconds(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  unixSeconds: number,
): string {
  return encryptTuseAesCbcPkcs7Base64(
    aesKeyUtf8Secret,
    aesIvUtf8Secret,
    String(Math.trunc(unixSeconds)),
  );
}
