import { describe, expect, it } from "vitest";
import { resolveWorkbenchPermissions } from "@/pages/chat/lib/workbench-permissions";
import type { Account, Conversation, EmployeeProfile } from "@/pages/chat/chat-types";
import type { AuthSubUser } from "@chatai/contracts";

const me: EmployeeProfile = {
  displayName: "客服一号",
  id: "agent-001",
};

const operator: AuthSubUser = {
  accountType: "sub",
  displayName: "客服一号",
  permissions: ["chat.access", "chat.send", "chat.takeover"],
  role: "operator",
  subUserId: "sub-user-001",
  uid: 1,
};

const viewer: AuthSubUser = {
  accountType: "sub",
  displayName: "客服（只读）",
  permissions: ["chat.access"],
  role: "viewer",
  subUserId: "sub-user-002",
  uid: 2,
};

describe("resolveWorkbenchPermissions", () => {
  it("allows sending and conversation actions when account is taken over and role can send", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({ takenOverEmployeeId: me.id }),
      activeConversation: createConversation(),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canSendMessage: true,
      canToggleConversationAIHosting: false,
      canTakeOverAccount: true,
      canUseConversationActions: true,
      composerPlaceholder: "请输入消息……",
      sidebarIframeSendStatus: "0",
    });
  });

  it("allows enabling full-auto only when the taken-over account has seat hosting enabled", () => {
    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }),
    ).toMatchObject({
      canToggleConversationAIHosting: true,
      conversationAIHostingEnabled: false,
    });

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
        }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).canToggleConversationAIHosting,
    ).toBe(false);

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: false,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).canToggleConversationAIHosting,
    ).toBe(false);
  });

  it("derives conversation AI hosting from seat hosting and conversation switch", () => {
    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation({ conversationAIHostingSwitch: true }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).conversationAIHostingEnabled,
    ).toBe(true);

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: false,
        }),
        activeConversation: createConversation({ conversationAIHostingSwitch: true }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).conversationAIHostingEnabled,
    ).toBe(false);

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation({
          conversationAIHostingSwitch: true,
          mode: "group",
        }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).conversationAIHostingEnabled,
    ).toBe(false);
    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation({
          conversationAIHostingSwitch: true,
          mode: "group",
        }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).canToggleConversationAIHosting,
    ).toBe(false);

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          seatAIHostingAuth: true,
          seatAIHostingEnabled: true,
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation({
          conversationAIHostingSwitch: true,
          customerBindType: 2,
        }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }),
    ).toMatchObject({
      canToggleConversationAIHosting: false,
      conversationAIHostingEnabled: false,
    });
  });

  it("blocks sending without showing a hosting placeholder for active full-auto conversations", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({
        seatAIHostingAuth: true,
        seatAIHostingEnabled: true,
        takenOverEmployeeId: me.id,
      }),
      activeConversation: createConversation({ conversationAIHostingSwitch: true }),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canSendMessage: false,
      canUseConversationActions: true,
      composerPlaceholder: "请输入消息……",
    });
  });

  it("keeps conversation hosting active while showing takeover copy when the account is not taken over", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({
        seatAIHostingAuth: true,
        seatAIHostingEnabled: true,
      }),
      activeConversation: createConversation({ conversationAIHostingSwitch: true }),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canToggleConversationAIHosting: false,
      canSendMessage: false,
      composerPlaceholder: "当前账号未接管，暂时无法发送消息",
      conversationAIHostingEnabled: true,
    });
  });

  it("allows sending after a conversation exits AI hosting", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({ takenOverEmployeeId: me.id }),
      activeConversation: createConversation({
        agentHostingStatus: "exited",
        conversationAIHostingSwitch: false,
      }),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canSendMessage: true,
      canUseConversationActions: true,
      composerPlaceholder: "请输入消息……",
    });
  });

  it("maps sidebar iframe send status from workbench state", () => {
    expect(
      resolveWorkbenchPermissions({
        account: createAccount({ takenOverEmployeeId: me.id }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).sidebarIframeSendStatus,
    ).toBe("4");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({ takenOverEmployeeId: me.id }),
        activeConversation: createConversation({ bizStatus: 2 }),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).sidebarIframeSendStatus,
    ).toBe("3");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount(),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).sidebarIframeSendStatus,
    ).toBe("1");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({ takenOverEmployeeId: me.id }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: undefined,
      }).sidebarIframeSendStatus,
    ).toBe("4");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          bizStatus: 0,
          loginStatus: "offline",
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: operator,
      }).sidebarIframeSendStatus,
    ).toBe("3");
  });

  it("prioritizes unavailable conversation state before account state and permission copy", () => {
    expect(
      resolveWorkbenchPermissions({
        account: createAccount(),
        activeConversation: undefined,
        bootstrapStatus: "loading",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("正在加载会话数据...");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          loginStatus: "offline",
        }),
        activeConversation: undefined,
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前列表暂无可发送会话");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount(),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前账号未接管，暂时无法发送消息");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({
          loginStatus: "offline",
          takenOverEmployeeId: me.id,
        }),
        activeConversation: createConversation(),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前账号离线，暂时无法发送消息");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount(),
        activeConversation: createConversation({ bizStatus: 2 }),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前账号未接管，暂时无法发送消息");
  });

  it("prioritizes inactive conversation state before account permission copy", () => {
    expect(
      resolveWorkbenchPermissions({
        account: createAccount({ takenOverEmployeeId: me.id }),
        activeConversation: createConversation({ bizStatus: 2 }),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前会话已失效，暂时无法发送消息");

    expect(
      resolveWorkbenchPermissions({
        account: createAccount({ takenOverEmployeeId: me.id }),
        activeConversation: createConversation({ bizStatus: 1 }),
        bootstrapStatus: "ready",
        me,
        subUser: viewer,
      }).composerPlaceholder,
    ).toBe("当前账号无发送权限，暂时无法发送消息");
  });

  it("uses account permission copy when state is otherwise usable but account lacks send permission", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({ takenOverEmployeeId: me.id }),
      activeConversation: createConversation(),
      bootstrapStatus: "ready",
      me,
      subUser: viewer,
    });

    expect(permissions).toMatchObject({
      canSendMessage: false,
      canUseConversationActions: false,
      composerPlaceholder: "当前账号无发送权限，暂时无法发送消息",
    });
  });

  it("blocks conversation actions while the account is offline", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({
        loginStatus: "offline",
        takenOverEmployeeId: me.id,
      }),
      activeConversation: createConversation(),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canSendMessage: false,
      canUseChatSend: true,
      canUseConversationActions: false,
      isConversationActionDisabled: true,
    });
  });

  it("blocks sending and conversation actions when the account seat is inactive", () => {
    const permissions = resolveWorkbenchPermissions({
      account: createAccount({
        bizStatus: 0,
        loginStatus: "offline",
        takenOverEmployeeId: me.id,
      }),
      activeConversation: createConversation(),
      bootstrapStatus: "ready",
      me,
      subUser: operator,
    });

    expect(permissions).toMatchObject({
      canSendMessage: false,
      canUseConversationActions: false,
      composerPlaceholder: "当前席位已失效，暂时无法发送消息",
      isAccountSeatExpired: true,
      isConversationActionDisabled: true,
    });
  });
});

function createAccount(overrides: Partial<Account> = {}): Account {
  return {
    avatarUrl: "",
    description: "",
    id: "drc",
    loginStatus: "online",
    metrics: {
      activeCustomers: 0,
      agents: 0,
      stores: 0,
      totalCustomers: 0,
    },
    name: "德瑞可",
    operator: "客服一号",
    phone: "",
    takenOverEmployeeId: undefined,
    tone: "",
    ...overrides,
  };
}

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    accountId: "drc",
    bizStatus: 1,
    customerAvatarUrl: "",
    customerBindType: 1,
    customerId: "customer-001",
    customerName: "客户一号",
    id: "conv-001",
    conversationAIHostingSwitch: false,
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "",
    unread: 1,
    updatedAt: "",
    ...overrides,
  };
}
