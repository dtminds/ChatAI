import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ChatInsightsPage } from "@/pages/chat/insights/chat-insights-page";

function renderInsightsPage() {
  return render(
    <MemoryRouter>
      <ChatInsightsPage />
    </MemoryRouter>,
  );
}

describe("ChatInsightsPage", () => {
  it("renders the ecommerce insight dashboard with product signals", () => {
    renderInsightsPage();

    expect(screen.getByRole("heading", { name: "电商洞察" })).toBeInTheDocument();
    expect(screen.getByText("待处理事项")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "风险" })).toBeInTheDocument();
    expect(screen.getByText("白色羽绒服")).toBeInTheDocument();
    expect(screen.getByText("咨询 86")).toBeInTheDocument();
    expect(screen.getByText("袖口做工和退换政策说明")).toBeInTheDocument();
  });

  it("opens evidence for a priority conversation", async () => {
    const user = userEvent.setup();
    renderInsightsPage();

    await user.click(screen.getByTestId("priority-item-risk-1"));

    const drawer = await screen.findByRole("dialog", {
      name: "林女士",
    });
    expect(
      within(drawer).getByText("这件白色羽绒服袖口线头很多，我不想换了，麻烦直接退款"),
    ).toBeInTheDocument();
    expect(within(drawer).getByText("先安抚，再确认退款路径")).toBeInTheDocument();
  });

  it("filters the priority queue by risk level", async () => {
    const user = userEvent.setup();
    renderInsightsPage();

    await user.click(screen.getByRole("combobox", { name: "风险" }));
    await user.click(await screen.findByRole("option", { name: "高风险" }));

    expect(screen.getByText("2 项")).toBeInTheDocument();
    expect(screen.getByText("VIP 老客福利群")).toBeInTheDocument();
    expect(screen.queryByText("陈先生")).not.toBeInTheDocument();
  });
});
