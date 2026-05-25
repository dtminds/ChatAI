import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";

import { useSettingsLocalPagination } from "@/pages/chat/settings/shared";

function LocalPaginationHarness() {
  const [items, setItems] = React.useState(() =>
    Array.from({ length: 11 }, (_, index) => index + 1),
  );
  const { currentPage, pagedItems, setPage, totalPages } =
    useSettingsLocalPagination(items);

  return (
    <div>
      <p>当前页：{currentPage}</p>
      <p>总页数：{totalPages}</p>
      <p>当前数据：{pagedItems.join(",")}</p>
      <button onClick={() => setPage(2)} type="button">
        第二页
      </button>
      <button onClick={() => setItems([1])} type="button">
        缩短列表
      </button>
      <button
        onClick={() =>
          setItems(Array.from({ length: 11 }, (_, index) => index + 1))
        }
        type="button"
      >
        恢复列表
      </button>
    </div>
  );
}

describe("settings shared utilities", () => {
  it("keeps local pagination state within range when items shrink", async () => {
    const user = userEvent.setup();

    render(<LocalPaginationHarness />);

    await user.click(screen.getByRole("button", { name: "第二页" }));
    expect(screen.getByText("当前页：2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "缩短列表" }));
    expect(screen.getByText("当前页：1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "恢复列表" }));
    expect(screen.getByText("当前页：1")).toBeInTheDocument();
  });
});
