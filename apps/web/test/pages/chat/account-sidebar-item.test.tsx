import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account } from "@/pages/chat/chat-types";

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarFallback: ({ children, ...props }: ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarBadge: (props: ComponentProps<"span">) => <span {...props} />,
  AvatarImage: (props: ComponentProps<"img">) => <img {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const account: Account = {
  id: "account-1",
  avatarUrl: "https://example.com/avatar-lsave.png",
  description: "客服账号",
  loginStatus: "online",
  metrics: {
    activeCustomers: 2,
    agents: 1,
    stores: 1,
    totalCustomers: 8,
  },
  name: "lsave",
  operator: "lsave",
  phone: "13800000000",
  tone: "专业",
  unreadCount: 7,
  takenOverEmployeeId: "emp-001",
};

describe("AccountSidebarItem", () => {
  it("hides the unread badge when the seat is active", () => {
    render(
      <AccountSidebarItem
        account={account}
        currentEmployeeId="emp-001"
        isActive
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.queryByLabelText("lsave 未读消息 7")).not.toBeInTheDocument();
    expect(screen.getByText("lsave")).toBeInTheDocument();
  });

  it("still shows the unread badge for a non-active taken-over seat", () => {
    render(
      <AccountSidebarItem
        account={account}
        currentEmployeeId="emp-001"
        isActive={false}
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.getByLabelText("lsave 未读消息 7")).toHaveTextContent("7");
  });
});
