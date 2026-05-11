import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { H5CardMessageContent } from "@/pages/chat/chat-types";
import { LinkMessageCard } from "@/pages/chat/components/message";

describe("LinkMessageCard", () => {
  it("renders link messages as anchors that open in a new window", () => {
    render(
      <LinkMessageCard
        content={
          {
            description: "点击查看订单详情",
            previewImageUrl: "https://cdn.example.com/order.png",
            title: "订单详情",
            type: "h5",
            url: "https://example.com/orders/123",
          } satisfies H5CardMessageContent
        }
      />,
    );

    const link = screen.getByRole("link", { name: /订单详情/ });

    expect(link).toHaveAttribute("href", "https://example.com/orders/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render unsafe link URLs as anchors", () => {
    render(
      <LinkMessageCard
        content={{
          description: "不安全链接",
          title: "风险链接",
          type: "h5",
          url: "javascript:alert(1)",
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: /风险链接/ })).not.toBeInTheDocument();
    expect(screen.getByText("风险链接")).toBeInTheDocument();
  });
});
