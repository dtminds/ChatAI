import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";

describe("Timeline", () => {
  it("renders chronological content as an ordered list", () => {
    const { container } = render(
      <Timeline aria-label="运行轨迹">
        <TimelineItem>
          <TimelineIndicator variant="success" />
          <TimelineSeparator />
          <TimelineTitle>客户打标</TimelineTitle>
          <TimelineDate dateTime="2026-08-21T06:45:00.000Z">08/21 14:45</TimelineDate>
          <TimelineContent>已添加标签</TimelineContent>
        </TimelineItem>
      </Timeline>,
    );

    expect(screen.getByRole("list", { name: "运行轨迹" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByText("08/21 14:45")).toHaveAttribute(
      "datetime",
      "2026-08-21T06:45:00.000Z",
    );
    expect(
      container.querySelector('[data-slot="timeline-indicator"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      container.querySelector('[data-slot="timeline-separator"]'),
    ).toHaveAttribute("aria-hidden", "true");
  });
});
