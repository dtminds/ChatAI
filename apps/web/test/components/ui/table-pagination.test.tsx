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
        onPageChange={onPageChange}
        page={3}
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

  it("clamps invalid page values before rendering controls", () => {
    render(
      <TablePagination
        onPageChange={vi.fn()}
        page={99}
        total={50}
        totalPages={5}
      />,
    );

    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("limits navigation to 1000 pages by default while preserving the total count", () => {
    render(
      <TablePagination
        onPageChange={vi.fn()}
        page={1000}
        total={56366}
        totalPages={2819}
      />,
    );

    expect(screen.getByText(/56366/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1000" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("button", { name: "2819" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("accepts a positive integer override for the maximum page", () => {
    render(
      <TablePagination
        maxPage={2000}
        onPageChange={vi.fn()}
        page={2000}
        total={56366}
        totalPages={2819}
      />,
    );

    expect(screen.getByRole("button", { name: "2000" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("button", { name: "2819" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("clamps an external page before emitting navigation", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <TablePagination
        onPageChange={onPageChange}
        page={2819}
        total={56366}
        totalPages={2819}
      />,
    );

    expect(screen.getByRole("button", { name: "1000" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "上一页" }));

    expect(onPageChange).toHaveBeenCalledWith(999);
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

  it("caps resolved pagination at the default maximum page", () => {
    expect(
      resolveTablePagination({ page: 2819, pageSize: 20, total: 56366 }),
    ).toEqual({
      activePage: 1000,
      endRow: 20000,
      startRow: 19981,
      totalPages: 1000,
    });
  });

  it("uses the maximum page override when resolving pagination", () => {
    expect(
      resolveTablePagination({
        maxPage: 2000,
        page: 2819,
        pageSize: 20,
        total: 56366,
      }),
    ).toEqual({
      activePage: 2000,
      endRow: 40000,
      startRow: 39981,
      totalPages: 2000,
    });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])(
    "falls back to the default maximum for invalid maximum page %s",
    (maxPage) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      try {
        render(
          <TablePagination
            maxPage={maxPage}
            onPageChange={vi.fn()}
            page={1000}
            total={56366}
            totalPages={2819}
          />,
        );
      } finally {
        warn.mockRestore();
      }

      expect(screen.getByRole("button", { name: "1000" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    },
  );

  it("calls onPageSizeChange when selecting a new page size", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <TablePagination
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        page={1}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
        total={30}
        totalPages={3}
      />,
    );

    expect(screen.getByText("每页")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "每页条数" }));
    await user.click(screen.getByRole("option", { name: "20" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});
