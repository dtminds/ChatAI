import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

describe("DropdownMenu", () => {
  it("uses a check icon for selected radio items", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>筛选</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="intent">
            <DropdownMenuRadioItem value="entity">商品对象</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="intent">客户诉求</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await userEvent.click(screen.getByRole("button", { name: "筛选" }));

    const selectedItem = await screen.findByRole("menuitemradio", {
      checked: true,
      name: "客户诉求",
    });
    const selectedIcon = within(selectedItem).getByTestId("dropdown-menu-radio-indicator-icon");

    expect(selectedIcon).toHaveAttribute("data-icon-name", "tick-02");
  });
});
