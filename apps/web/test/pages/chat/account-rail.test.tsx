import {
  fireEvent,
  render as testingLibraryRender,
  screen,
  waitFor,
  within,
  type RenderOptions,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceThemes } from "@/lib/appearance-theme";
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

function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return testingLibraryRender(ui, { wrapper: MemoryRouter, ...options });
}

describe("AccountRail", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.appearanceTheme;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("keeps nested menus open while previewing theme colors and appearance modes", async () => {
    const user = userEvent.setup();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onSelectAccount={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.hover(screen.getByRole("menuitem", { name: /主题颜色/ }));

    await screen.findByRole("menuitemradio", { name: "Claude" });
    for (const theme of appearanceThemes) {
      expect(
        screen.getByRole("menuitemradio", { name: theme.name }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Claude" }));

    expect(document.documentElement).toHaveAttribute(
      "data-appearance-theme",
      "claude",
    );
    expect(window.localStorage.getItem("chat-ai-appearance-theme")).toBe("claude");
    expect(
      screen.getByRole("menuitemradio", { name: "Green" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Green" }));

    expect(document.documentElement).toHaveAttribute(
      "data-appearance-theme",
      "green",
    );
    expect(window.localStorage.getItem("chat-ai-appearance-theme")).toBe("green");

    await user.hover(screen.getByRole("menuitem", { name: /外观模式/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "深色" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("dark");
    expect(
      screen.getByRole("menuitemradio", { name: "浅色" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "浅色" }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("light");
  });

  it("applies the current system color scheme when selecting follow system", async () => {
    const user = userEvent.setup();
    setSystemColorScheme(true);
    window.localStorage.setItem("chat-ai-theme", "light");

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onSelectAccount={vi.fn()}
      />,
    );

    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.hover(screen.getByRole("menuitem", { name: /外观模式/ }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "跟随系统" }),
    );

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("system");
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

  it("notifies when the customer nav item is selected", async () => {
    const user = userEvent.setup();
    const handleNavItemSelect = vi.fn();

    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onNavItemSelect={handleNavItemSelect}
        onSelectAccount={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "客户" }));

    expect(handleNavItemSelect).toHaveBeenCalledWith("客户");
  });

  it("links the insight nav item to the insights overview", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onSelectAccount={vi.fn()}
      />,
    );

    const insightLink = screen.getByRole("link", { name: "洞察" });

    expect(insightLink).toHaveAttribute("href", "/chat/insights");
    expect(within(insightLink).getByText("Beta")).toBeInTheDocument();
  });

  it("links the AI hosting nav item to the agent management entry", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployee={currentEmployee}
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "智能体" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting",
    );
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

    await user.click(screen.getByRole("button", { name: "接管账号" }));

    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "是否确认接管：support",
    });
    expect(
      within(confirmDialog).getByText(
        "接管后，将由你负责处理对话，其他子账号将无权发送消息",
      ),
    ).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "确认接管" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });

  it("keeps the takeover popover open with a loading button while takeover is pending", async () => {
    const user = userEvent.setup();
    const handleTakeOverAccount = vi.fn();
    const { rerender } = render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "选择 support" }));
    await user.click(screen.getByRole("button", { name: "接管账号" }));

    rerender(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
        takeoverStatusByAccountId={{ "account-2": "taking-over" }}
      />,
    );

    expect(
      await screen.findByRole("alertdialog", {
        name: "是否确认接管：support",
      }),
    ).toBeInTheDocument();
    const confirmDialog = screen.getByRole("alertdialog", {
      name: "是否确认接管：support",
    });
    expect(within(confirmDialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(confirmDialog).getByRole("button", { name: "确认接管" })).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "确认接管" }));

    expect(handleTakeOverAccount).toHaveBeenCalledTimes(1);
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
    expect(screen.getByTestId("account-sidebar-item-status-row-account-1")).toHaveTextContent("接管中");
    expect(screen.getByTestId("account-sidebar-item-status-row-account-2")).toHaveTextContent("未接管");
    expect(screen.queryByTestId("account-sidebar-item-operator-account-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-sidebar-item-operator-account-2")).not.toBeInTheDocument();
  });

  it("shows expired seats before online or takeover status", async () => {
    const user = userEvent.setup();
    const handleTakeOverAccount = vi.fn();

    render(
      <AccountRail
        accounts={[
          accounts[0],
          {
            ...accounts[1],
            bizStatus: 0,
            expireTime: 1,
            takenOverEmployeeId: "emp-001",
          },
        ]}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
        takeoverStatusByAccountId={{ "account-2": "taking-over" }}
      />,
    );

    expect(screen.getByTestId("account-sidebar-item-status-row-account-2")).toHaveTextContent(
      "席位已失效",
    );

    await user.hover(screen.getByRole("button", { name: "选择 support" }));

    expect(screen.queryByRole("button", { name: "接管账号" })).not.toBeInTheDocument();
    expect(handleTakeOverAccount).not.toHaveBeenCalled();
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

    await user.unhover(card);

    await waitFor(() => {
      expect(
        screen.queryByText("当前账号未被你接管，你将无法"),
      ).not.toBeInTheDocument();
    });
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
    expect(logo.querySelector("svg")).toBeInTheDocument();
  });

  it("shows numeric unread badges for taken-over accounts", () => {
    const takenOverAccounts = [
      accounts[0],
      {
        ...accounts[1],
        takenOverEmployeeId: "emp-001",
      },
    ];

    render(
      <AccountRail
        accounts={takenOverAccounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    const activeBadge = screen.getByLabelText("lsave 有 7 条未读消息");

    expect(activeBadge).toHaveAttribute("data-testid", "account-unread-count-account-1");

    const badge = screen.getByLabelText("support 有 2 条未读消息");

    expect(badge).toHaveAttribute("data-testid", "account-unread-count-account-2");
    expect(badge.parentElement).toHaveAttribute("data-testid", "account-avatar-wrap-account-2");
  });

  it("shows unread badges for accounts that are not taken over", () => {
    render(
      <AccountRail
        accounts={accounts}
        activeAccountId="account-1"
        currentEmployeeId="emp-001"
        onSelectAccount={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("support 有 2 条未读消息")).toHaveAttribute(
      "data-testid",
      "account-unread-count-account-2",
    );
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

    expect(screen.getByLabelText("lsave 状态 已接管")).toBeInTheDocument();
    expect(screen.getByLabelText("support 状态 未接管")).toBeInTheDocument();
    expect(screen.getByLabelText("offline 状态 离线")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择 lsave" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("lsave");
    expect(screen.getByRole("tooltip")).toHaveTextContent("已接管");

    await user.unhover(screen.getByRole("button", { name: "选择 lsave" }));
    await user.hover(screen.getByRole("button", { name: "选择 support" }));

    expect(screen.getByText("support")).toBeInTheDocument();
    expect(screen.getByText("当前账号未被你接管，你将无法")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接管账号" }));

    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "是否确认接管：support",
    });
    await user.click(within(confirmDialog).getByRole("button", { name: "确认接管" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
  });
});

function setSystemColorScheme(matches: boolean) {
  let currentMatches = matches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(
      (event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") {
          listeners.add(listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === "change") {
          listeners.delete(listener);
        }
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.spyOn(window, "matchMedia").mockReturnValue(
    mediaQuery as unknown as MediaQueryList,
  );

  return mediaQuery;
}
