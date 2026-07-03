import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableCellContent,
  TableFooter,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@/components/ui/table";

describe("UI primitive refs", () => {
  it("forwards refs for label and checkbox primitives", () => {
    const checkboxRef = createRef<HTMLButtonElement>();
    const labelRef = createRef<HTMLLabelElement>();

    render(
      <Label ref={labelRef}>
        <Checkbox ref={checkboxRef} />
        接待权限
      </Label>,
    );

    expect(labelRef.current).toBeInstanceOf(HTMLLabelElement);
    expect(checkboxRef.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("forwards refs for table primitives", () => {
    const tableRef = createRef<HTMLTableElement>();
    const headerRef = createRef<HTMLTableSectionElement>();
    const bodyRef = createRef<HTMLTableSectionElement>();
    const footerRef = createRef<HTMLTableSectionElement>();
    const rowRef = createRef<HTMLTableRowElement>();
    const headRef = createRef<HTMLTableCellElement>();
    const cellRef = createRef<HTMLTableCellElement>();
    const captionRef = createRef<HTMLTableCaptionElement>();

    render(
      <Table ref={tableRef}>
        <TableCaption ref={captionRef}>账号列表</TableCaption>
        <TableHeader ref={headerRef}>
          <TableRow>
            <TableHead ref={headRef}>账号</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef}>
          <TableRow ref={rowRef}>
            <TableCell ref={cellRef}>护肤小助理</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter ref={footerRef}>
          <TableRow>
            <TableCell>共 1 条</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(tableRef.current).toBeInstanceOf(HTMLTableElement);
    expect(headerRef.current).toBeInstanceOf(HTMLTableSectionElement);
    expect(bodyRef.current).toBeInstanceOf(HTMLTableSectionElement);
    expect(footerRef.current).toBeInstanceOf(HTMLTableSectionElement);
    expect(rowRef.current).toBeInstanceOf(HTMLTableRowElement);
    expect(headRef.current).toBeInstanceOf(HTMLTableCellElement);
    expect(cellRef.current).toBeInstanceOf(HTMLTableCellElement);
    expect(captionRef.current).toBeInstanceOf(HTMLTableCaptionElement);
  });

  it("allows table header and cell text to wrap by default", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>很长的表头</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>很长的单元格内容</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(document.querySelector("[data-slot='table-head']")).not.toHaveClass(
      "whitespace-nowrap",
    );
    expect(document.querySelector("[data-slot='table-cell']")).not.toHaveClass(
      "whitespace-nowrap",
    );
  });

  it("renders pinned table columns with clipped cell content", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>账号</TableHead>
            <TablePinnedHead side="right">操作</TablePinnedHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <TableCellContent>护肤小助理</TableCellContent>
            </TableCell>
            <TablePinnedCell side="right">设置</TablePinnedCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const container = document.querySelector("[data-slot='table-container']");
    const content = document.querySelector("[data-slot='table-cell-content']");
    const pinnedHead = document.querySelector("[data-slot='table-pinned-head']");
    const pinnedCell = document.querySelector("[data-slot='table-pinned-cell']");

    expect(container).toBeInstanceOf(HTMLDivElement);
    expect(content).toHaveClass("min-w-0", "truncate");
    expect(pinnedHead).toHaveClass("sticky", "right-0", "bg-surface");
    expect(pinnedCell).toHaveClass("sticky", "right-0", "bg-surface");
  });
});
