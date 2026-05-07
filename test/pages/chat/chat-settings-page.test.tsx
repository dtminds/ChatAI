import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { routerConfig } from "@/router";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";

function renderRoute(initialEntry = "/chat") {
  const router = createMemoryRouter(routerConfig, {
    initialEntries: [initialEntry],
  });

  render(<RouterProvider router={router} />);

  return router;
}

describe("Chat settings pages", () => {
  beforeEach(() => {
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("opens settings from the account menu and returns to /chat", async () => {
    const user = userEvent.setup();
    const router = renderRoute("/chat");

    await screen.findByPlaceholderText("请输入消息……");
    await user.click(screen.getByRole("button", { name: "打开账号设置" }));
    await user.click(screen.getByRole("menuitem", { name: "设置" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat/settings");
    });
    expect(screen.getByRole("navigation", { name: "设置菜单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "德仁堂 接管中" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "企微账号" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回应用" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/chat");
    });
  });

  it("shows demo CRUD and form reference pages inside the settings shell", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    expect(await screen.findByRole("heading", { name: "企微账号" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "企微账号列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 护肤小助理" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "子账号管理" }));

    expect(screen.getByRole("heading", { name: "子账号管理" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "子账号表单" })).toBeInTheDocument();
    expect(screen.getByLabelText("员工姓名")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "权限角色" }));

    expect(screen.getByRole("heading", { name: "权限角色" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "角色权限矩阵" })).toBeInTheDocument();
  });

  it("shows basic UI component demos for settings development references", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings");

    await user.click(await screen.findByRole("link", { name: "组件示例" }));

    expect(screen.getByRole("heading", { name: "组件示例" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "分配策略" })).toBeInTheDocument();
    expect(screen.getByLabelText("排班日期")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开编辑弹窗" }));

    expect(screen.getByRole("dialog", { name: "编辑接待策略" })).toBeInTheDocument();
    expect(screen.getByLabelText("策略名称")).toHaveValue("自动分配");

    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "打开停用确认" }));

    expect(screen.getByRole("alertdialog", { name: "停用接待策略" })).toBeInTheDocument();
  });
});
