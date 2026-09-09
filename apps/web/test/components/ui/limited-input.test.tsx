import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LimitedInput } from "@/components/ui/limited-input";
import { limitInputEdit, truncateInputValue } from "@/lib/input-limit";

describe("LimitedInput", () => {
  it("keeps composition text local until it can commit a limited value", () => {
    const onValueChange = vi.fn();
    render(<LimitedInputFixture initialValue="一二三四五六七八九" onValueChange={onValueChange} />);

    const input = screen.getByRole("textbox", { name: "受限输入" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "一二三四五六七八九城市" } });

    expect(input).toHaveValue("一二三四五六七八九城市");
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);

    expect(input).toHaveValue("一二三四五六七八九城");
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("一二三四五六七八九城");
  });

  it("accepts only the part of an edit that fits without deleting the suffix", () => {
    expect(limitInputEdit("123456789", "12345XY6789", 10)).toBe("12345X6789");
  });

  it("does not split a surrogate pair at the length boundary", () => {
    expect(truncateInputValue("123456789🚀", 10)).toBe("123456789");
    expect(limitInputEdit("1234567890", "12345🚀7890", 10)).toBe("1234567890");
  });

  it("synchronizes an external value change while not composing", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <LimitedInput
        aria-label="受限输入"
        maxLength={10}
        onValueChange={onValueChange}
        value="原名称"
      />,
    );

    rerender(
      <LimitedInput
        aria-label="受限输入"
        maxLength={10}
        onValueChange={onValueChange}
        value="新名称"
      />,
    );

    expect(screen.getByRole("textbox", { name: "受限输入" })).toHaveValue("新名称");
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

function LimitedInputFixture({
  initialValue,
  onValueChange,
}: {
  initialValue: string;
  onValueChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <LimitedInput
      aria-label="受限输入"
      maxLength={10}
      onValueChange={(nextValue) => {
        onValueChange(nextValue);
        setValue(nextValue);
      }}
      value={value}
    />
  );
}
