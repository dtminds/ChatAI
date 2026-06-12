import {
  TableCell,
  TableRow,
} from "@/components/ui/table";

export function InsightTableLoadingRow({
  cellClassName = "py-10 text-center",
  colSpan,
  label = "正在加载会话",
}: {
  cellClassName?: string;
  colSpan: number;
  label?: string;
}) {
  return (
    <TableRow>
      <TableCell className={cellClassName} colSpan={colSpan}>
        <div
          aria-label={label}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <span>{label}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}
