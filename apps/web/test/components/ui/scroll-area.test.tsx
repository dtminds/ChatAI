import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "@/components/ui/scroll-area";

describe("ScrollArea", () => {
  it("uses Radix scrollbar visibility defaults", () => {
    render(
      <ScrollArea data-testid="scroll-area">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "hover",
    );
    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-hide-delay",
      "600",
    );
  });

  it("allows deliberate overrides for compact or persistent scroll surfaces", () => {
    render(
      <ScrollArea
        data-testid="scroll-area"
        scrollHideDelay={1200}
        type="hover"
      >
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "hover",
    );
    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-hide-delay",
      "1200",
    );
  });

  it("does not add custom hover visibility outside Radix behavior", () => {
    render(
      <ScrollArea data-testid="scroll-area" type="scroll">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(
      screen.getByTestId("scroll-area").querySelector('[data-orientation="vertical"]'),
    ).not.toHaveClass("group-hover/scroll-area:opacity-100");
  });
});
