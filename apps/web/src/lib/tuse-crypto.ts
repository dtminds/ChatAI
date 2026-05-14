/**
 * 侧栏 rd / fsw / ts 密文与 Java 端 AES/CBC/PKCS5Padding 对齐（PKCS5 与 PKCS7 对 AES 等价）。
 *
 * ## 密钥与 IV（与 `.env.example`、Java 保持一致）
 *
 * `VITE_TUSE_AES_KEY`、`VITE_TUSE_AES_IV` 为可读字符串；
 * **分别取其 UTF-8 字节**，若不足则右侧以 `0x00` 填充，超长则截取：
 * - 密钥材料固定 **32 字节** → AES-256
 * - IV 固定 **16 字节**
 *
 * ## 明文
 *
 * 与当前 Java / 嵌入式页面约定对齐时，`rd`、`fsw` 的明文可为 **UTF-8 的三方标识字符串本身**，
 * 亦可通过 {@link buildTuseRdPlaintext} / {@link buildTuseFswPlaintext} 使用文档中的 JSON（含毫秒 `ts`），
 * 须与后端解密假设一致。
 *
 * ## 输出
 *
 * 标准 Base64（含 `+`、`/`）。
 */

export function deriveTuseAes256KeyBytes(aesKeyUtf8Secret: string): Uint8Array {
  return utf8SliceToFixedLength(aesKeyUtf8Secret.trim(), 32);
}

export function deriveTuseAesIvBytes(aesIvUtf8Secret: string): Uint8Array {
  return utf8SliceToFixedLength(aesIvUtf8Secret.trim(), 16);
}

function utf8SliceToFixedLength(secret: string, outLength: number): Uint8Array {
  const src = new TextEncoder().encode(secret);
  const out = new Uint8Array(outLength);
  out.set(src.subarray(0, Math.min(src.length, outLength)));
  return out;
}

/**
 * AES-256-CBC 加密后以 Base64 输出（无换行）。
 */
export async function encryptTuseAesCbcPkcs7Base64(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  plaintextUtf8: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前环境缺少 Web Crypto（subtle）");
  }

  const rawKeyBytes = deriveTuseAes256KeyBytes(aesKeyUtf8Secret);
  const ivBytes = deriveTuseAesIvBytes(aesIvUtf8Secret);
  const rawKey = new Uint8Array(rawKeyBytes);
  const iv = new Uint8Array(ivBytes);

  const key = await subtle.importKey("raw", rawKey, "AES-CBC", false, ["encrypt"]);

  const data = new TextEncoder().encode(plaintextUtf8);
  const ciphertext = await subtle.encrypt({ name: "AES-CBC", iv }, key, data);
  return bytesToStandardBase64(new Uint8Array(ciphertext));
}

export function buildTuseRdPlaintext(thirdUserId: string, tsMs: number): string {
  return JSON.stringify({ thirdUserId, ts: tsMs });
}

export function buildTuseFswPlaintext(
  thirdExternalUserId: string,
  tsMs: number,
): string {
  return JSON.stringify({ thirdExternalUserId, ts: tsMs });
}

/** `thirdUserId` 原文直接作为 AES 明文（与部分 Java 实现一致） */
export function encryptTuseRdFromThirdUserId(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  thirdUserId: string,
): Promise<string> {
  return encryptTuseAesCbcPkcs7Base64(aesKeyUtf8Secret, aesIvUtf8Secret, thirdUserId);
}

/** `thirdExternalUserId` 原文直接作为 AES 明文 */
export function encryptTuseFswFromThirdExternalUserId(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  thirdExternalUserId: string,
): Promise<string> {
  return encryptTuseAesCbcPkcs7Base64(
    aesKeyUtf8Secret,
    aesIvUtf8Secret,
    thirdExternalUserId,
  );
}

/** Unix 秒（十进制整数字符串）作为 AES 明文，与 rd/fsw 共用密钥与 IV */
export function encryptTuseTsFromUnixSeconds(
  aesKeyUtf8Secret: string,
  aesIvUtf8Secret: string,
  unixSeconds: number,
): Promise<string> {
  return encryptTuseAesCbcPkcs7Base64(
    aesKeyUtf8Secret,
    aesIvUtf8Secret,
    String(Math.trunc(unixSeconds)),
  );
}

function bytesToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }

  if (typeof btoa !== "function") {
    throw new Error("缺少 btoa，无法编码 Base64");
  }

  return btoa(binary);
}
