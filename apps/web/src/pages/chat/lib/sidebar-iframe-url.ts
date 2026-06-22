/**
 * 将当前工作台上下文合并进侧栏自定义页 iframe 地址，便于嵌入页用查询参数读取。
 * third*：配置密钥后由后端 `/server/sidebar-iframe-params` 按当前席位与会话签发 rd、fsw、ts（均为 AES 密文；ts 明文为当前 Unix 秒十进制字符串）。
 * `mid` 与 rd/fsw/ts 同源，由服务端签发。仅用于 URL 脱敏与既有嵌入页协议，不是对嵌入页的身份防伪边界。
 * `tos`：`0` 当前坐席未接管该账号，`1` 已接管；`qd`：群会话时的三方群 ID（明文，兼容旧嵌入页）。
 * 群聊时 `thirdGroupId` / `thirdGroupName` 为服务端签发的 AES 密文，语义对齐 `fsw`。
 * `sendStatus`：`0` 可发送，`1` 未接管，`2` 离线，`3` 会话或席位已失效，`4` 只读客服。
 */

export type SidebarIframeSendStatus = "0" | "1" | "2" | "3" | "4";

export type SidebarIframeUrlContext = {
  /** 对应服务端签发的 `mid`（库表 `appid`） */
  mid?: string;
  /** rd：服务端签发的 AES 密文（明文为 `thirdUserId` UTF-8 字符串本身） */
  rd?: string;
  /** fsw：服务端签发的 AES 密文（明文为 `thirdExternalUserId` UTF-8 字符串本身） */
  fsw?: string;
  /** ts：服务端签发的 AES 密文（明文为 Unix 秒十进制字符串） */
  ts?: string;
  /** 当前坐席是否已接管该账号：`0` 未接管，`1` 已接管 */
  tos?: "0" | "1";
  /** 群聊三方群 ID（仅群会话，明文；兼容旧嵌入页） */
  qd?: string;
  /** 群聊三方群 ID（服务端签发的 AES 密文，明文为 `thirdGroupId` UTF-8 字符串本身） */
  thirdGroupId?: string;
  /** 群聊群名称（服务端签发的 AES 密文，明文为群名称 UTF-8 字符串本身） */
  thirdGroupName?: string;
  /** 当前发送能力状态，见 `SidebarIframeSendStatus` */
  sendStatus?: SidebarIframeSendStatus;
};

export function resolveSidebarIframeSendStatus(input: {
  hasActiveConversation: boolean;
  isAccountSeatExpired?: boolean;
  isAccountOffline: boolean;
  isAccountTakenOver: boolean;
  isConversationBizInactive: boolean;
  isReadOnly: boolean;
}): SidebarIframeSendStatus {
  if (input.isReadOnly) {
    return "4";
  }

  if (!input.hasActiveConversation) {
    return "1";
  }

  if (input.isAccountOffline) {
    return "2";
  }

  if (input.isAccountSeatExpired) {
    return "3";
  }

  if (!input.isAccountTakenOver) {
    return "1";
  }

  if (input.isConversationBizInactive) {
    return "3";
  }

  return "0";
}

export function buildSidebarIframeSrc(
  baseUrl: string,
  context: SidebarIframeUrlContext,
): string {
  const { mid, rd, fsw, ts, tos, qd, thirdGroupId, thirdGroupName, sendStatus } = context;
  const hasMid = mid !== undefined && mid !== "";
  const hasTos = tos !== undefined;
  const hasSendStatus = sendStatus !== undefined;
  const hasQd = qd !== undefined && qd !== "";
  const hasThirdGroupId = thirdGroupId !== undefined && thirdGroupId !== "";
  if (
    !hasMid &&
    !hasTos &&
    !hasSendStatus &&
    !hasQd &&
    !hasThirdGroupId &&
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
    if (hasSendStatus) {
      url.searchParams.set("sendStatus", sendStatus);
    }
    if (hasQd) {
      url.searchParams.set("qd", qd);
    }
    if (hasThirdGroupId) {
      url.searchParams.set("thirdGroupId", thirdGroupId);
      url.searchParams.set("thirdGroupName", thirdGroupName || thirdGroupId);
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}
