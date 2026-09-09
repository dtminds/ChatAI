import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickReplyCategoryDialog } from "@/pages/chat/components/quick-reply/quick-reply-category-dialog";

describe("QuickReplyCategoryDialog", () => {
  it("keeps an overlong category name visible and rejects saving", async () => {
    const onSubmit = vi.fn();

    render(
      <QuickReplyCategoryDialog
        initialTitle="一二三四五六七八九十甲"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("一二三四五六七八九十甲");
    expect(screen.getByText("11/10")).toBeInTheDocument();
    expect(screen.queryByText("分类名称不能超过10字")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
