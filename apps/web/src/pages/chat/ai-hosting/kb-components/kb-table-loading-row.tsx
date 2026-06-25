import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";

export function KbTableLoadingRow({
  colSpan,
  label = "正在加载",
}: {
  colSpan: number;
  label?: string;
}) {
  return (
    <TableRow>
      <TableCell className="py-10 text-center" colSpan={colSpan}>
        <div
          aria-label={label}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Spinner aria-hidden="true" size={14} />
          <span>{label}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}
