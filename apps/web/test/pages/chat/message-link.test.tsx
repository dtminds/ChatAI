import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders a fallback thumbnail when the preview image URL is empty", () => {
    render(
      <LinkMessageCard
        content={{
          description: "没有封面图的链接",
          previewImageUrl: "   ",
          title: "无图链接",
          type: "h5",
          url: "https://example.com/no-cover",
        }}
      />,
    );

    const fallback = screen.getByRole("img", { name: "链接封面不可用：无图链接" });

    expect(fallback).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "无图链接" })).not.toBeInTheDocument();
  });

  it("renders a fallback thumbnail when the preview image fails to load", () => {
    render(
      <LinkMessageCard
        content={{
          description: "封面图加载失败的链接",
          previewImageUrl: "https://cdn.example.com/broken-cover.png",
          title: "坏图链接",
          type: "h5",
          url: "https://example.com/broken-cover",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "坏图链接" }));

    const fallback = screen.getByRole("img", { name: "链接封面不可用：坏图链接" });

    expect(fallback).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "坏图链接" })).not.toBeInTheDocument();
  });

  it("retries image loading when the preview image URL changes after a load failure", () => {
    const { rerender } = render(
      <LinkMessageCard
        content={{
          description: "封面图加载失败的链接",
          previewImageUrl: "https://cdn.example.com/broken-cover.png",
          title: "动态封面链接",
          type: "h5",
          url: "https://example.com/dynamic-cover",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "动态封面链接" }));

    expect(screen.getByRole("img", { name: "链接封面不可用：动态封面链接" }))
      .toBeInTheDocument();

    rerender(
      <LinkMessageCard
        content={{
          description: "封面图已更新的链接",
          previewImageUrl: "https://cdn.example.com/fresh-cover.png",
          title: "动态封面链接",
          type: "h5",
          url: "https://example.com/dynamic-cover",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "动态封面链接" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/fresh-cover.png",
    );
    expect(screen.queryByRole("img", { name: "链接封面不可用：动态封面链接" }))
      .not.toBeInTheDocument();
  });
});
