import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account } from "@/pages/chat/chat-types";

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarBadge: (props: React.ComponentProps<"span">) => <span {...props} />,
  AvatarFallback: ({ children, ...props }: React.ComponentProps<"span">) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: (props: React.ComponentProps<"img">) => <img {...props} />,
}));

const baseAccount: Account = {
  id: "account-1",
  avatarUrl: "https://example.com/avatar.png",
  description: "客服账号",
  loginStatus: "online",
  metrics: {
    activeCustomers: 1,
    agents: 1,
    stores: 1,
    totalCustomers: 2,
  },
  name: "lsave",
  operator: "lsave",
  phone: "13800000000",
  takenOverEmployeeId: "emp-001",
  tone: "专业",
  unreadCount: 7,
};

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe("AccountSidebarItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides unread indicators for the active seat without clearing unread state", () => {
    render(
      <AccountSidebarItem
        account={baseAccount}
        currentEmployeeId="emp-001"
        isActive
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.queryByLabelText("lsave 有未读消息")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-unread-dot-account-1")).not.toBeInTheDocument();
  });

  it("shows a red dot for non-active taken-over seats with unread activity", () => {
    render(
      <AccountSidebarItem
        account={baseAccount}
        currentEmployeeId="emp-001"
        isActive={false}
        onClick={vi.fn()}
        takeoverStatus="idle"
      />,
    );

    expect(screen.getByLabelText("lsave 有未读消息")).toHaveAttribute(
      "data-testid",
      "account-unread-dot-account-1",
    );
    expect(screen.getByTestId("account-unread-dot-account-1")).toBeInTheDocument();
  });

  it("keeps the takeover confirmation open with a loading action until takeover finishes", async () => {
    const user = userEvent.setup();
    const takeoverGate = createDeferred();
    const handleTakeOverAccount = vi.fn(() => takeoverGate.promise);
    const untakenAccount: Account = {
      ...baseAccount,
      id: "account-2",
      name: "support",
      takenOverEmployeeId: undefined,
      unreadCount: 0,
    };

    render(
      <AccountSidebarItem
        account={untakenAccount}
        currentEmployeeId="emp-001"
        isActive={false}
        onClick={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
        takeoverStatus="idle"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "选择 support" }));
    await user.click(await screen.findByRole("button", { name: "接管账号" }));

    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "是否确认接管：support",
    });
    await user.click(within(confirmDialog).getByRole("button", { name: "确认接管" }));

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-2");
    const pendingDialog = screen.getByRole("alertdialog", {
      name: "是否确认接管：support",
    });
    const loadingAction = within(pendingDialog).getByRole("button", {
      name: "接管中",
    });
    expect(loadingAction).toBeDisabled();
    expect(loadingAction).toHaveAttribute("aria-busy", "true");
    expect(within(pendingDialog).getByRole("button", { name: "取消" })).toBeDisabled();

    takeoverGate.resolve();

    await waitFor(() => {
      expect(
        screen.queryByRole("alertdialog", {
          name: "是否确认接管：support",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not update takeover confirmation state after unmount while takeover is pending", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const takeoverGate = createDeferred();
    const handleTakeOverAccount = vi.fn(() => takeoverGate.promise);
    const untakenAccount: Account = {
      ...baseAccount,
      id: "account-3",
      name: "async support",
      takenOverEmployeeId: undefined,
      unreadCount: 0,
    };

    const { unmount } = render(
      <AccountSidebarItem
        account={untakenAccount}
        currentEmployeeId="emp-001"
        isActive={false}
        onClick={vi.fn()}
        onTakeOverAccount={handleTakeOverAccount}
        takeoverStatus="idle"
      />,
    );

    await user.hover(screen.getByRole("button", { name: "选择 async support" }));
    await user.click(await screen.findByRole("button", { name: "接管账号" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "是否确认接管：async support",
        }),
      ).getByRole("button", { name: "确认接管" }),
    );

    expect(handleTakeOverAccount).toHaveBeenCalledWith("account-3");

    unmount();

    await act(async () => {
      takeoverGate.resolve();
      await takeoverGate.promise;
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
