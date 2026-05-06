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
    tone: "专业",
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
});
