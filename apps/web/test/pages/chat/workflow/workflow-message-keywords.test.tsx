import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageKeywords } from "@/pages/chat/workflow/nodes/start/message-keywords";

function KeywordEditor({ initial = [] }: { initial?: string[] }) {
  const [values, setValues] = useState(initial);
  return <MessageKeywords onChange={setValues} values={values} />;
}

describe("message keyword editor", () => {
  it("adds pasted keywords as individual removable items and hides the input after adding", async () => {
    const user = userEvent.setup();
    render(<KeywordEditor initial={["价格"]} />);
    expect(screen.getByText("1 / 10")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加消息关键词" }));
    expect(within(screen.getByRole("dialog")).queryByText("1 / 10")).not.toBeInTheDocument();
    await user.click(screen.getByRole("textbox", { name: "消息关键词" }));
    await user.paste(" 价格,优惠，积分、转积分\r\n积分\nhello you,, ");
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "消息关键词" })).getAllByRole("listitem");
    expect(items.map(item => item.textContent)).toEqual(["价格", "优惠", "积分", "转积分", "hello you"]);
    expect(screen.getByText("5 / 10")).toBeInTheDocument();
    for (const keyword of ["价格", "优惠", "积分", "转积分", "hello you"]) {
      await user.click(screen.getByRole("button", { name: `移除关键词 ${keyword}` }));
    }
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 10")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加消息关键词" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    await user.type(screen.getByRole("textbox"), "新关键词{Enter}");
    expect(screen.getByRole("button", { name: "移除关键词 新关键词" })).toBeInTheDocument();
  });

  it("keeps invalid batches editable without partially adding them and accepts the exact limits", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const values = Array.from({ length: 9 }, (_, index) => `关键词${index}`);
    render(<MessageKeywords onChange={onChange} values={values} />);
    await user.click(screen.getByRole("button", { name: "添加消息关键词" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "新增一，新增二" } });
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByRole("alert")).toHaveTextContent("最多添加 10 个关键词");
    expect(input).toHaveValue("新增一，新增二");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "词".repeat(11) } });
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByRole("alert")).toHaveTextContent("每个关键词最多 10 个字符");
    expect(input).toHaveValue("词".repeat(11));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "关键词0， 中Ab123 xyz " } });
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([...values, "中Ab123 xyz"]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not add empty input or submit while the Chinese IME is composing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MessageKeywords onChange={onChange} values={[]} />);
    await user.click(screen.getByRole("button", { name: "添加消息关键词" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "，、, " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "积分" } });
    fireEvent.keyDown(input, { isComposing: true, key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("积分");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["积分"]);
  });
});
