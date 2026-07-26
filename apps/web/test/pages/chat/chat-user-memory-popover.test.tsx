import { render, screen, waitFor, within } from "@testing-library/react";
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
    await user.click(screen.getByRole("radio", { name: "客户画像" }));
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
});
