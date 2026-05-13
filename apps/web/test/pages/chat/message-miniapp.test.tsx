import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniAppMessageCard } from "@/pages/chat/components/message";

describe("MiniAppMessageCard", () => {
  it("uses the official mini program mark color", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          sourceLabel: "小程序",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    expect(screen.getByTestId("mini-program-mark")).toHaveClass(
      "text-mini-program-brand",
    );
  });

  it("uses an image-not-found fallback when the cover image URL is empty", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          coverImageUrl: "   ",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "小程序封面不可用：预约直播抽秋天的第一杯奶茶" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("mini-program-cover-fallback-icon")).toHaveAttribute(
      "data-icon-name",
      "image-not-found-01",
    );
    expect(screen.queryByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }))
      .not.toBeInTheDocument();
  });

  it("uses an image-not-found fallback when the cover image fails to load", () => {
    render(
      <MiniAppMessageCard
        content={{
          appName: "学好惊喜社",
          coverImageUrl: "https://cdn.example.com/broken-miniapp-cover.png",
          title: "预约直播抽秋天的第一杯奶茶",
          type: "mini-program",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }));

    expect(screen.getByRole("img", { name: "小程序封面不可用：预约直播抽秋天的第一杯奶茶" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "预约直播抽秋天的第一杯奶茶" }))
      .not.toBeInTheDocument();
  });
});
