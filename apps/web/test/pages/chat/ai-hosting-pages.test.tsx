import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
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
  it("renders the agent management placeholder", async () => {
    renderWithRoute("/chat/ai-hosting/agents", <AgentManagementPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent管理" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "AI托管导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent管理" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/agents",
    );
    expect(screen.getByRole("link", { name: "知识库" })).toHaveAttribute(
      "href",
      "/chat/ai-hosting/knowledge",
    );
  });

  it("renders the knowledge base placeholder", async () => {
    renderWithRoute("/chat/ai-hosting/knowledge", <KnowledgeBasePage />);

    expect(await screen.findByRole("heading", { level: 1, name: "知识库" })).toBeInTheDocument();
    expect(screen.getByText("功能建设中")).toBeInTheDocument();
  });
});
