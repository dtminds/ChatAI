import { render, screen, waitFor } from "@testing-library/react";
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
  AvatarBadge: (props: ComponentProps<"span">) => <span {...props} />,
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
  displayName: "林洒",
  id: "emp-001",
};

describe("AccountRail", () => {
  it("shows only the signed-in sub user name in the footer menu", async () => {
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
    expect(screen.queryByTestId("account-rail-footer-account")).not.toBeInTheDocument();
    expect(footerTrigger).not.toHaveTextContent("13800138000");
    expect(footerTrigger).not.toHaveTextContent("lsave");
    expect(footerTrigger.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("account-rail-footer-avatar-fallback")).toHaveTextContent("林");

    await user.click(footerTrigger);

    const settingsProfile = screen.getByTestId("account-settings-profile");
    expect(settingsProfile).toHaveTextContent("林洒");
    expect(settingsProfile).not.toHaveTextContent("13800138000");
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
    expect(screen.queryByRole("button", { name: "support 未接管" })).not.toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择 support" }));

    expect(screen.getByText("当前账号未被你接管，你将无法")).toBeInTheDocument();
    expect(screen.getByText("使用该账号发送消息")).toBeInTheDocument();
    expect(screen.getByText("标记消息已读状态")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接管账号" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });

  it("selects a seat from the whole card surface", async () => {
    const user = userEvent.setup();
    const handleSelectAccount = vi.fn();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={handleSelectAccount}
      />,
    );

    await user.click(screen.getByRole("button", { name: "选择 support" }));

    expect(handleSelectAccount).toHaveBeenCalledWith("account-2");

    screen.getByRole("button", { name: "选择 lsave" }).focus();
    await user.keyboard("{Enter}");

    expect(handleSelectAccount).toHaveBeenCalledWith("account-1");
  });

  it("shows each seat name on the first row and status on the second row", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByText("lsave")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "lsave" })).not.toBeInTheDocument();
    expect(screen.getByTestId("account-sidebar-item-account-1")).toHaveClass("items-center");
    expect(screen.getByTestId("account-avatar-wrap-account-1")).not.toHaveClass("mt-0.5");
    expect(screen.getByTestId("account-sidebar-item-status-row-account-1")).toHaveTextContent("接管中");
    const statusBadge = screen.getByText("接管中").closest("span")?.parentElement;
    expect(statusBadge).not.toHaveClass("px-1.5");
    expect(statusBadge).not.toHaveClass("py-1");
    expect(screen.getByTestId("account-sidebar-item-status-row-account-2")).toHaveTextContent("未接管");
    expect(screen.queryByTestId("account-sidebar-item-operator-account-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-sidebar-item-operator-account-2")).not.toBeInTheDocument();
  });

  it("opens and closes the takeover popover from card hover", async () => {
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

    const card = screen.getByRole("button", { name: "选择 support" });

    expect(
      screen.queryByText("当前账号未被你接管，你将无法"),
    ).not.toBeInTheDocument();

    await user.hover(card);

    expect(
      screen.getByText("当前账号未被你接管，你将无法"),
    ).toBeInTheDocument();
    expect(screen.getByText("当前账号未被你接管，你将无法")).toHaveClass("text-warning");

    await user.unhover(card);

    await waitFor(() => {
      expect(
        screen.queryByText("当前账号未被你接管，你将无法"),
      ).not.toBeInTheDocument();
    });
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

  it("shows the product logo", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        onSelectAccount={vi.fn()}
      />,
    );

    const logo = screen.getByTestId("account-rail-logo");

    expect(logo).toHaveTextContent("ChatAI");
    expect(logo).not.toHaveClass("bg-neutral-strong");
    expect(logo.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps account avatar fallbacks on primary colors", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByTestId("account-rail-footer-avatar-fallback").parentElement).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
    expect(
      screen
        .getByTestId("account-sidebar-item-account-1")
        .querySelector(".bg-primary.text-primary-foreground"),
    ).toBeInTheDocument();
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

  it("keeps compact account status badges and takeover popovers", async () => {
    const user = userEvent.setup();
    const handleTakeOverAccount = vi.fn();
    const compactAccounts: Account[] = [
      ...accounts,
      {
        ...accounts[1],
        id: "account-offline",
        loginStatus: "offline",
        name: "offline",
        unreadCount: 0,
      },
    ];

    render(
      <AccountRail
        accounts={compactAccounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        isCollapsed
        onSelectAccount={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
      />,
    );

    expect(screen.getByLabelText("lsave 状态 已接管")).toHaveClass("bg-success");
    expect(screen.getByLabelText("support 状态 未接管")).toHaveClass("bg-warning");
    expect(screen.getByLabelText("offline 状态 离线")).toHaveClass("bg-muted-foreground/50");
    expect(screen.getByRole("button", { name: "选择 support" })).not.toHaveClass(
      "hover:bg-surface-hover",
    );

    await user.hover(screen.getByRole("button", { name: "选择 lsave" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("lsave");
    expect(screen.getByRole("tooltip")).toHaveTextContent("已接管");

    await user.unhover(screen.getByRole("button", { name: "选择 lsave" }));
    await user.hover(screen.getByRole("button", { name: "选择 support" }));

    expect(screen.getByText("support")).toBeInTheDocument();
    expect(screen.getByText("当前账号未被你接管，你将无法")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接管账号" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });
});
