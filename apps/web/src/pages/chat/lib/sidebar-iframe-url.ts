/**
 * 将当前会话的三方用户标识合并进侧栏自定义页 iframe 地址，便于嵌入页用查询参数读取。
 * third* 为明文；配置密钥后由侧栏异步生成 rd、fsw、ts（均为 AES 密文；ts 明文为当前 Unix 秒十进制字符串，与 .env.example 密钥约定一致）。
 */

export type SidebarIframeUrlContext = {
  thirdExternalUserId?: string;
  thirdUserId?: string;
  /** rd：AES 密文（明文为 `thirdUserId` UTF-8 字符串本身，见 tuse-crypto） */
  rd?: string;
  /** fsw：AES 密文（明文为 `thirdExternalUserId` UTF-8 字符串本身） */
  fsw?: string;
  /** ts：AES 密文（明文为 Unix 秒十进制字符串，见 tuse-crypto） */
  ts?: string;
};

export function buildSidebarIframeSrc(
  baseUrl: string,
  context: SidebarIframeUrlContext,
): string {
  const { thirdExternalUserId, thirdUserId, rd, fsw, ts } = context;
  if (
    !thirdUserId &&
    !thirdExternalUserId &&
    rd === undefined &&
    fsw === undefined &&
    ts === undefined
  ) {
    return baseUrl;
  }

  try {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const url = new URL(baseUrl, origin);

    if (thirdUserId) {
      url.searchParams.set("thirdUserId", thirdUserId);
    }
    if (thirdExternalUserId) {
      url.searchParams.set("thirdExternalUserId", thirdExternalUserId);
    }
    if (rd !== undefined && rd !== "") {
      url.searchParams.set("rd", rd);
    }
    if (fsw !== undefined && fsw !== "") {
      url.searchParams.set("fsw", fsw);
    }
    if (ts !== undefined && ts !== "") {
      url.searchParams.set("ts", ts);
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}
