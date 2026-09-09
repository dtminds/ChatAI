import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommitLimitInput } from "@/components/ui/commit-limit-input";

describe("CommitLimitInput", () => {
  it("allows typing past the limit and clips after blur", async () => {
    const user = userEvent.setup();
    const onValueCommit = vi.fn();

    render(
      <CommitLimitInput
        aria-label="名称"
        maxLength={10}
        onValueCommit={onValueCommit}
        value=""
      />,
    );

    const input = screen.getByRole("textbox", { name: "名称" });
    await user.type(input, "所在 chengshi");

    expect(input).toHaveValue("所在 chengshi");
    expect(onValueCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(input).toHaveValue("所在 chengsh");
    expect(onValueCommit).toHaveBeenCalledWith("所在 chengsh");
  });

  it("keeps a later committed value after the parent updates", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState("订单号");
      return (
        <CommitLimitInput
          aria-label="名称"
          maxLength={10}
          onValueCommit={setValue}
          value={value}
        />
      );
    }

    render(<Harness />);

    const input = screen.getByRole("textbox", { name: "名称" });
    await user.clear(input);
    await user.type(input, "交易单号");
    fireEvent.blur(input);

    expect(input).toHaveValue("交易单号");
  });
});
