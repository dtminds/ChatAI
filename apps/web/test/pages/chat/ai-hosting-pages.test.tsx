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

  it("renders the knowledge base placeholder", async () => {
    renderWithRoute("/chat/ai-hosting/knowledge", <KnowledgeBasePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByText("功能建设中")).toBeInTheDocument();
  });
});
