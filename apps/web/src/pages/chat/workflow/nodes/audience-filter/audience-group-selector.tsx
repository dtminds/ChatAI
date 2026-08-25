import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
  WORKFLOW_AUDIENCE_GROUP_MAX_COUNT,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
  type WorkflowAudienceGroupListItem,
  type WorkflowAudienceGroupSnapshot,
} from "@chatai/contracts";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/pages/chat/hooks/use-debounced-value";
import { listWorkflowAudienceGroups } from "./api";
import {
  getWorkflowAudienceGroupRuleDisplay,
  normalizeWorkflowAudienceGroupCatalog,
  normalizeWorkflowAudienceGroups,
  toWorkflowAudienceGroupSnapshot,
} from "./config";

const SEARCH_DEBOUNCE_MS = 300;
const TABLE_COLUMN_COUNT = 5;

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
  const [groups, setGroups] = useState<WorkflowAudienceGroupListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedSearch = searchQuery.trim();
  const debouncedName = useDebouncedValue(trimmedSearch, SEARCH_DEBOUNCE_MS);
  const searchName = trimmedSearch === "" ? "" : debouncedName;
  const requestVersionRef = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [searchName]);

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
      ...(searchName ? { name: searchName } : {}),
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
  }, [open, page, retryKey, searchName]);

  const { activePage, totalPages } = resolveTablePagination({
    page,
    pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
    total,
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftSelected(selected);
      setPage(1);
      setSearchQuery("");
    }
    setOpen(nextOpen);
  }

  function toggleGroup(group: WorkflowAudienceGroupListItem) {
    const selectedIndex = draftSelected.findIndex((item) => item.id === group.id);
    if (selectedIndex >= 0) {
      setDraftSelected(draftSelected.filter((item) => item.id !== group.id));
      return;
    }
    if (draftSelected.length >= WORKFLOW_AUDIENCE_GROUP_MAX_COUNT) return;
    setDraftSelected([...draftSelected, toWorkflowAudienceGroupSnapshot(group)]);
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
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(800px,calc(100vw-2rem))] max-w-[800px] flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <DialogTitle className="shrink-0 text-base">选择人群包</DialogTitle>
              <DialogDescription className="text-xs">
                当前仅支持选择企微客户人群包
              </DialogDescription>
            </div>
          </div>

          <div className="shrink-0 px-6 pb-3 pt-4">
            <div className="relative w-[280px] max-w-full">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                size={17}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索人群包"
                className="h-10 rounded-[8px] pl-9"
                maxLength={WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索人群包"
                value={searchQuery}
              />
            </div>
          </div>

          <div className="min-h-[320px] flex-1 overflow-auto px-6">
            <Table aria-label="人群包" className="table-fixed">
              <colgroup>
                <col className="w-14" />
                <col className="w-40" />
                <col />
                <col className="w-20" />
                <col className="w-44" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-3">
                    <span className="sr-only">选择</span>
                  </TableHead>
                  <TableHead className="h-11 px-3">人群包名称</TableHead>
                  <TableHead className="h-11 px-3">规则</TableHead>
                  <TableHead className="h-11 px-3">总人数</TableHead>
                  <TableHead className="h-11 whitespace-nowrap px-3">上一次计算完成时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || error || groups.length === 0 ? (
                  <TableStateRow
                    error={error}
                    loading={loading}
                    onRetry={() => setRetryKey((key) => key + 1)}
                  />
                ) : groups.map((group) => {
                  const checked = draftSelected.some((item) => item.id === group.id);
                  const atLimit = draftSelected.length >= WORKFLOW_AUDIENCE_GROUP_MAX_COUNT && !checked;
                  return (
                    <TableRow key={group.id}>
                      <TableCell className="px-3 py-3">
                        <Checkbox
                          aria-label={group.name}
                          checked={checked}
                          disabled={atLimit}
                          onCheckedChange={() => toggleGroup(group)}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3" title={group.name}>
                        <TableCellContent>{group.name}</TableCellContent>
                      </TableCell>
                      <TableCell className="px-3 py-3 align-top">
                        <AudienceGroupRuleCell group={group} />
                      </TableCell>
                      <TableCell className="px-3 py-3 text-muted-foreground">
                        {group.groupNum == null ? "-" : group.groupNum}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                        {group.peopleCalculateTime || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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

          <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                已选择 {draftSelected.length}/{WORKFLOW_AUDIENCE_GROUP_MAX_COUNT}
              </span>
              <Button
                disabled={draftSelected.length === 0}
                onClick={() => setDraftSelected([])}
                size="sm"
                type="button"
                variant="ghost"
              >
                清空
              </Button>
            </div>
            <div className="flex items-center gap-3">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AudienceGroupRuleCell({
  group,
}: {
  group: WorkflowAudienceGroupListItem;
}) {
  const display = getWorkflowAudienceGroupRuleDisplay(group);
  if (display.kind === "import") {
    return <Badge className="rounded-md">导入创建</Badge>;
  }
  if (display.kind === "conditions") {
    return (
      <div className="flex flex-col items-start gap-1">
        {display.items.map((item, index) => (
          <div
            className="max-w-full rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            key={`${index}:${item}`}
          >
            {item}
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-muted-foreground">-</span>;
}

function TableStateRow({
  error,
  loading,
  onRetry,
}: {
  error: boolean;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        className={error ? "h-52 text-center text-sm text-destructive" : "h-52 text-center text-sm text-muted-foreground"}
        colSpan={TABLE_COLUMN_COUNT}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2" role="status">
            <Spinner />
            正在加载
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-1" role="alert">
            <span>加载失败</span>
            <Button onClick={onRetry} size="sm" type="button" variant="ghost">
              重试
            </Button>
          </div>
        ) : (
          "暂无数据"
        )}
      </TableCell>
    </TableRow>
  );
}
