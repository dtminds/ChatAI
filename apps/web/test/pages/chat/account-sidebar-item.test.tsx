import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account } from "@/pages/chat/chat-types";

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarBadge: (props: React.ComponentProps<"span">) => <span {...props} />,
  AvatarFallback: ({ children, ...props }: React.ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: (props: React.ComponentProps<"img">) => <img {...props} />,
}));

const baseAccount: Account = {
  id: "account-1",
  avatarUrl: "https://example.com/avatar.png",
  description: "客服账号",
  loginStatus: "online",
  metrics: {
    activeCustomers: 1,
    agents: 1,
    stores: 1,
    totalCustomers: 2,
  },
  name: "lsave",
  operator: "lsave",
  phone: "13800000000",
  takenOverEmployeeId: "emp-001",
  tone: "专业",
  unreadCount: 7,
};

describe("AccountSidebarItem", () => {
  it("hides unread indicators for the active seat without clearing unread state", () => {
    render(
      <AccountSidebarItem
        account={baseAccount}
        currentEmployeeId="emp-001"
        isActive
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.queryByLabelText("lsave 有未读消息")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-unread-dot-account-1")).not.toBeInTheDocument();
  });

  it("shows a red dot for non-active taken-over seats with unread activity", () => {
    render(
      <AccountSidebarItem
        account={baseAccount}
        currentEmployeeId="emp-001"
        isActive={false}
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.getByLabelText("lsave 有未读消息")).toHaveAttribute(
      "data-testid",
      "account-unread-dot-account-1",
    );
    expect(screen.getByTestId("account-unread-dot-account-1")).toBeInTheDocument();
  });
});
