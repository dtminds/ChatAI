import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";

describe("TablePagination", () => {
  it("renders total count, folded page buttons, and disabled edge controls", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <TablePagination
        endRow={30}
        onPageChange={onPageChange}
        page={3}
        startRow={21}
        total={96}
        totalPages={10}
      />,
    );

    expect(screen.getByText("共 96 条")).toBeInTheDocument();
    expect(screen.queryByText("显示 21-30 / 共 96 条")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("更多页面")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "6" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("renders compact page controls for table density", () => {
    const { container } = render(
      <TablePagination
        endRow={30}
        onPageChange={vi.fn()}
        page={3}
        startRow={21}
        total={96}
        totalPages={10}
      />,
    );

    expect(container.firstChild).toHaveClass("items-end", "px-0", "sm:justify-end");
    expect(screen.getByRole("button", { name: "上一页" })).toHaveClass("size-8");
    expect(screen.getByRole("button", { name: "3" })).toHaveClass("size-8");
    expect(screen.getByRole("button", { name: "下一页" })).toHaveClass("size-8");
  });

  it("clamps invalid page values before rendering controls", () => {
    render(
      <TablePagination
        endRow={50}
        onPageChange={vi.fn()}
        page={99}
        startRow={41}
        total={50}
        totalPages={5}
      />,
    );

    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("resolves table row ranges from clamped page state", () => {
    expect(resolveTablePagination({ page: 3, pageSize: 10, total: 2 })).toEqual({
      activePage: 1,
      endRow: 2,
      startRow: 1,
      totalPages: 1,
    });
    expect(resolveTablePagination({ page: 3, pageSize: 10, total: 0 })).toEqual({
      activePage: 1,
      endRow: 0,
      startRow: 0,
      totalPages: 1,
    });
  });

  it("falls back to the minimum page size when resolving invalid page sizes", () => {
    expect(resolveTablePagination({ page: 1, pageSize: 0, total: 3 })).toEqual({
      activePage: 1,
      endRow: 1,
      startRow: 1,
      totalPages: 3,
    });
    expect(resolveTablePagination({ page: 2, pageSize: -5, total: 3 })).toEqual({
      activePage: 2,
      endRow: 2,
      startRow: 2,
      totalPages: 3,
    });
  });
});
