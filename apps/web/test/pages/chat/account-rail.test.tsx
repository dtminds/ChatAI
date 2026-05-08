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
    unreadCount: 7,
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

  it("shows account takeover state and takes over from the status popover", async () => {
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

    expect(screen.getByText("接管中")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "lsave 接管中" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "support 未接管" })).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "support 未接管" }));

    expect(screen.getByText("当前账号未被你接管，你将无法：")).toBeInTheDocument();
    expect(screen.getByText("使用该账号发送消息")).toBeInTheDocument();
    expect(screen.getByText("标记消息已读状态")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接管账号" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });

  it("opens and closes the takeover popover from keyboard commands", async () => {
    const user = userEvent.setup();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
        onTakeOverAccount={vi.fn()}
      />,
    );

    const statusTrigger = screen.getByRole("button", { name: "support 未接管" });

    statusTrigger.focus();

    expect(
      screen.queryByText("当前账号未被你接管，你将无法："),
    ).not.toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(
      screen.getByText("当前账号未被你接管，你将无法："),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByText("当前账号未被你接管，你将无法："),
    ).not.toBeInTheDocument();
  });

  it("uses a distinct warning treatment for untaken account labels and dots", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    const untakenBadge = screen.getByText("未接管").closest("span")?.parentElement;
    const untakenDot = untakenBadge?.querySelector("[data-testid='account-status-dot']");

    expect(untakenBadge).toHaveClass("text-warning");
    expect(untakenDot).toHaveClass("bg-warning");
  });

  it("shows taken-over account unread badges on the avatar", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    const badge = screen.getByLabelText("lsave 未读消息 7");

    expect(badge).toHaveTextContent("7");
    expect(badge.parentElement).toHaveAttribute("data-testid", "account-avatar-wrap-account-1");
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
