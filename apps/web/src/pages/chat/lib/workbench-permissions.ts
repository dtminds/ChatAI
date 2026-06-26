import { CONVERSATION_CUSTODY_MODE, type AuthSubUser } from "@chatai/contracts";
import type {
  Account,
  Conversation,
  EmployeeProfile,
} from "@/pages/chat/chat-types";
import { isChatReadOnlySubUser } from "@/pages/chat/hooks/use-auth-sub-user";
import {
  resolveSidebarIframeSendStatus,
  type SidebarIframeSendStatus,
} from "@/pages/chat/lib/sidebar-iframe-url";

type WorkbenchBootstrapStatus = "idle" | "loading" | "ready" | "error";

type ResolveWorkbenchPermissionsInput = {
  account?: Account;
  activeConversation?: Conversation;
  bootstrapStatus: WorkbenchBootstrapStatus;
  me?: EmployeeProfile;
  subUser?: AuthSubUser;
};

type CanUseWorkbenchConversationActionsInput = {
  account?: Account;
  hasSendPermission: boolean;
  me?: EmployeeProfile;
};

export type WorkbenchPermissions = {
  canEnableFullAuto: boolean;
  canSendMessage: boolean;
  canTakeOverAccount: boolean;
  canUseChatSend: boolean;
  canUseConversationActions: boolean;
  composerPlaceholder: string;
  isAccountSeatExpired: boolean;
  isAccountOffline: boolean;
  isAccountTakenOverByCurrentUser: boolean;
  isFullAutoActive: boolean;
  isConversationActionDisabled: boolean;
  isConversationBizInactive: boolean;
  sidebarIframeSendStatus: SidebarIframeSendStatus;
};

export function resolveWorkbenchPermissions({
  account,
  activeConversation,
  bootstrapStatus,
  me,
  subUser,
}: ResolveWorkbenchPermissionsInput): WorkbenchPermissions {
  const canUseChatSend = subUser?.permissions.includes("chat.send") ?? false;
  const canTakeOverAccount =
    subUser?.permissions.includes("chat.takeover") ?? false;
  const isAccountSeatExpired = isExpiredAccountSeat(account);
  const isAccountOffline = account?.loginStatus === "offline";
  const isAccountTakenOverByCurrentUser =
    !!account?.takenOverEmployeeId && account.takenOverEmployeeId === me?.id;
  const isConversationBizInactive = activeConversation?.bizStatus !== 1;
  const canUseConversationActions = canUseWorkbenchConversationActions({
    account,
    hasSendPermission: canUseChatSend,
    me,
  });
  const isActiveFullCustody =
    activeConversation?.custodyMode === CONVERSATION_CUSTODY_MODE.FULL &&
    activeConversation.custodyHostingStatus !== "exited";
  const canEnableFullAuto =
    isAccountTakenOverByCurrentUser &&
    account?.fullAutoAuth === true &&
    account.fullAutoSwitch === true;
  const isFullAutoActive = canEnableFullAuto && isActiveFullCustody;
  const canSendMessage =
    canUseConversationActions &&
    !!activeConversation &&
    !isConversationBizInactive &&
    !isFullAutoActive;

  return {
    canEnableFullAuto,
    canSendMessage,
    canTakeOverAccount,
    canUseChatSend,
    canUseConversationActions,
    composerPlaceholder: resolveComposerPlaceholder({
      activeConversation,
      bootstrapStatus,
      canSendMessage,
      canUseChatSend,
      isAccountOffline,
      isAccountSeatExpired,
      isAccountTakenOverByCurrentUser,
      isConversationBizInactive,
      isFullAutoActive,
    }),
    isAccountSeatExpired,
    isAccountOffline,
    isAccountTakenOverByCurrentUser,
    isFullAutoActive,
    isConversationActionDisabled: !canUseConversationActions,
    isConversationBizInactive,
    sidebarIframeSendStatus: resolveSidebarIframeSendStatus({
      hasActiveConversation: !!activeConversation,
      isAccountSeatExpired,
      isAccountOffline,
      isAccountTakenOver: isAccountTakenOverByCurrentUser,
      isConversationBizInactive,
      isReadOnly: isChatReadOnlySubUser(subUser),
    }),
  };
}

export function canUseWorkbenchConversationActions({
  account,
  hasSendPermission,
  me,
}: CanUseWorkbenchConversationActionsInput) {
  return (
    hasSendPermission &&
    !isExpiredAccountSeat(account) &&
    account?.loginStatus !== "offline" &&
    !!account?.takenOverEmployeeId &&
    account.takenOverEmployeeId === me?.id
  );
}

export function isExpiredAccountSeat(account: Account | undefined) {
  return account?.bizStatus === 0;
}

function resolveComposerPlaceholder({
  activeConversation,
  bootstrapStatus,
  canSendMessage,
  canUseChatSend,
  isAccountOffline,
  isAccountSeatExpired,
  isAccountTakenOverByCurrentUser,
  isConversationBizInactive,
  isFullAutoActive,
}: Pick<
  WorkbenchPermissions,
  | "canSendMessage"
  | "isAccountOffline"
  | "isAccountSeatExpired"
  | "isAccountTakenOverByCurrentUser"
  | "isConversationBizInactive"
  | "isFullAutoActive"
> & {
  activeConversation?: Conversation;
  bootstrapStatus: WorkbenchBootstrapStatus;
  canUseChatSend: boolean;
}) {
  if (canSendMessage || isFullAutoActive) {
    return "请输入消息……";
  }

  if (bootstrapStatus === "loading" && !activeConversation) {
    return "正在加载会话数据...";
  }

  if (!activeConversation) {
    return "当前列表暂无可发送会话";
  }

  if (isAccountSeatExpired) {
    return "当前席位已失效，暂时无法发送消息";
  }

  if (isAccountOffline) {
    return "当前账号离线，暂时无法发送消息";
  }

  if (!isAccountTakenOverByCurrentUser) {
    return "当前账号未接管，暂时无法发送消息";
  }

  if (isConversationBizInactive) {
    return "当前会话已失效，暂时无法发送消息";
  }

  return "当前账号无发送权限，暂时无法发送消息";
}
