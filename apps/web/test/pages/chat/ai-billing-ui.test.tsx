import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiBillingGuidePage } from "@/pages/chat/ai-hosting/ai-billing-guide-page";
import { AgentHostingSettingsPage } from "@/pages/chat/ai-hosting/agent-hosting-settings-page";
import { AgentSubscriptionPage } from "@/pages/chat/ai-hosting/agent-subscription-page";
import * as agentService from "@/pages/chat/ai-hosting/agent-service";
import {
  AI_BILLING_GUIDE_PATH,
  AI_BILLING_SUBSCRIPTION_PATH,
} from "@/pages/chat/billing/ai-credit-billing";
import { BillingBadge } from "@/pages/chat/billing/billing-badge";

vi.mock("@/pages/chat/ai-hosting/agent-service", () => ({
  listAiHostingModels: vi.fn(),
}));

vi.mock("@/pages/chat/ai-hosting/ai-hosting-layout", () => ({
  AiHostingLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AiHostingPageHeader: ({
    actions,
    description,
    title,
    titleActions,
  }: {
    actions?: ReactNode;
    description?: string;
    title: ReactNode;
    titleActions?: ReactNode;
  }) => (
    <header>
      <div><h1>{title}</h1>{titleActions}</div>
      {description ? <p>{description}</p> : null}
      {actions}
    </header>
  ),
}));

vi.mock("@/pages/chat/ai-hosting/single-chat-hosting-settings-tab", () => ({
  SingleChatHostingSettingsTab: () => <div>托管设置内容</div>,
}));

describe("AI billing UI", () => {
  beforeEach(() => {
    vi.mocked(agentService.listAiHostingModels).mockResolvedValue({
      models: [{
        creditMultiplier: 150,
        description: "适合复杂任务",
        id: "1",
        label: "Turbo 模型",
        model: "turbo",
        name: "Turbo 模型",
        supportMultimodal: false,
      }],
    });
  });

  it("routes the shared AI Pro badge to the AI Pro page", async () => {
    const router = createMemoryRouter([
      { path: "/source", element: <BillingBadge /> },
      { path: AI_BILLING_SUBSCRIPTION_PATH, element: <div>AI Pro 页面</div> },
    ], { initialEntries: ["/source"] });

    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole("link", { name: "前往 AI Pro 页面" }));

    expect(await screen.findByText("AI Pro 页面")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(AI_BILLING_SUBSCRIPTION_PATH);
  });

  it("renders the shared billing badge outside a router", () => {
    render(<BillingBadge />);

    expect(screen.getByText("AI Pro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 AI Pro 页面" })).toHaveAttribute(
      "href",
      AI_BILLING_SUBSCRIPTION_PATH,
    );
  });

  it("shows the billing entry beside the hosting settings title", () => {
    render(<AgentHostingSettingsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "托管设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 AI Pro 页面" })).toBeInTheDocument();
  });

  it("opens the billing guide without changing the existing AI Pro content", async () => {
    const router = createMemoryRouter([
      { path: AI_BILLING_SUBSCRIPTION_PATH, element: <AgentSubscriptionPage /> },
      { path: AI_BILLING_GUIDE_PATH, element: <AiBillingGuidePage /> },
    ], { initialEntries: [AI_BILLING_SUBSCRIPTION_PATH] });

    render(<RouterProvider router={router} />);

    expect(screen.getByText("剩余 100%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "用量消耗列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理套餐" })).toBeDisabled();
    await userEvent.click(screen.getByRole("link", { name: "计费说明" }));

    expect(await screen.findByRole("heading", { level: 1, name: "计费说明" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(AI_BILLING_GUIDE_PATH);

    await userEvent.click(screen.getByRole("link", { name: "返回 AI Pro" }));
    expect(await screen.findByRole("heading", { level: 1, name: "AI Pro" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(AI_BILLING_SUBSCRIPTION_PATH);
  });

  it("shows the confirmed base prices and model multipliers", async () => {
    const router = createMemoryRouter([
      { path: AI_BILLING_GUIDE_PATH, element: <AiBillingGuidePage /> },
    ], { initialEntries: [AI_BILLING_GUIDE_PATH] });

    render(<RouterProvider router={router} />);

    const rows = screen.getAllByRole("row");
    const expectedPrices = [
      ["生成回复", "1 积分"],
      ["会话洞察", "4 积分"],
      ["用户记忆", "1.5 积分"],
      ["意图识别节点", "0.1 积分"],
      ["大模型节点", "1 积分"],
      ["资料收集节点", "1 积分"],
    ];

    expect(await screen.findByText("1.5x")).toBeInTheDocument();
    expect(screen.getByText("Turbo 模型")).toBeInTheDocument();
    expect(screen.getByText("适合复杂任务")).toBeInTheDocument();
    expect(screen.getByTitle("模型图标：Turbo 模型")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "模型倍率" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "基础积分" })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "备注" })).toBeInTheDocument();
    const billingLabels = [
      "Agent",
      "生成回复",
      "用户记忆",
      "工作流",
      "意图识别节点",
      "大模型节点",
      "资料收集节点",
      "洞察",
      "会话洞察",
    ];
    expect(rows.flatMap((row) => billingLabels.filter((label) => within(row).queryByText(label)))).toEqual(billingLabels);
    for (const [name, credits] of expectedPrices) {
      const row = rows.find((candidate) => within(candidate).queryByText(name));
      expect(row).toBeDefined();
      expect(within(row!).getByText(credits)).toBeInTheDocument();
    }
  });
});
