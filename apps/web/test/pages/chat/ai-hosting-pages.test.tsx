import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AgentManagementPage } from "@/pages/chat/ai-hosting/agent-management-page";
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
  it("renders the agent management page", async () => {
    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 管理" })).toBeInTheDocument();
    expect(
      screen.getByText("创建和管理负责客户接待的智能体"),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "智能体导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent 管理" })).toHaveAttribute(
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
    const doubaoIcons = screen.getAllByTitle("模型图标：Doubao-2.0-lite");

    expect(doubaoIcons).toHaveLength(3);
    expect(doubaoIcons[0].querySelector("img")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/llm/doubao-color.svg",
    );
    expect(screen.getByRole("link", { name: "添加 Agent" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents/new",
    );
  });

  it("filters agents by search query", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });

    await user.type(screen.getByRole("textbox", { name: "搜索 Agent 名称" }), "售后");

    expect(screen.getByRole("cell", { name: "售后小助理" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "护肤小助理" })).not.toBeInTheDocument();
  });

  it("renders the application scope tab", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });
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

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.type(screen.getByRole("textbox", { name: "搜索企微账号" }), "小助理2");

    expect(screen.getByText("小助理2")).toBeInTheDocument();
    expect(screen.queryByText("小助理1")).not.toBeInTheDocument();
    expect(screen.queryByText("小助理3")).not.toBeInTheDocument();
  });

  it("opens the batch settings dialog from row settings", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });
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

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });
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

    await screen.findByRole("heading", { level: 1, name: "Agent 管理" });
    await user.click(screen.getByRole("tab", { name: "应用范围" }));
    await user.click(screen.getAllByRole("button", { name: "设置" })[0]);
    await user.click(screen.getByRole("switch", { name: "全自动托管权限" }));
    await user.click(screen.getByRole("switch", { name: "话术推荐" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.queryByRole("dialog", { name: "批量设置" })).not.toBeInTheDocument();
    expect(screen.getAllByText("启用")).toHaveLength(6);
    expect(screen.queryAllByText("关闭")).toHaveLength(0);
  });

  it("navigates to agent settings page from add agent link", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
    expect(screen.getByRole("button", { name: "发布正式版" })).toBeInTheDocument();
    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.getByText("回复基调")).toBeInTheDocument();
    expect(screen.getByText("角色")).toBeInTheDocument();
    expect(screen.getByText("沟通风格")).toBeInTheDocument();
    expect(screen.getByText("条件逻辑")).toBeInTheDocument();
    expect(screen.getByText("转人工条件")).toBeInTheDocument();
    expect(screen.getByTitle("模型图标：默认模型")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent 模拟测试")).toBeInTheDocument();
    expect(screen.getByText("我想了解下晨间护肤")).toBeInTheDocument();
  });

  it("keeps the selected model icon and label in one trigger row", async () => {
    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });

    const trigger = screen.getByRole("combobox", { name: "大模型" });

    expect(trigger.querySelector("[data-agent-model-trigger-value]")).toBeInTheDocument();
  });

  it("renders model icons in the model selector options", async () => {
    const user = userEvent.setup();

    renderWithRoute("/chat/ai-hosting/agents/new", <AgentSettingsPage />);

    await screen.findByRole("heading", { level: 1, name: "Agent设置" });
    await user.click(screen.getByRole("combobox", { name: "大模型" }));

    expect(screen.getAllByTitle("模型图标：默认模型")).toHaveLength(2);
    expect(screen.getByTitle("模型图标：Doubao-2.0-lite")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "默认模型" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Doubao-2.0-lite" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "开始生成" })).toHaveAttribute(
      "data-agent-generate-gradient-button",
      "true",
    );
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

    await user.click(descriptionInput);
    await user.paste("111 ");
    await user.click(screen.getByRole("button", { name: "添加关联知识库" }));
    await user.click(screen.getByRole("button", { name: "美妆知识大全" }));

    const conditionalLogicGroup = screen.getByRole("group", { name: "条件逻辑" });

    expect(conditionalLogicGroup).toHaveTextContent("111");
    expect(conditionalLogicGroup).toHaveTextContent("美妆知识大全");

    await user.click(descriptionInput);
    await user.paste("xxx 333 ");
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
