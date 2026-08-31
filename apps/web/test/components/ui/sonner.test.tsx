import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

describe("Toaster", () => {
  afterEach(() => {
    toast.dismiss();
  });

  it("supports per-toast placement and lets the user dismiss it", async () => {
    const user = userEvent.setup();
    render(<Toaster position="top-right" />);

    act(() => {
      toast.success("已提交审核", {
        duration: Infinity,
        position: "top-center",
      });
    });

    const closeButton = await screen.findByRole("button", { name: "关闭通知" });
    expect(closeButton.closest("[data-sonner-toaster]"))
      .toHaveAttribute("data-x-position", "center");

    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("已提交审核")).not.toBeInTheDocument();
    });
  });
});
