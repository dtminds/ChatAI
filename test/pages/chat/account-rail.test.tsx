import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountRail } from "@/pages/chat/components/account-rail";
import type { Account } from "@/pages/chat/chat-types";

const accounts: Account[] = [
  {
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
    takenOverEmployeeId: "emp-001",
    tone: "专业",
  },
  {
    id: "account-2",
    avatarUrl: "https://example.com/avatar-support.png",
    description: "客服账号",
    loginStatus: "online",
    metrics: {
      activeCustomers: 1,
      agents: 1,
      stores: 1,
      totalCustomers: 3,
    },
    name: "support",
    operator: "support",
    phone: "13900000000",
    tone: "专业",
    unreadCount: 2,
  },
];

describe("AccountRail", () => {
  it("shows the signed-in account and opens the settings menu from the bottom trigger", async () => {
    const user = userEvent.setup();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        onSelectAccount={vi.fn()}
      />,
    );

    const footer = screen.getByTestId("account-rail-footer");
    expect(footer).toHaveTextContent("lsave");

    await user.click(screen.getByRole("button", { name: "打开账号设置" }));

    expect(screen.getByTestId("account-settings-profile")).toHaveTextContent("lsave");
    expect(screen.getByRole("menuitem", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("shows account takeover state and takes over from the status menu", async () => {
    const user = userEvent.setup();
    const handleTakeOverAccount = vi.fn();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
      />,
    );

    expect(screen.getByRole("button", { name: "lsave 已接管" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "support 未接管" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "support 未接管" }));
    await user.click(screen.getByRole("menuitem", { name: "接管账号" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });

  it("hides unread badges for accounts that are not taken over", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });
});
