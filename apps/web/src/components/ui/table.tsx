import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div
    className="relative w-full overflow-x-auto"
    data-slot="table-container"
  >
    <table
      className={cn("w-full caption-bottom text-sm", className)}
      data-slot="table"
      ref={ref}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    className={cn("[&_tr]:border-b", className)}
    data-slot="table-header"
    ref={ref}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    className={cn("[&_tr:last-child]:border-0", className)}
    data-slot="table-body"
    ref={ref}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    data-slot="table-footer"
    ref={ref}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    className={cn(
      "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
      className,
    )}
    data-slot="table-row"
    ref={ref}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    data-slot="table-head"
    ref={ref}
    {...props}
  />
));
TableHead.displayName = "TableHead";

type TablePinnedSide = "left" | "right";

function getPinnedColumnClassName(side: TablePinnedSide) {
  if (side === "left") {
    return "sticky left-0 z-10 bg-surface";
  }

  return "sticky right-0 z-10 bg-surface";
}

type TablePinnedHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  side?: TablePinnedSide;
};

const TablePinnedHead = React.forwardRef<
  HTMLTableCellElement,
  TablePinnedHeadProps
>(({ className, side = "right", ...props }, ref) => (
  <TableHead
    className={cn(getPinnedColumnClassName(side), className)}
    data-slot="table-pinned-head"
    ref={ref}
    {...props}
  />
));
TablePinnedHead.displayName = "TablePinnedHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    data-slot="table-cell"
    ref={ref}
    {...props}
  />
));
TableCell.displayName = "TableCell";

type TablePinnedCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  side?: TablePinnedSide;
};

const TablePinnedCell = React.forwardRef<
  HTMLTableCellElement,
  TablePinnedCellProps
>(({ className, side = "right", ...props }, ref) => (
  <TableCell
    className={cn(getPinnedColumnClassName(side), className)}
    data-slot="table-pinned-cell"
    ref={ref}
    {...props}
  />
));
TablePinnedCell.displayName = "TablePinnedCell";

const TableCellContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    className={cn("min-w-0 truncate", className)}
    data-slot="table-cell-content"
    ref={ref}
    {...props}
  />
));
TableCellContent.displayName = "TableCellContent";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    data-slot="table-caption"
    ref={ref}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TablePinnedHead,
  TableRow,
  TableCell,
  TablePinnedCell,
  TableCellContent,
  TableCaption,
};
