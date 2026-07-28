import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimePicker } from "@/components/ui/date-time-picker";

describe("DateTimePicker", () => {
  it("opens the calendar and confirms the selected time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = new Date(2026, 6, 28, 10, 15);

    render(
      <DateTimePicker
        ariaLabel="截止时间"
        onChange={onChange}
        value={value}
      />,
    );

    await user.click(screen.getByRole("button", { name: "截止时间" }));
    expect(screen.getByRole("grid")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "小时" }));
    await user.click(screen.getByRole("option", { name: "12" }));
    await user.click(screen.getByRole("combobox", { name: "分钟" }));
    await user.click(screen.getByRole("option", { name: "30" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 6, 28, 12, 30));
  });

  it("clears an existing value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DateTimePicker
        ariaLabel="截止时间"
        onChange={onChange}
        value={new Date(2026, 6, 28, 10, 15)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "截止时间" }));
    await user.click(screen.getByRole("button", { name: "清除" }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
