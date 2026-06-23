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
  canSendMessage: boolean;
  canTakeOverAccount: boolean;
  canUseChatSend: boolean;
  canUseConversationActions: boolean;
  composerPlaceholder: string;
  isAccountOffline: boolean;
  isAccountTakenOverByCurrentUser: boolean;
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
  const isAccountOffline = account?.loginStatus === "offline";
  const isAccountTakenOverByCurrentUser =
    !!account?.takenOverEmployeeId && account.takenOverEmployeeId === me?.id;
  const isConversationBizInactive = activeConversation?.bizStatus !== 1;
  const canUseConversationActions = canUseWorkbenchConversationActions({
    account,
    hasSendPermission: canUseChatSend,
    me,
  });
  const canSendMessage =
    canUseConversationActions &&
    !!activeConversation &&
    !isConversationBizInactive &&
    activeConversation.custodyMode !== CONVERSATION_CUSTODY_MODE.FULL;

  return {
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
      isAccountTakenOverByCurrentUser,
      isConversationBizInactive,
    }),
    isAccountOffline,
    isAccountTakenOverByCurrentUser,
    isConversationActionDisabled: !canUseConversationActions,
    isConversationBizInactive,
    sidebarIframeSendStatus: resolveSidebarIframeSendStatus({
      hasActiveConversation: !!activeConversation,
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
    account?.loginStatus !== "offline" &&
    !!account?.takenOverEmployeeId &&
    account.takenOverEmployeeId === me?.id
  );
}

function resolveComposerPlaceholder({
  activeConversation,
  bootstrapStatus,
  canSendMessage,
  canUseChatSend,
  isAccountOffline,
  isAccountTakenOverByCurrentUser,
  isConversationBizInactive,
}: Pick<
  WorkbenchPermissions,
  | "canSendMessage"
  | "isAccountOffline"
  | "isAccountTakenOverByCurrentUser"
  | "isConversationBizInactive"
> & {
  activeConversation?: Conversation;
  bootstrapStatus: WorkbenchBootstrapStatus;
  canUseChatSend: boolean;
}) {
  const isActivelyHosted =
    activeConversation?.custodyMode === CONVERSATION_CUSTODY_MODE.FULL &&
    activeConversation.custodyHostingStatus !== "exited";

  if (isActivelyHosted) {
    return "AI正在托管中...";
  }

  if (canSendMessage) {
    return "请输入消息……";
  }

  if (bootstrapStatus === "loading" && !activeConversation) {
    return "正在加载会话数据...";
  }

  if (!activeConversation) {
    return "当前列表暂无可发送会话";
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
