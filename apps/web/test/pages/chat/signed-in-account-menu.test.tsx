import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignedInAccountMenu } from "@/pages/chat/components/signed-in-account-menu";
import { useAuthStore } from "@/store/auth-store";

const logout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/pages/auth/auth-service", () => ({
  logout,
}));

describe("SignedInAccountMenu", () => {
  beforeEach(() => {
    logout.mockClear();
    useAuthStore.getState().setSession({
      accountType: "sub",
      displayName: "客服一号",
      permissions: ["chat.access", "chat.send", "chat.takeover"],
      role: "operator",
      subUserId: "sub-user-001",
      uid: 1,
    });
  });

  it("logs out from the account menu", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SignedInAccountMenu />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "打开账号菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "退出登录" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
