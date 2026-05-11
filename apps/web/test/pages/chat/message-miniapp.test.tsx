import { render, screen } from "@testing-library/react";
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
});
