import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthSubUser } from "@chatai/contracts";
import { SupportInvestigationDialog } from "@/pages/chat/components/support-investigation-dialog";
import { useAuthStore } from "@/store/auth-store";
import { useWorkbenchStore } from "@/store/workbench-store";

const authServiceMocks = vi.hoisted(() => ({
  getSupportInvestigationAccounts: vi.fn(),
  startSupportInvestigation: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/pages/auth/auth-service", () => authServiceMocks);
vi.mock("sonner", () => ({ toast }));

const supportSubUser: AuthSubUser = {
  accessMode: "support_readonly",
  accountType: "sub",
  canStartSupportInvestigation: false,
  displayName: "销售客服",
  permissions: ["chat.access", "chat.send", "chat.takeover"],
  role: "operator",
  subUserId: "201",
  uid: 9001,
};

describe("SupportInvestigationDialog", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("shows the account and reason fields before a UID is queried", () => {
    render(
      <MemoryRouter>
        <SupportInvestigationDialog onOpenChange={vi.fn()} open />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText("选择租户账号后进入只读聊天工作台"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("筛选账号名称或登录账号"),
    ).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "排查原因" })).toBeDisabled();
  });

  it("queries a UID, filters target accounts, and starts the selected investigation", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    authServiceMocks.getSupportInvestigationAccounts.mockResolvedValue({
      data: {
        accounts: [
          {
            accountType: "main",
            displayName: "主账号",
            maskedAccount: "ow****er",
            role: "owner",
            subUserId: "1",
            uid: 9001,
          },
          {
            accountType: "sub",
            displayName: "销售客服",
            maskedAccount: "sa****nt",
            role: "operator",
            subUserId: "201",
            uid: 9001,
          },
        ],
      },
    });
    authServiceMocks.startSupportInvestigation.mockResolvedValue({
      data: {
        expiresIn: 1800,
        subUser: supportSubUser,
      },
    });
    useWorkbenchStore.setState({
      activeAccountId: "actor-seat",
      bootstrapStatus: "ready",
    });

    render(
      <MemoryRouter>
        <SupportInvestigationDialog onOpenChange={onOpenChange} open />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("租户 UID"), "9001");
    await user.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() => {
      expect(authServiceMocks.getSupportInvestigationAccounts).toHaveBeenCalledWith(9001);
    });
    expect(screen.getByRole("radio", { name: /主账号/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /销售客服/ })).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("筛选账号名称或登录账号"),
      "sa",
    );

    expect(screen.queryByRole("radio", { name: /^主账号/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /销售客服/ }));
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "产品观测" }));
    await user.click(screen.getByRole("button", { name: "开始排查" }));

    await waitFor(() => {
      expect(authServiceMocks.startSupportInvestigation).toHaveBeenCalledWith({
        reason: "产品观测",
        subUserId: "201",
        uid: 9001,
      });
    });
    expect(useAuthStore.getState().subUser).toEqual(supportSubUser);
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "",
      bootstrapStatus: "idle",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears an invalid UID error when the UID changes", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SupportInvestigationDialog onOpenChange={vi.fn()} open />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("租户 UID"), "abc");
    await user.click(screen.getByRole("button", { name: "查询" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("租户 UID"));
    await user.type(screen.getByLabelText("租户 UID"), "9001");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts UID query failures", async () => {
    const user = userEvent.setup();
    authServiceMocks.getSupportInvestigationAccounts.mockRejectedValueOnce(
      new Error("query failed"),
    );

    render(
      <MemoryRouter>
        <SupportInvestigationDialog onOpenChange={vi.fn()} open />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("租户 UID"), "9001");
    await user.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("query failed");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
