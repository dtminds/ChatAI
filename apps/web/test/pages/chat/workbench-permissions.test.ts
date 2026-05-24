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
};

const viewer: AuthSubUser = {
  accountType: "sub",
  displayName: "客服（只读）",
  permissions: ["chat.access"],
  role: "viewer",
  subUserId: "sub-user-002",
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
      canTakeOverAccount: true,
      canUseConversationActions: true,
      composerPlaceholder: "请输入消息……",
    });
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
    customerId: "customer-001",
    customerName: "客户一号",
    id: "conv-001",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "",
    unread: 1,
    updatedAt: "",
    ...overrides,
  };
}
