import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickReplyCategoryDialog } from "@/pages/chat/components/quick-reply/quick-reply-category-dialog";

describe("QuickReplyCategoryDialog", () => {
  it("clips category names to ten characters when saving", async () => {
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

    expect(onSubmit).toHaveBeenCalledWith("一二三四五六七八九十");
  });
});
