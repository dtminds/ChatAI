import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "@/components/ui/scroll-area";

describe("ScrollArea", () => {
  it("uses the system scrollbar visibility policy by default", () => {
    render(
      <ScrollArea data-testid="scroll-area">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
    expect(screen.getByTestId("scroll-area")).toHaveAttribute(
      "data-scrollbar-hide-delay",
      "700",
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

  it("keeps scrollbar tracks mounted so hover can reveal them before scrolling", () => {
    render(
      <ScrollArea data-testid="scroll-area">
        <div>Scrollable content</div>
      </ScrollArea>,
    );

    expect(screen.getByTestId("scroll-area")).toHaveClass("group/scroll-area");
    expect(
      screen.getByTestId("scroll-area").querySelector('[data-orientation="vertical"]'),
    ).toHaveClass("group-hover/scroll-area:opacity-100");
  });
});
