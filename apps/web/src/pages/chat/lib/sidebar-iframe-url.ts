/**
 * 将当前工作台上下文合并进侧栏自定义页 iframe 地址，便于嵌入页用查询参数读取。
 * third*：配置密钥后由侧栏异步生成 rd、fsw、ts（均为 AES 密文；ts 明文为当前 Unix 秒十进制字符串，与 .env.example 密钥约定一致）。
 * `mid` 来自 `/server/me/sidebar-tuse-crypto` 的 `appId`，与密钥同源。
 * `tos`：`0` 当前坐席未接管该账号，`1` 已接管；`qd`：群会话时的三方群 ID。
 */

export type SidebarIframeUrlContext = {
  /** 对应 `/me/sidebar-tuse-crypto` 返回的 `appId`，写入查询参数名 `mid` */
  mid?: string;
  /** rd：AES 密文（明文为 `thirdUserId` UTF-8 字符串本身，见 tuse-crypto） */
  rd?: string;
  /** fsw：AES 密文（明文为 `thirdExternalUserId` UTF-8 字符串本身） */
  fsw?: string;
  /** ts：AES 密文（明文为 Unix 秒十进制字符串，见 tuse-crypto） */
  ts?: string;
  /** 当前坐席是否已接管该账号：`0` 未接管，`1` 已接管 */
  tos?: "0" | "1";
  /** 群聊三方群 ID（仅群会话） */
  qd?: string;
};

export function buildSidebarIframeSrc(
  baseUrl: string,
  context: SidebarIframeUrlContext,
): string {
  const { mid, rd, fsw, ts, tos, qd } = context;
  const hasMid = mid !== undefined && mid !== "";
  const hasTos = tos !== undefined;
  const hasQd = qd !== undefined && qd !== "";
  if (
    !hasMid &&
    !hasTos &&
    !hasQd &&
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

    if (rd !== undefined && rd !== "") {
      url.searchParams.set("rd", rd);
    }
    if (fsw !== undefined && fsw !== "") {
      url.searchParams.set("fsw", fsw);
    }
    if (ts !== undefined && ts !== "") {
      url.searchParams.set("ts", ts);
    }
    if (hasMid) {
      url.searchParams.set("mid", mid);
    }
    if (hasTos) {
      url.searchParams.set("tos", tos);
    }
    if (hasQd) {
      url.searchParams.set("qd", qd);
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}
