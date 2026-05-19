import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Calendar } from "@/components/ui/calendar";

describe("Calendar", () => {
  it("uses a rounded single-date selection style", () => {
    render(<Calendar mode="single" selected={new Date("2026-05-18T00:00:00")} />);

    const selectedCell = screen.getByRole("gridcell", { selected: true });

    expect(selectedCell).toHaveClass("overflow-hidden");
    expect(selectedCell.querySelector("button")).toHaveClass("data-[selected-single=true]:rounded-md");
  });
});
