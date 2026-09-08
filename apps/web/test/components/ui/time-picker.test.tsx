import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "@/components/ui/time-picker";

describe("TimePicker", () => {
  it("updates when a time is selected and uses confirmation only to close", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <TimePicker
        aria-label="执行时间"
        onValueChange={onValueChange}
        value="99:99"
      />,
    );

    const trigger = screen.getByRole("button", { name: "执行时间" });
    expect(trigger).toHaveTextContent("未配置");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "09时" }));

    expect(onValueChange).toHaveBeenCalledWith("09:00");

    await user.click(screen.getByRole("button", { name: "执行时间确认" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "00时" })).not.toBeInTheDocument();
  });

  it("renders valid times unchanged", () => {
    render(
      <TimePicker
        aria-label="执行时间"
        onValueChange={() => undefined}
        value="20:15"
      />,
    );

    expect(screen.getByRole("button", { name: "执行时间" })).toHaveTextContent("20:15");
  });

  it("supports second precision when requested", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <TimePicker
        aria-label="执行时间"
        onValueChange={onValueChange}
        precision="second"
        value="09:30:15"
      />,
    );

    await user.click(screen.getByRole("button", { name: "执行时间" }));
    await user.click(screen.getByRole("button", { name: "45秒" }));

    expect(onValueChange).toHaveBeenCalledWith("09:30:45");
  });

  it("prevents time-column wheel events from reaching the surrounding surface", async () => {
    const user = userEvent.setup();
    const onWheel = vi.fn();

    render(
      <div onWheel={onWheel}>
          <TimePicker
            aria-label="执行时间"
            onValueChange={() => undefined}
            value="00:00"
          />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "执行时间" }));
    fireEvent.wheel(screen.getByRole("button", { name: "00时" }), { deltaY: 80 });

    expect(onWheel).not.toHaveBeenCalled();
  });
});
