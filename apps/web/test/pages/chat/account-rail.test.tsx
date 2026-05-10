import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountRail } from "@/pages/chat/components/account-rail";
import type { Account, EmployeeProfile } from "@/pages/chat/chat-types";

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarFallback: ({ children, ...props }: ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: (props: ComponentProps<"img">) => <img {...props} />,
}));

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

const currentEmployee: EmployeeProfile = {
  account: "13800138000",
  displayName: "林洒",
  id: "emp-001",
};

describe("AccountRail", () => {
  it("shows the signed-in sub user name and account in the footer menu", async () => {
    const user = userEvent.setup();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onSelectAccount={vi.fn()}
      />,
    );

    const footerTrigger = screen.getByRole("button", { name: "打开账号菜单" });
    expect(footerTrigger).toHaveTextContent("林洒");
    expect(footerTrigger).toHaveTextContent("13800138000");
    expect(footerTrigger).not.toHaveTextContent("lsave");
    expect(footerTrigger.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("account-rail-footer-avatar-fallback")).toHaveTextContent("林");

    await user.click(footerTrigger);

    const settingsProfile = screen.getByTestId("account-settings-profile");
    expect(settingsProfile).toHaveTextContent("林洒");
    expect(settingsProfile).toHaveTextContent("13800138000");
    expect(settingsProfile).not.toHaveTextContent("lsave");
    expect(settingsProfile.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "退出登录" })).toBeInTheDocument();
  });

  it("uses the first user-name grapheme as avatar fallback", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={{
          account: "13800138000",
          displayName: "👩‍💼小林",
          id: "emp-001",
        }}
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByTestId("account-rail-footer-avatar-fallback")).toHaveTextContent(
      "👩‍💼",
    );
  });

  it("shows one footer text row when sub user name and account are the same", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={{
          account: "13800138000",
          displayName: "13800138000",
          id: "emp-001",
        }}
        onSelectAccount={vi.fn()}
      />,
    );

    const footerTrigger = screen.getByRole("button", { name: "打开账号菜单" });

    expect(footerTrigger).toHaveTextContent("13800138000");
    expect(screen.queryByTestId("account-rail-footer-account")).not.toBeInTheDocument();
  });

  it("calls logout from the account settings menu", async () => {
    const user = userEvent.setup();
    const handleLogout = vi.fn();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onLogout={handleLogout}
        onSelectAccount={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    expect(handleLogout).toHaveBeenCalledTimes(1);
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
