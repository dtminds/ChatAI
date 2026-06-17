import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickReplyCategoryDialog } from "@/pages/chat/components/quick-reply/quick-reply-category-dialog";

describe("QuickReplyCategoryDialog", () => {
  it("rejects category names longer than ten characters", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuickReplyCategoryDialog
        initialTitle="一二三四五六七八九十甲"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("分类名称不能超过10字")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
