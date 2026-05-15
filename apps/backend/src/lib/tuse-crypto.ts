import { createCipheriv } from "node:crypto";

/**
 * 侧栏 rd / fsw / ts 密文与 Java 端 AES/CBC/PKCS5Padding 对齐（与 web `tuse-crypto` 同规则）。
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

export function encryptTuseAesCbcPkcs7Base64(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  plaintextUtf8: string,
): string {
  const key = deriveTuseAes256KeyBytes(aesKeyUtf8Secret);
  const iv = deriveTuseAesIvBytes(aesIvUtf8Secret);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([cipher.update(plaintextUtf8, "utf8"), cipher.final()]).toString("base64");
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
