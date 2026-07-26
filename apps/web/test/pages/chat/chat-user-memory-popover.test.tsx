import type { AgentUserMemoryCustomerDetailResponse } from "@chatai/contracts";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatUserMemoryPopover } from "@/pages/chat/components/chat-user-memory-popover";
import type { Conversation } from "@/pages/chat/chat-types";
import { useAuthStore } from "@/store/auth-store";

const service = vi.hoisted(() => ({
  createUserMemoryItem: vi.fn(),
  deleteUserMemoryItem: vi.fn(),
  getUserMemoryCustomer: vi.fn(),
  getUserMemoryEvidence: vi.fn(),
  updateUserMemoryItem: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/api/user-memory-service", () => service);

const conversation: Conversation = {
  accountId: "account-1",
  customerAvatarUrl: "",
  customerId: "customer-1",
  customerName: "测试客户",
  handoffMsgId: 0,
  id: "conversation-1",
  mode: "single",
  preview: "",
  priority: "medium",
  quietFor: "",
  thirdExternalUserId: "external-1",
  unread: 0,
  updatedAt: "",
};

const secondConversation: Conversation = {
  ...conversation,
  customerId: "customer-2",
  customerName: "第二位客户",
  id: "conversation-2",
  thirdExternalUserId: "external-2",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("chat user-memory popover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服",
      permissions: ["chat.access", "chat.send"],
      role: "operator",
      subUserId: "101",
      uid: 1,
    });
    service.getUserMemoryCustomer.mockResolvedValue({
      customerName: "测试客户",
      items: [],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 0,
    });
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it("stays open while the agent interacts elsewhere and closes from the icon", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ChatUserMemoryPopover conversation={conversation} />
        <button type="button">聊天输入区</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "用户记忆" });
    await user.click(trigger);
    expect(await screen.findByText("暂无记忆")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "聊天输入区" }));
    expect(screen.getByText("暂无记忆")).toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() =>
      expect(screen.queryByText("暂无记忆")).not.toBeInTheDocument(),
    );
  });

  it("explains the memory shortcut on hover", async () => {
    const user = userEvent.setup();
    render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.hover(screen.getByRole("button", { name: "用户记忆" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("用户记忆");
  });

  it("orders memories by descending id and shows details and actions on hover", async () => {
    const user = userEvent.setup();
    service.getUserMemoryCustomer.mockResolvedValue({
      customerName: "测试客户",
      items: [
        {
          category: "recent_intent",
          content: "已过期的近期购买计划",
          createdAt: 1,
          expiresAt: Date.now() - 7 * 86_400_000,
          id: 2,
          source: "manual",
          updatedAt: 1,
          updatedBySubUserId: 101,
        },
        {
          category: "recent_intent",
          content: "最新的近期购买计划完整内容",
          createdAt: 2,
          expiresAt: Date.now() + 7 * 86_400_000,
          id: 9,
          source: "manual",
          updatedAt: 2,
          updatedBySubUserId: 101,
        },
      ],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    });
    render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    const rows = await screen.findAllByTestId("user-memory-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("最新的近期购买计划完整内容");
    expect(rows[1]).toHaveTextContent("已过期的近期购买计划");

    await user.hover(rows[0]!);
    const detailCard = await screen.findByTestId("user-memory-detail-card-9");
    expect(within(detailCard).getByText("近期意向")).toBeInTheDocument();
    expect(within(detailCard).getByText("手动创建")).toBeInTheDocument();
    expect(
      within(detailCard).getByText("最新的近期购买计划完整内容"),
    ).toBeInTheDocument();
    expect(within(detailCard).getByText(/^更新于 /)).toBeInTheDocument();
    expect(within(detailCard).getByRole("alert")).toHaveTextContent(
      /^短期记忆：将于 /,
    );

    await user.hover(
      within(detailCard).getByRole("button", { name: "记忆操作" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "编辑" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
    await user.unhover(screen.getByRole("menu"));
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await user.hover(rows[1]!);
    const expiredDetailCard = await screen.findByTestId(
      "user-memory-detail-card-2",
    );
    expect(within(expiredDetailCard).getByRole("alert")).toHaveTextContent(
      /^短期记忆：已于 /,
    );
  });

  it("allows an operator to add memory for the active customer", async () => {
    const user = userEvent.setup();
    service.createUserMemoryItem.mockResolvedValue({
      customerName: "测试客户",
      items: [
        {
          category: "customer_profile",
          content: "身高 168cm",
          createdAt: 1,
          expiresAt: null,
          id: 1,
          source: "manual",
          updatedAt: 1,
        },
      ],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    });
    render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    await user.click(await screen.findByRole("button", { name: "新增" }));
    const dialog = await screen.findByRole("dialog", { name: "创建新记忆" });
    expect(
      screen.queryByRole("radio", { name: "人工备注" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "稳定属性" }));
    await user.type(
      screen.getByRole("textbox", { name: "记忆内容" }),
      "身高 168cm",
    );
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(service.createUserMemoryItem).toHaveBeenCalledWith("external-1", {
        category: "customer_profile",
        content: "身高 168cm",
        expectedVersion: 0,
        expiresAt: null,
      }),
    );
    expect(await screen.findByText("身高 168cm")).toBeInTheDocument();
  });

  it("submits a preset expiry for recent intent without requiring a time", async () => {
    const user = userEvent.setup();
    service.createUserMemoryItem.mockResolvedValue({
      customerName: "测试客户",
      items: [],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    });
    render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    await user.click(await screen.findByRole("button", { name: "新增" }));
    await user.click(screen.getByRole("radio", { name: "近期意向" }));
    await user.hover(screen.getByRole("button", { name: "有效期说明" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "到期后，这条近期意向将不再作为有效记忆使用",
    );
    await user.click(screen.getByRole("button", { name: "7天" }));
    await user.type(
      screen.getByRole("textbox", { name: "记忆内容" }),
      "下周参加婚礼",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(service.createUserMemoryItem).toHaveBeenCalledTimes(1),
    );
    const input = service.createUserMemoryItem.mock.calls[0]?.[1];
    expect(input).toMatchObject({
      category: "recent_intent",
      content: "下周参加婚礼",
      expectedVersion: 0,
    });
    expect(input.expiresAt).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(input.expiresAt).toBeLessThan(Date.now() + 8 * 86_400_000);
  });

  it("ignores a save response after switching to another customer", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<AgentUserMemoryCustomerDetailResponse>();
    const firstDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "测试客户",
      items: [],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    };
    const secondDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "第二位客户",
      items: [{
        category: "customer_profile",
        content: "第二位客户的记忆",
        createdAt: 2,
        expiresAt: null,
        id: 1,
        source: "manual",
        updatedAt: 2,
        updatedBySubUserId: 102,
      }],
      platform: 5,
      thirdExternalUserId: "external-2",
      version: 2,
    };
    service.getUserMemoryCustomer.mockImplementation((externalId: string) =>
      Promise.resolve(externalId === "external-2" ? secondDetail : firstDetail),
    );
    service.createUserMemoryItem.mockReturnValue(pendingSave.promise);
    const view = render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    await user.click(await screen.findByRole("button", { name: "新增" }));
    await user.type(screen.getByRole("textbox", { name: "记忆内容" }), "第一位客户的新记忆");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(service.createUserMemoryItem).toHaveBeenCalledTimes(1));

    view.rerender(<ChatUserMemoryPopover conversation={secondConversation} />);
    expect(await screen.findByText("第二位客户的记忆")).toBeInTheDocument();

    await act(async () => {
      pendingSave.resolve({
        ...firstDetail,
        items: [{
          category: "customer_profile",
          content: "第一位客户的新记忆",
          createdAt: 3,
          expiresAt: null,
          id: 1,
          source: "manual",
          updatedAt: 3,
          updatedBySubUserId: 101,
        }],
        version: 2,
      });
      await pendingSave.promise;
    });

    expect(screen.getByText("第二位客户的记忆")).toBeInTheDocument();
    expect(screen.queryByText("第一位客户的新记忆")).not.toBeInTheDocument();
  });

  it("ignores a delete response after switching to another customer", async () => {
    const user = userEvent.setup();
    const pendingDelete = deferred<AgentUserMemoryCustomerDetailResponse>();
    const firstDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "测试客户",
      items: [{
        category: "preference",
        content: "第一位客户待删除的记忆",
        createdAt: 1,
        expiresAt: null,
        id: 1,
        source: "manual",
        updatedAt: 1,
        updatedBySubUserId: 101,
      }],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    };
    const secondDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "第二位客户",
      items: [{
        category: "preference",
        content: "第二位客户保留的记忆",
        createdAt: 2,
        expiresAt: null,
        id: 1,
        source: "manual",
        updatedAt: 2,
        updatedBySubUserId: 102,
      }],
      platform: 5,
      thirdExternalUserId: "external-2",
      version: 2,
    };
    service.getUserMemoryCustomer.mockImplementation((externalId: string) =>
      Promise.resolve(externalId === "external-2" ? secondDetail : firstDetail),
    );
    service.deleteUserMemoryItem.mockReturnValue(pendingDelete.promise);
    const view = render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    const firstRow = await screen.findByTestId("user-memory-row");
    await user.hover(firstRow);
    const detailCard = await screen.findByTestId("user-memory-detail-card-1");
    await user.hover(within(detailCard).getByRole("button", { name: "记忆操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));
    const alert = await screen.findByRole("alertdialog", { name: "删除记忆" });
    await user.click(within(alert).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(service.deleteUserMemoryItem).toHaveBeenCalledTimes(1));

    view.rerender(<ChatUserMemoryPopover conversation={secondConversation} />);
    expect(await screen.findByText("第二位客户保留的记忆")).toBeInTheDocument();

    await act(async () => {
      pendingDelete.resolve({ ...firstDetail, items: [], version: 2 });
      await pendingDelete.promise;
    });

    expect(screen.getByText("第二位客户保留的记忆")).toBeInTheDocument();
  });

  it("ignores an evidence response after switching to another customer", async () => {
    const user = userEvent.setup();
    const pendingEvidence = deferred<{ messages: Array<{ content: string; messageId: number; occurredAt: number; senderRole: string; sessionId: number }> }>();
    const aiItem = (content: string, sourceSessionId: number) => ({
      category: "preference" as const,
      content,
      createdAt: 1,
      evidenceMessageIds: [10],
      expiresAt: null,
      id: 1,
      source: "ai" as const,
      sourceSessionId,
      updatedAt: 1,
    });
    const firstDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "测试客户",
      items: [aiItem("第一位客户的 AI 记忆", 10)],
      platform: 5,
      thirdExternalUserId: "external-1",
      version: 1,
    };
    const secondDetail: AgentUserMemoryCustomerDetailResponse = {
      customerName: "第二位客户",
      items: [aiItem("第二位客户的 AI 记忆", 20)],
      platform: 5,
      thirdExternalUserId: "external-2",
      version: 1,
    };
    service.getUserMemoryCustomer.mockImplementation((externalId: string) =>
      Promise.resolve(externalId === "external-2" ? secondDetail : firstDetail),
    );
    service.getUserMemoryEvidence.mockReturnValue(pendingEvidence.promise);
    const view = render(<ChatUserMemoryPopover conversation={conversation} />);

    await user.click(screen.getByRole("button", { name: "用户记忆" }));
    const firstRow = await screen.findByTestId("user-memory-row");
    await user.hover(firstRow);
    const firstCard = await screen.findByTestId("user-memory-detail-card-1");
    await user.hover(within(firstCard).getByRole("button", { name: "记忆操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "查看证据" }));
    await waitFor(() => expect(service.getUserMemoryEvidence).toHaveBeenCalledTimes(1));

    view.rerender(<ChatUserMemoryPopover conversation={secondConversation} />);
    const secondRow = await screen.findByTestId("user-memory-row");
    expect(secondRow).toHaveTextContent("第二位客户的 AI 记忆");

    await act(async () => {
      pendingEvidence.resolve({
        messages: [{
          content: "第一位客户的证据",
          messageId: 10,
          occurredAt: 1,
          senderRole: "customer",
          sessionId: 10,
        }],
      });
      await pendingEvidence.promise;
    });

    await user.hover(secondRow);
    const secondCard = await screen.findByTestId("user-memory-detail-card-1");
    expect(within(secondCard).queryByText("第一位客户的证据")).not.toBeInTheDocument();
  });
});
