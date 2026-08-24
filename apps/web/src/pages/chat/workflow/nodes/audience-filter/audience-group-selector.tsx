import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
  WORKFLOW_AUDIENCE_GROUP_MAX_COUNT,
  type WorkflowAudienceGroupSnapshot,
} from "@chatai/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { listWorkflowAudienceGroups } from "./api";
import {
  normalizeWorkflowAudienceGroupCatalog,
  normalizeWorkflowAudienceGroups,
} from "./config";

export function AudienceGroupSelector({
  onChange,
  value,
}: {
  onChange: (groups: WorkflowAudienceGroupSnapshot[]) => void;
  value: readonly WorkflowAudienceGroupSnapshot[];
}) {
  const selected = normalizeWorkflowAudienceGroups(value);
  const [open, setOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState<WorkflowAudienceGroupSnapshot[]>([]);
  const [groups, setGroups] = useState<WorkflowAudienceGroupSnapshot[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void listWorkflowAudienceGroups({
      page,
      pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
    })
      .then((response) => {
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        setGroups(normalizeWorkflowAudienceGroupCatalog(response.groups).slice(
          0,
          WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
        ));
        setTotal(response.pagination.total);
      })
      .catch(() => {
        if (cancelled || requestVersionRef.current !== requestVersion) return;
        setGroups([]);
        setError(true);
      })
      .finally(() => {
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, page, retryKey]);

  const { activePage, totalPages } = resolveTablePagination({
    page,
    pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
    total,
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftSelected(selected);
      setPage(1);
    }
    setOpen(nextOpen);
  }

  function toggleGroup(group: WorkflowAudienceGroupSnapshot) {
    const selectedIndex = draftSelected.findIndex((item) => item.id === group.id);
    if (selectedIndex >= 0) {
      setDraftSelected(draftSelected.filter((item) => item.id !== group.id));
      return;
    }
    if (draftSelected.length >= WORKFLOW_AUDIENCE_GROUP_MAX_COUNT) return;
    setDraftSelected([...draftSelected, group]);
  }

  return (
    <>
      <Button
        aria-haspopup="dialog"
        className="h-9 w-full justify-between px-3 text-[13px] font-normal"
        onClick={() => handleOpenChange(true)}
        type="button"
        variant="outline"
      >
        <span className={cn(selected.length === 0 && "text-muted-foreground")}>
          {selected.length > 0
            ? `已选择 ${selected.length} 个人群包`
            : "请选择人群包"}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">选择</span>
      </Button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(560px,calc(100vw-2rem))] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-base">选择人群包</DialogTitle>
          </div>

          <div className="grid min-h-[320px] flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] overflow-hidden">
            <ul aria-label="人群包" className="min-h-0 space-y-0.5 overflow-y-auto border-r border-border px-2 py-3">
              {loading ? (
                <li className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                  <Spinner />
                  正在加载
                </li>
              ) : error ? (
                <li className="flex h-full flex-col items-center justify-center gap-1 text-sm text-destructive" role="alert">
                  <span>加载失败</span>
                  <Button onClick={() => setRetryKey((key) => key + 1)} size="sm" type="button" variant="ghost">
                    重试
                  </Button>
                </li>
              ) : groups.length === 0 ? (
                <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  暂无数据
                </li>
              ) : groups.map((group) => {
                const checked = draftSelected.some((item) => item.id === group.id);
                const atLimit = draftSelected.length >= WORKFLOW_AUDIENCE_GROUP_MAX_COUNT && !checked;
                return (
                  <li key={group.id}>
                    <label
                      className={cn(
                        "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                        atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={atLimit}
                        onCheckedChange={() => toggleGroup(group)}
                      />
                      <span className="min-w-0 truncate">{group.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
                <span>已选 {draftSelected.length}/{WORKFLOW_AUDIENCE_GROUP_MAX_COUNT}</span>
                {draftSelected.length > 0 ? (
                  <Button
                    onClick={() => setDraftSelected([])}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    清空
                  </Button>
                ) : null}
              </div>
              <ul aria-label="已选人群包" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
                {draftSelected.length === 0 ? (
                  <li className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    暂无数据
                  </li>
                ) : draftSelected.map((group) => (
                  <li
                    className="flex items-center justify-between gap-2 rounded-[8px] bg-secondary/60 px-3 py-1.5"
                    key={group.id}
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">{group.name}</span>
                    <Button
                      aria-label={`移除 ${group.name}`}
                      className="size-7 shrink-0"
                      onClick={() => setDraftSelected(draftSelected.filter((item) => item.id !== group.id))}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <TablePagination
            className="px-6"
            itemLabel="个"
            onPageChange={setPage}
            page={activePage}
            pageSize={WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE}
            total={total}
            totalPages={totalPages}
          />

          <div className="flex shrink-0 justify-end gap-3 px-6 py-4">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              取消
            </Button>
            <Button
              onClick={() => {
                onChange(draftSelected);
                setOpen(false);
              }}
              type="button"
            >
              确认
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
