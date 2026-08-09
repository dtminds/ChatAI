import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimePicker } from "@/components/ui/date-time-picker";

describe("DateTimePicker", () => {
  it("commits the selected time with the configured local date", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <DateTimePicker
        aria-label="开始时间"
        onValueChange={onValueChange}
        value="2026-07-15T09:30"
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始时间" }));
    await user.click(screen.getByRole("button", { name: "开始时间时间" }));
    await user.click(screen.getByRole("button", { name: "20时" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(onValueChange).toHaveBeenCalledWith("2026-07-15T20:30");
  });

  it("treats invalid local values as unconfigured and supports clearing", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <DateTimePicker
        aria-label="结束时间"
        onValueChange={onValueChange}
        value="2026-02-30T09:30"
      />,
    );

    const trigger = screen.getByRole("button", { name: "结束时间" });
    expect(trigger).toHaveTextContent("请选择日期时间");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("opens the calendar and confirms a Date value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = new Date(2026, 6, 28, 10, 15);

    render(
      <DateTimePicker ariaLabel="截止时间" onChange={onChange} value={value} />,
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

  it("clears an existing Date value", async () => {
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
