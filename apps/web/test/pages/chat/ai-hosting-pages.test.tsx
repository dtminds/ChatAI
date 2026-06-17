import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AgentSettingsPage } from "@/pages/chat/ai-hosting/agent-settings-page";
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
  it("navigates to agent settings page from add agent link", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布正式版" })).toBeInTheDocument();
    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.getByText("回复基调")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("沟通风格")).toBeInTheDocument();
    expect(screen.getByText("条件逻辑")).toBeInTheDocument();
    expect(screen.getByText("转人工条件")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 模拟测试")).toBeInTheDocument();
    expect(screen.getByText("我想了解下晨间护肤")).toBeInTheDocument();
  });

  it("opens generate dialog from the generate button", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    const dialog = screen.getByRole("dialog", { name: "智能生成" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("按实际情况填写表单后，AI会帮您自动生成Agent的配置内容");
    expect(screen.getByLabelText("行业")).toBeInTheDocument();
    expect(screen.getByLabelText("请问您为客户提供哪些服务/商品?")).toBeInTheDocument();
    expect(screen.getByLabelText("您希望AI扮演什么样的角色?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });

  it("shows generation progress after starting generate", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("button", { name: "智能生成" }));

    await user.click(screen.getByRole("combobox", { name: "行业" }));
    await user.click(screen.getByRole("option", { name: "美妆护肤" }));
    await user.type(screen.getByLabelText("请问您为客户提供哪些服务/商品?"), "护肤咨询");
    await user.click(screen.getByRole("combobox", { name: "您希望AI扮演什么样的角色?" }));
    await user.click(screen.getByRole("option", { name: "品牌客服" }));
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    expect(screen.getByText("生成进度")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("输入文本")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "生成进度" })).toBeInTheDocument();
  });

  it("opens publish dialog from the publish button", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("button", { name: "发布正式版" }));

    const dialog = screen.getByRole("dialog", { name: "是否确认发布到正式版？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认发布后，Agent配置将立即生效。");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
  });

  it("opens restore draft dialog from the draft banner", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    expect(screen.getByText(/当前为未发布的草稿/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "还原为正式版内容" }));

    const dialog = screen.getByRole("dialog", { name: "是否还原到正式版内容？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认还原后，将无法恢复当前草稿内容");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
  });

  it("inserts knowledge bases inline with conditional logic text", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    expect(
      screen.getByText(
        "配置 Agent 在不同客户问题、业务场景或会话状态下的处理方式，例如商品咨询调用知识库",
      ),
    ).toBeInTheDocument();

    const descriptionInput = screen.getByLabelText("条件逻辑描述");

    await user.type(descriptionInput, "111 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));
    await user.click(screen.getByRole("button", { name: "美妆知识大全" }));

    const conditionalLogicGroup = screen.getByRole("group", { name: "条件逻辑" });

    expect(conditionalLogicGroup).toHaveTextContent("111");
    expect(conditionalLogicGroup).toHaveTextContent("美妆知识大全");

    await user.type(descriptionInput, "xxx 333 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));
    await user.click(screen.getByRole("button", { name: "彩妆精选" }));

    expect(conditionalLogicGroup).toHaveTextContent("彩妆精选");
    expect(conditionalLogicGroup).toHaveTextContent("xxx 333");
  });

  it("collapses and expands agent settings sections", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: true }));

    expect(screen.queryByLabelText("角色描述")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色设置", expanded: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "角色设置", expanded: false }));

    expect(screen.getByLabelText("角色描述")).toBeInTheDocument();
  });

  it("renders the knowledge base placeholder", async () => {
    renderWithRoute("/chat/ai-hosting/knowledge", <KnowledgeBasePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByText("功能建设中")).toBeInTheDocument();
  });
});
