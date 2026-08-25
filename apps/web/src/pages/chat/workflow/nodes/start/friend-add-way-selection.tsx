import { ArrowDown01Icon, ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import {
  WORKFLOW_FRIEND_SOURCE_MAX_SELECTED,
  type WorkflowFriendAddWayActivity,
  type WorkflowFriendAddWayGroup,
  type WorkflowFriendAddWayMatchMode,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, resolveTablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import {
  friendAddWayHasSecondary,
  getFriendAddWaySelectionKey,
  getFriendAddWayDisplayTitle,
  isFriendAddWaySelectionInvalid,
  listWorkflowFriendAddWayActivities,
  resolveFriendAddWayPath,
  resolveFriendAddWaySelectionPath,
  WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE,
  type WorkflowFriendAddWayResourceStatus,
} from "../../workflow-friend-add-way-resource";

const SEARCH_DEBOUNCE_MS = 300;
const activityCreateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

function formatActivityCreateTime(value: number | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "—";
  }

  return activityCreateTimeFormatter.format(value);
}

export type FriendAddWaySelectionValue = {
  addWayKey: string | null;
  sourceIds: string[];
  sourceMatchMode: WorkflowFriendAddWayMatchMode;
};

export function FriendAddWaySelection({
  groups,
  onChange,
  onRetry,
  status,
  value,
}: {
  groups: readonly WorkflowFriendAddWayGroup[];
  onChange(value: FriendAddWaySelectionValue): void;
  onRetry?: () => void;
  status: WorkflowFriendAddWayResourceStatus;
  value: FriendAddWaySelectionValue;
}) {
  const selectedKey = getFriendAddWaySelectionKey(value);
  const selectedPath = resolveFriendAddWaySelectionPath(groups, value);
  const invalidSelection = status === "ready"
    && isFriendAddWaySelectionInvalid(groups, value);
  const hasSecondary = friendAddWayHasSecondary(selectedPath);

  function commit(next: Partial<FriendAddWaySelectionValue>) {
    onChange({
      addWayKey: next.addWayKey !== undefined ? next.addWayKey : value.addWayKey,
      sourceIds: next.sourceIds ?? value.sourceIds,
      sourceMatchMode: next.sourceMatchMode ?? value.sourceMatchMode,
    });
  }

  return (
    <div className="space-y-2">
      {status === "error" ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground">
          <span>操作失败，请稍后重试</span>
          {onRetry ? (
            <Button onClick={onRetry} size="sm" type="button" variant="ghost">
              重试
            </Button>
          ) : null}
        </div>
      ) : status === "loading" || status === "idle" ? (
        <div
          className="flex min-h-10 items-center gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground"
          role="status"
        >
          <Spinner />
          <span>正在加载</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FriendAddWayCascadingPicker
            groups={groups}
            onSelect={(nextKey) => {
              commit({
                addWayKey: nextKey,
                sourceIds: [nextKey],
                sourceMatchMode: "all",
              });
            }}
            invalidSelection={invalidSelection}
            selectedKey={selectedKey}
          />
          {hasSecondary ? (
            <Select
              onValueChange={(mode) => {
                if (mode !== "all" && mode !== "any") {
                  return;
                }

                commit({
                  sourceMatchMode: mode,
                  sourceIds: mode === "all" && value.addWayKey ? [value.addWayKey] : [],
                });
              }}
              value={value.sourceMatchMode}
            >
              <SelectTrigger
                aria-label="匹配方式"
                className="h-9 w-auto shrink-0 px-3 text-[13px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">不限</SelectItem>
                <SelectItem value="any">指定（满足任一）</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      )}

      {status === "ready" && hasSecondary && value.sourceMatchMode === "any" && value.addWayKey ? (
        <FriendAddWayActivityPicker
          addWayKey={value.addWayKey}
          onChange={(sourceIds) => commit({ sourceIds })}
          selectedIds={value.sourceIds}
        />
      ) : null}
    </div>
  );
}

function FriendAddWayCascadingPicker({
  groups,
  invalidSelection,
  onSelect,
  selectedKey,
}: {
  groups: readonly WorkflowFriendAddWayGroup[];
  invalidSelection: boolean;
  onSelect(key: string): void;
  selectedKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const selectedPath = resolveFriendAddWayPath(groups, selectedKey);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(selectedPath.group?.key ?? null);
  const activeGroup = groups.find(group => group.key === activeGroupKey) ?? null;
  const showRightPane = Boolean(activeGroup?.children.length);
  const displayTitle = invalidSelection
    ? "已失效的添加好友来源"
    : getFriendAddWayDisplayTitle(selectedPath);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveGroupKey(
      selectedPath.group?.key
      ?? groups.find(group => group.children.length > 0)?.key
      ?? groups[0]?.key
      ?? null,
    );
  }, [groups, open, selectedPath.group?.key]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="添加好友来源"
          className="h-9 min-w-0 flex-1 justify-between px-3 text-[13px] font-normal"
          type="button"
          variant="outline"
        >
          <span className={cn("truncate", !displayTitle && "text-muted-foreground")}>
            {displayTitle ?? "请选择"}
          </span>
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
            icon={ArrowDown01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-auto min-w-[180px] max-h-[min(16rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-0"
        collisionPadding={12}
      >
        <div className={cn("flex min-h-0 flex-1", showRightPane && "min-w-[280px]")}>
          <ul
            aria-label="添加方式"
            className="min-h-0 min-w-[140px] flex-1 space-y-0.5 overflow-y-auto p-1.5"
          >
            {groups.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">暂无数据</li>
            ) : groups.map(group => {
              const hasChildren = group.children.length > 0;
              const selected = !hasChildren && group.key === selectedKey;
              return (
                <li key={group.key}>
                  <button
                    aria-expanded={hasChildren ? group.key === activeGroup?.key : undefined}
                    aria-haspopup={hasChildren ? "listbox" : undefined}
                    className={cn(
                      "flex w-full items-center rounded-[8px] px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      (group.key === activeGroup?.key || selected) && "bg-accent",
                    )}
                    onClick={() => {
                      if (hasChildren) {
                        setActiveGroupKey(group.key);
                        return;
                      }

                      onSelect(group.key);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">{group.title}</span>
                    {hasChildren ? (
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground"
                        icon={ArrowRight01Icon}
                        size={14}
                        strokeWidth={1.8}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {showRightPane && activeGroup ? (
            <ul
              aria-label="子类添加方式"
              className="-ml-px min-h-0 min-w-[140px] flex-1 space-y-0.5 overflow-y-auto border-l border-border p-1.5"
            >
              {activeGroup.children.map(item => (
                <li key={item.key}>
                  <button
                    className={cn(
                      "flex w-full items-center rounded-[8px] px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      item.key === selectedKey && "bg-accent",
                    )}
                    onClick={() => {
                      onSelect(item.key);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 truncate">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FriendAddWayActivityPicker({
  addWayKey,
  onChange,
  selectedIds,
}: {
  addWayKey: string;
  onChange(ids: string[]): void;
  selectedIds: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<WorkflowFriendAddWayActivity[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const requestVersionRef = useRef(0);
  const draftSelectedKeySet = new Set(draftSelectedIds);
  const atLimit = draftSelectedIds.length >= WORKFLOW_FRIEND_SOURCE_MAX_SELECTED;
  const pagination = resolveTablePagination({
    page,
    pageSize: WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE,
    total,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      setDebouncedQuery(current => {
        if (current !== nextQuery) {
          setPage(1);
        }
        return nextQuery;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setDebouncedQuery("");
    setDraftSelectedIds([...selectedIds]);
    setPage(1);
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError(false);
      try {
        const response = await listWorkflowFriendAddWayActivities({
          key: addWayKey,
          page,
          pageSize: WORKFLOW_FRIEND_ADD_WAY_ACTIVITY_PAGE_SIZE,
          title: debouncedQuery || undefined,
        });
        if (cancelled || requestVersionRef.current !== requestVersion) {
          return;
        }
        setItems(response.items);
        setTotal(response.pagination.total);
      } catch {
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setItems([]);
          setTotal(0);
          setError(true);
        }
      } finally {
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [addWayKey, debouncedQuery, open, page, retryKey]);

  function toggleDraftId(id: string, checked: boolean) {
    setDraftSelectedIds(current => {
      if (typeof id !== "string" || !id.trim()) {
        return current;
      }

      if (!checked) {
        return current.filter(item => item !== id);
      }

      if (current.includes(id) || current.length >= WORKFLOW_FRIEND_SOURCE_MAX_SELECTED) {
        return current;
      }

      return [...current, id];
    });
  }

  return (
    <>
      <Button
        aria-haspopup="dialog"
        className="h-9 w-full justify-between px-3 text-[13px] font-normal"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <span className={cn(selectedIds.length === 0 && "text-muted-foreground")}>
          {selectedIds.length > 0
            ? `已选择 ${selectedIds.length} 个`
            : "请选择活动"}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">选择</span>
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="flex h-[600px] max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] max-w-[720px] flex-col gap-0 overflow-hidden p-0 sm:rounded-[14px]">
          <div className="shrink-0 px-6 pb-3 pt-5">
            <DialogTitle className="text-lg">选择活动</DialogTitle>
            <div className="relative mt-4 w-[260px] max-w-full">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={15}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索活动"
                className="h-10 pl-9"
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索活动名称"
                value={query}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            <Table aria-label="活动" className="table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 px-4" />
                  <TableHead className="px-4">活动名称</TableHead>
                  <TableHead className="w-[200px] px-4">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell className="h-40 text-center" colSpan={3}>
                      <div
                        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                        role="status"
                      >
                        <Spinner />
                        <span>正在加载</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell className="h-40 text-center" colSpan={3}>
                      <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span>操作失败，请稍后重试</span>
                        <Button
                          onClick={() => setRetryKey(key => key + 1)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          重试
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="h-40 text-center text-sm text-muted-foreground"
                      colSpan={3}
                    >
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map(item => {
                    const selectable = typeof item.addWayId === "string" && Boolean(item.addWayId.trim());
                    const checked = selectable && draftSelectedKeySet.has(item.addWayId);
                    const disabled = !selectable || (atLimit && !checked);
                    const displayTitle = typeof item.title === "string" && item.title.trim()
                      ? item.title.trim()
                      : "未命名";
                    return (
                      <TableRow key={item.addWayId}>
                        <TableCell className="w-12 px-4 py-3">
                          <Checkbox
                            aria-label={displayTitle}
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={next => toggleDraftId(item.addWayId, next === true)}
                          />
                        </TableCell>
                        <TableCell className="max-w-0 px-4 py-3">
                          <span className="block truncate">{displayTitle}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatActivityCreateTime(item.createTime)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!error && total > 0 ? (
            <div className="shrink-0 px-6">
              <TablePagination
                className="border-t-0 px-0 py-3"
                onPageChange={setPage}
                page={pagination.activePage}
                total={total}
                totalPages={pagination.totalPages}
              />
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-4 border-t px-6 py-4">
            <span className="shrink-0 text-sm text-muted-foreground">
              已选择 {draftSelectedIds.length}/{WORKFLOW_FRIEND_SOURCE_MAX_SELECTED}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <Button className="min-w-20" onClick={() => setOpen(false)} type="button" variant="outline">
                取消
              </Button>
              <Button
                className="min-w-20"
                onClick={() => {
                  onChange(draftSelectedIds);
                  setOpen(false);
                }}
                type="button"
              >
                确定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
