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
    window.localStorage.setItem("chatai.refreshToken", "test-refresh-token");
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
    expect(screen.getByLabelText("策略名称")).toHaveValue("接待策略");

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(
      screen.queryByRole("dialog", { name: "编辑接待策略" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开停用确认" }));

    expect(screen.getByRole("alertdialog", { name: "停用接待策略" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveClass("rounded-[8px]");
    expect(screen.getByRole("button", { name: "确认停用" })).toHaveClass("rounded-[8px]");
  });

  it("shows extended UI component demos for common B2B settings patterns", async () => {
    const user = userEvent.setup();
    renderRoute("/chat/settings/ui-kit");

    expect(await screen.findByRole("heading", { name: "组件示例" })).toBeInTheDocument();
    expect(screen.getByText("同步失败：企微素材库暂时不可用")).toBeInTheDocument();
    expect(screen.getByText("导入进度")).toBeInTheDocument();
    expect(screen.getByText("加载占位")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "设置路径" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "分页" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "质检抽样比例" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "媒体比例预览" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开右侧抽屉" }));

    expect(screen.getByRole("dialog", { name: "编辑账号详情" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "高级分配规则" }));

    expect(screen.getByText("启用后会优先沿用最近一次服务关系。")).toBeInTheDocument();
  });
});
