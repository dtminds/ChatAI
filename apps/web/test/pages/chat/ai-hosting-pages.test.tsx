import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AgentManagementPage } from "@/pages/chat/ai-hosting/agent-management-page";
import { KnowledgeBasePage } from "@/pages/chat/ai-hosting/knowledge-base-page";

function renderWithRoute(path: string, element: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element,
      },
    ],
    { initialEntries: [path] },
  );

  return render(<RouterProvider router={router} />);
}

describe("AI hosting pages", () => {
  it("renders the agent management page", async () => {
    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent管理" })).toBeInTheDocument();
    expect(
      screen.getByText("用自然语言描述并管理Agent的人设、语气、条件逻辑等"),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "AI托管导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent管理" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents",
    );
    expect(screen.getByRole("link", { name: "知识库" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/knowledge",
    );
    expect(screen.getByRole("button", { name: "帮助手册" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "数据总览" })).toBeInTheDocument();
    expect(screen.getByText("会话总数")).toBeInTheDocument();
    expect(screen.getByText("256")).toBeInTheDocument();
    expect(screen.getByText("人工发送消息数")).toBeInTheDocument();
    expect(screen.getByText("865")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Agent列表" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "护肤小助理" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "售后小助理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "添加Agent" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents/new",
    );
  });

  it("filters agents by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });

    await user.type(screen.getByRole("textbox", { name: "搜索Agent名称" }), "售后");

    expect(screen.getByRole("cell", { name: "售后小助理" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "护肤小助理" })).not.toBeInTheDocument();
  });

  it("renders the application scope tab", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));

    expect(screen.getByRole("textbox", { name: "搜索企微账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量设置" })).toBeDisabled();
    expect(screen.getByRole("table", { name: "应用范围列表" })).toBeInTheDocument();
    expect(screen.getByText("小助理1")).toBeInTheDocument();
    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.getByText("小助理3")).toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(4);
    expect(screen.getAllByText("关闭")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "设置" })).toHaveLength(3);
  });

  it("filters application scope accounts by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.type(screen.getByRole("textbox", { name: "搜索企微账号" }), "小助理2");

    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.queryByText("小助理1")).not.toBeInTheDocument();
    expect(screen.queryByText("小助理3")).not.toBeInTheDocument();
  });

  it("opens the batch settings dialog from row settings", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);

    const dialog = screen.getByRole("dialog", { name: "批量设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("已选企微账号");
    expect(dialog).toHaveTextContent("小助理1");
    expect(dialog).toHaveTextContent("全自动托管权限");
    expect(dialog).toHaveTextContent("话术推荐");
    expect(screen.getByRole("button", { name: "保存设置" })).toBeInTheDocument();
  });

  it("opens the batch settings dialog from batch action", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.click(screen.getByRole("checkbox", { name: "选择小助理2" }));
    await user.click(screen.getByRole("checkbox", { name: "选择小助理3" }));
    await user.click(screen.getByRole("button", { name: "批量设置" }));

    const dialog = screen.getByRole("dialog", { name: "批量设置" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("小助理2");
    expect(dialog).toHaveTextContent("小助理3");
  });

  it("saves application scope settings from the dialog", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    await user.click(screen.getByRole("switch", { name: "全自动托管权限" }));
    await user.click(screen.getByRole("switch", { name: "话术推荐" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.queryByRole("dialog", { name: "批量设置" })).not.toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(6);
    expect(screen.queryAllByText("关闭")).toHaveLength(0);
  });

  it("renders the knowledge base placeholder", async () => {
    renderWithRoute("/chat/ai-hosting/knowledge", <KnowledgeBasePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByText("功能建设中")).toBeInTheDocument();
  });
});
