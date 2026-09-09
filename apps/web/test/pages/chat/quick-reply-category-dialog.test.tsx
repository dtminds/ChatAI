import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickReplyCategoryDialog } from "@/pages/chat/components/quick-reply/quick-reply-category-dialog";

describe("QuickReplyCategoryDialog", () => {
  it("limits a category name before saving", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuickReplyCategoryDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByRole("textbox"), "一二三四五六七八九十甲");

    expect(screen.getByRole("textbox")).toHaveValue("一二三四五六七八九十");
    expect(screen.getByText("10/10")).toBeInTheDocument();
    expect(screen.queryByText("分类名称不能超过10字")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledWith("一二三四五六七八九十");
  });
});
