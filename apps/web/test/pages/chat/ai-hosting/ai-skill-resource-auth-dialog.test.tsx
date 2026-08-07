import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillResourceAuthDialog } from "@/pages/chat/ai-hosting/ai-skill-resource-auth-dialog";

describe("SkillResourceAuthDialog", () => {
  it("renders authorization content and handles agree / cancel", async () => {
    const user = userEvent.setup();
    const onAgree = vi.fn();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <SkillResourceAuthDialog
        onAgree={onAgree}
        onOpenChange={onOpenChange}
        open
      />,
    );

    expect(screen.getByRole("heading", { name: "授权三方接入" })).toBeInTheDocument();
    expect(screen.getByAltText("星云有客")).toHaveAttribute(
      "src",
      "https://b5.bokr.com.cn/dist/ui/xy_logo.png",
    );
    expect(screen.getByRole("button", { name: "同意并授权" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "同意并授权" }));
    expect(onAgree).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <SkillResourceAuthDialog
        onAgree={onAgree}
        onOpenChange={onOpenChange}
        open
        submitting
      />,
    );
    expect(screen.getByRole("button", { name: "同意并授权" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  });
});
