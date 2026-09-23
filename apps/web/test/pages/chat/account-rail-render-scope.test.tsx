import { memo, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRail } from "@/pages/chat/components/account-rail";
import type { Account } from "@/pages/chat/chat-types";
import { resetTicketCountStore } from "@/pages/chat/tickets/ticket-count-store";
import { useAuthStore } from "@/store/auth-store";

const accountItemRenderMock = vi.hoisted(() => vi.fn());
const scrollAreaRenderMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => {
    scrollAreaRenderMock();
    return <div>{children}</div>;
  },
}));

vi.mock("@/pages/chat/components/account-sidebar-item", () => ({
  AccountSidebarItem: memo(({ account }: { account: Account }) => {
    accountItemRenderMock(account.id);
    return <div>{account.name}</div>;
  }),
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

describe("AccountRail render scope", () => {
  beforeEach(() => {
    accountItemRenderMock.mockClear();
    scrollAreaRenderMock.mockClear();
    resetTicketCountStore();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("skips unchanged parent props and renders an updated seat", () => {
    const onSelectAccount = vi.fn();
    const accounts = [account, { ...account, id: "seat-2", name: "席位二" }];
    const { rerender } = render(
      <MemoryRouter>
        <AccountRail accounts={accounts} onSelectAccount={onSelectAccount} />
      </MemoryRouter>,
    );
    const initialRenderCount = accountItemRenderMock.mock.calls.length;
    const initialRailRenderCount = scrollAreaRenderMock.mock.calls.length;
    expect(initialRenderCount).toBeGreaterThan(0);
    expect(initialRailRenderCount).toBeGreaterThan(0);

    rerender(
      <MemoryRouter>
        <AccountRail accounts={accounts} onSelectAccount={onSelectAccount} />
      </MemoryRouter>,
    );
    expect(accountItemRenderMock).toHaveBeenCalledTimes(initialRenderCount);
    expect(scrollAreaRenderMock).toHaveBeenCalledTimes(initialRailRenderCount);

    rerender(
      <MemoryRouter>
        <AccountRail
          accounts={[account, { ...accounts[1], unreadCount: 2 }]}
          onSelectAccount={onSelectAccount}
        />
      </MemoryRouter>,
    );
    expect(accountItemRenderMock).toHaveBeenCalledTimes(initialRenderCount + 1);
    expect(accountItemRenderMock.mock.lastCall?.[0]).toBe("seat-2");
    expect(scrollAreaRenderMock).toHaveBeenCalledTimes(initialRailRenderCount + 1);
  });
});
