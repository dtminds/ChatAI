import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account } from "@/pages/chat/chat-types";

const avatarRenderMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children?: ReactNode }) => {
    avatarRenderMock();
    return <span>{children}</span>;
  },
  AvatarBadge: () => <span />,
  AvatarFallback: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  AvatarImage: () => <span />,
}));

const account: Account = {
  avatarUrl: "",
  description: "",
  id: "seat-1",
  metrics: { activeCustomers: 0, agents: 0, stores: 0, totalCustomers: 0 },
  name: "席位一",
  operator: "",
  phone: "",
  tone: "",
};

describe("AccountSidebarItem render scope", () => {
  it("skips unchanged props and renders an updated account", () => {
    avatarRenderMock.mockClear();
    const onClick = vi.fn();
    const { rerender } = render(
      <AccountSidebarItem
        account={account}
        isActive={false}
        onClick={onClick}
        takeoverStatus="idle"
      />,
    );
    const initialRenderCount = avatarRenderMock.mock.calls.length;
    expect(initialRenderCount).toBeGreaterThan(0);

    rerender(
      <AccountSidebarItem
        account={account}
        isActive={false}
        onClick={onClick}
        takeoverStatus="idle"
      />,
    );
    expect(avatarRenderMock).toHaveBeenCalledTimes(initialRenderCount);

    rerender(
      <AccountSidebarItem
        account={{ ...account, unreadCount: 2 }}
        isActive={false}
        onClick={onClick}
        takeoverStatus="idle"
      />,
    );
    expect(avatarRenderMock.mock.calls.length).toBeGreaterThan(initialRenderCount);

    fireEvent.click(screen.getByRole("button", { name: "选择 席位一" }));
    expect(onClick).toHaveBeenCalledWith("seat-1");
  });
});
