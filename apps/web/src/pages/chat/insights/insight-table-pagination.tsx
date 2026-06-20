import { TablePagination } from "@/components/ui/table-pagination";

export function InsightTablePagination({
  className,
  endRow,
  itemLabel = "条",
  onPageChange,
  page,
  startRow,
  total,
  totalPages,
}: {
  className?: string;
  endRow: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  page: number;
  startRow: number;
  total: number;
  totalPages: number;
}) {
  return (
    <TablePagination
      className={className}
      itemLabel={itemLabel}
      onPageChange={onPageChange}
      page={page}
      total={total}
      totalPages={totalPages}
    />
  );
}
