import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function resolveTablePagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const activePage = Math.min(Math.max(1, page), totalPages);
  const startRow = total === 0 ? 0 : (activePage - 1) * safePageSize + 1;
  const endRow = Math.min(activePage * safePageSize, total);

  return {
    activePage,
    endRow,
    startRow,
    totalPages,
  };
}

export function TablePagination({
  className,
  itemLabel = "条",
  onPageChange,
  page,
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
    <div
      className={cn(
        "flex flex-col items-end gap-3 border-t px-0 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
    >
      <span className="shrink-0 whitespace-nowrap">
        共 {total} {itemLabel}
      </span>
      <PageButtons
        onPageChange={onPageChange}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}

function PageButtons({
  onPageChange,
  page,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const pages = useMemo(() => {
    const visiblePages = new Set<number>([1, safeTotalPages, safePage]);

    if (safePage > 1) {
      visiblePages.add(safePage - 1);
    }

    if (safePage < safeTotalPages) {
      visiblePages.add(safePage + 1);
    }

    return Array.from(visiblePages)
      .filter((value) => value >= 1 && value <= safeTotalPages)
      .sort((left, right) => left - right);
  }, [safePage, safeTotalPages]);

  return (
    <Pagination className="!mx-0 w-auto shrink-0 justify-end">
      <PaginationContent>
        <PaginationItem>
          <Button
            aria-label="上一页"
            className="size-8 rounded-[8px]"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </PaginationItem>
        {pages.map((value, index) => {
          const previousPage = pages[index - 1];
          const hasGap = index > 0 && previousPage !== value - 1;

          return (
            <PageButton
              hasGap={hasGap}
              isActive={value === safePage}
              key={value}
              onClick={() => {
                if (value !== safePage) {
                  onPageChange(value);
                }
              }}
              value={value}
            />
          );
        })}
        <PaginationItem>
          <Button
            aria-label="下一页"
            className="size-8 rounded-[8px]"
            disabled={safePage >= safeTotalPages}
            onClick={() => onPageChange(safePage + 1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function PageButton({
  hasGap,
  isActive,
  onClick,
  value,
}: {
  hasGap: boolean;
  isActive: boolean;
  onClick: () => void;
  value: number;
}) {
  return (
    <>
      {hasGap ? (
        <PaginationItem>
          <PaginationEllipsis className="text-muted-foreground" />
        </PaginationItem>
      ) : null}
      <PaginationItem>
        <Button
          aria-current={isActive ? "page" : undefined}
          className="size-8 rounded-[8px] text-xs"
          onClick={onClick}
          size="icon"
          type="button"
          variant={isActive ? "outline" : "ghost"}
        >
          {value}
        </Button>
      </PaginationItem>
    </>
  );
}
