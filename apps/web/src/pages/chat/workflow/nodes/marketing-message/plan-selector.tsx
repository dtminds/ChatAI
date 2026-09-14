import {
  WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE,
  WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
  type WorkflowMarketingPlanListItem,
  type WorkflowMarketingPlanSnapshot,
} from "@chatai/contracts";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveTablePagination, TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/pages/chat/hooks/use-debounced-value";
import { listWorkflowMarketingPlans } from "./api";
import { toMarketingPlanSnapshot } from "./config";

const SEARCH_DEBOUNCE_MS = 300;

export function MarketingPlanSelector({ onChange, value }: {
  onChange(value: WorkflowMarketingPlanSnapshot): void;
  value?: WorkflowMarketingPlanSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowMarketingPlanSnapshot | undefined>();
  const [plans, setPlans] = useState<WorkflowMarketingPlanListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const debouncedSearch = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const search = trimmedQuery === "" ? "" : debouncedSearch;
  const version = useRef(0);
  const previousSearch = useRef(search);

  useEffect(() => {
    const searchChanged = previousSearch.current !== search;
    previousSearch.current = search;
    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }
    if (!open) return;
    const requestVersion = ++version.current;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void listWorkflowMarketingPlans({
      page,
      pageSize: WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE,
      ...(search ? { planName: search } : {}),
    }).then((response) => {
      if (cancelled || version.current !== requestVersion) return;
      setPlans(response.plans);
      setTotal(response.pagination.total);
    }).catch(() => {
      if (cancelled || version.current !== requestVersion) return;
      setPlans([]);
      setError(true);
    }).finally(() => {
      if (!cancelled && version.current === requestVersion) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, page, retryKey, search]);

  const pagination = resolveTablePagination({ page, pageSize: WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE, total });
  const setDialogOpen = (next: boolean) => {
    if (next) {
      setDraft(value);
      setPage(1);
      setQuery("");
    }
    setOpen(next);
  };

  return <>
    <Button
      aria-haspopup="dialog"
      className="h-9 w-full justify-between px-3 text-[13px] font-normal"
      onClick={() => setDialogOpen(true)}
      type="button"
      variant="outline"
    >
      <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.planName ?? "请选择触达任务"}</span>
      <span aria-hidden="true" className="text-muted-foreground">选择</span>
    </Button>
    <Dialog onOpenChange={setDialogOpen} open={open}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] max-w-[720px] flex-col gap-0 overflow-hidden p-0">
        <div className="px-6 py-4"><DialogTitle className="text-[15px]">选择触达任务</DialogTitle></div>
        <div className="px-6 pb-3">
          <div className="relative w-[280px] max-w-full">
            <HugeiconsIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" icon={Search01Icon} size={17} strokeWidth={1.8} />
            <Input aria-label="搜索触达任务" className="h-10 pl-9 text-[13px] md:text-[13px]" maxLength={WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH} onChange={event => setQuery(event.target.value)} placeholder="搜索触达任务" value={query} />
          </div>
        </div>
        <div className="min-h-[300px] flex-1 overflow-auto px-6">
          <RadioGroup onValueChange={(id) => {
            const plan = plans.find(item => item.planId === Number(id));
            if (plan) setDraft(toMarketingPlanSnapshot(plan));
          }} value={draft ? String(draft.planId) : undefined}>
            <Table aria-label="触达任务">
              <TableHeader><TableRow><TableHead className="w-12"><span className="sr-only">选择</span></TableHead><TableHead>任务名称</TableHead><TableHead className="w-40">触达渠道</TableHead><TableHead className="w-24">状态</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading || error || plans.length === 0 ? <TableState loading={loading} error={error} onRetry={() => setRetryKey(key => key + 1)} /> : plans.map(plan => <TableRow key={plan.planId}>
                  <TableCell><RadioGroupItem className="translate-y-[2px]" aria-label={plan.name} value={String(plan.planId)} /></TableCell>
                  <TableCell className="max-w-0 truncate" title={plan.name}>{plan.name}</TableCell>
                  <TableCell><div className="flex gap-1">{plan.sendChannels.map(channel => <Badge className="rounded-md" key={channel} variant="secondary">{channel === 1 ? "短信" : "企业微信"}</Badge>)}</div></TableCell>
                  <TableCell className="text-muted-foreground">{statusLabel(plan.status)}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </RadioGroup>
        </div>
        <TablePagination className="border-t-0 px-6 py-4" itemLabel="个" onPageChange={setPage} page={pagination.activePage} pageSize={WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE} total={total} totalPages={pagination.totalPages} />
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button onClick={() => setOpen(false)} type="button" variant="outline">取消</Button>
          <Button disabled={!draft} onClick={() => { if (draft) onChange(draft); setOpen(false); }} type="button">确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function statusLabel(status: WorkflowMarketingPlanListItem["status"]) {
  if (status === 0) return "运行中";
  if (status === 2) return "暂停中";
  if (status === 3) return "未开始";
  return "已结束";
}

function TableState({ error, loading, onRetry }: { error: boolean; loading: boolean; onRetry(): void }) {
  return <TableRow className="hover:bg-transparent"><TableCell className="h-52 text-center text-sm text-muted-foreground" colSpan={4}>
    {loading ? <div className="flex items-center justify-center gap-2" role="status"><Spinner />正在加载</div>
      : error ? <div className="flex flex-col items-center gap-1 text-destructive" role="alert"><span>加载失败</span><Button onClick={onRetry} size="sm" type="button" variant="ghost">重试</Button></div>
      : "暂无数据"}
  </TableCell></TableRow>;
}
