import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "@/components/ui/time-picker";

describe("TimePicker", () => {
  it("shows invalid stored values as unconfigured", async () => {
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
});
