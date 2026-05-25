import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Settings03Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export const settingsPageSize = 10;

export function useSettingsLocalPagination<T>(
  items: T[],
  pageSize = settingsPageSize,
) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  if (page > totalPages) {
    setPage(totalPages);
  }
  const currentPage = Math.min(page, totalPages);
  const pagedItems = React.useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, items, pageSize],
  );
  const resetPage = React.useCallback(() => {
    setPage(1);
  }, []);

  return {
    currentPage,
    pagedItems,
    resetPage,
    setPage,
    totalPages,
  };
}

export function PageHeader({
  title,
  eyebrow,
  description,
}: {
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <div className="flex items-center gap-1 text-xs font-medium text-primary">
        <HugeiconsIcon
          color="currentColor"
          icon={Settings03Icon}
          size={14}
          strokeWidth={1.8}
        />
        <span>{eyebrow}</span>
      </div>
      <h1 className="text-[26px] font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const id = htmlFor ?? getElementId(children);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function StatusText({
  tone,
  children,
}: {
  tone: "success" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-sm font-semibold",
        tone === "success" && "text-success",
        tone === "danger" && "text-destructive",
        tone === "muted" && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function SettingsPagination({
  onPageChange,
  page,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  const pages = React.useMemo(() => {
    const visiblePages = new Set<number>([1, totalPages, page]);

    if (page > 1) {
      visiblePages.add(page - 1);
    }

    if (page < totalPages) {
      visiblePages.add(page + 1);
    }

    return Array.from(visiblePages)
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((left, right) => left - right);
  }, [page, totalPages]);

  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <Button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
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
            <React.Fragment key={value}>
              {hasGap ? (
                <PaginationItem>
                  <PaginationEllipsis className="text-muted-foreground" />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <Button
                  aria-current={value === page ? "page" : undefined}
                  disabled={value === page}
                  onClick={() => onPageChange(value)}
                  size="icon"
                  type="button"
                  variant={value === page ? "outline" : "ghost"}
                >
                  {value}
                </Button>
              </PaginationItem>
            </React.Fragment>
          );
        })}
        <PaginationItem>
          <Button
            aria-label="下一页"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
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

export function DemoNotes({ items }: { items: string[] }) {
  return (
    <section className="mt-6 rounded-[10px] border border-border p-5">
      <h2 className="text-sm font-semibold text-foreground">开发接入提示</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-2" key={item}>
            <span className="mt-[9px] size-1.5 rounded-full bg-info" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PreferenceOption({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: IconSvgElement;
}) {
  return (
    <button
      className="rounded-[10px] border border-border p-5 text-left transition-colors hover:border-primary/40"
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-[10px] border border-border text-foreground">
          <HugeiconsIcon
            color="currentColor"
            icon={icon}
            size={18}
            strokeWidth={1.8}
          />
        </div>
        <span className="text-base font-semibold text-foreground">{title}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </button>
  );
}

function getElementId(children: React.ReactNode) {
  if (React.isValidElement<{ id?: string }>(children)) {
    return children.props.id;
  }

  return undefined;
}
