import { useEffect, useMemo, useState } from "react";
import type { TicketListQuery, TicketListResponse, TicketView } from "@chatai/contracts";
import { Link, useSearchParams } from "react-router-dom";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import { getTicketCounts, getTickets } from "./api/tickets-service";
import { TicketsLayout } from "./tickets-layout";

const views = new Set<TicketView>(["assigned_to_me", "reception", "unassigned", "created_by_me", "all"]);

export function TicketsPage() {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get("view") as TicketView | null;
  const view = requestedView && views.has(requestedView) ? requestedView : "assigned_to_me";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Omit<TicketListQuery, "page" | "pageSize" | "view">>({});
  const [result, setResult] = useState<TicketListResponse>();
  const [unassignedCount, setUnassignedCount] = useState<number>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const query = useMemo(() => ({ ...filters, page, pageSize, view }), [filters, page, pageSize, view]);

  useEffect(() => { setPage(1); }, [view]);
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(undefined);
    void getTickets(query).then((data) => active && setResult(data)).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "工单加载失败");
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [query]);
  useEffect(() => {
    void getTicketCounts().then((data) => setUnassignedCount(data.unassignedOpen)).catch(() => undefined);
  }, []);

  const updateFilter = (key: keyof typeof filters, value: string | undefined) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  };

  return (
    <TicketsLayout unassignedCount={unassignedCount}>
      <div className="space-y-5">
        <header><h1 className="text-[22px] font-semibold">工单</h1></header>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <HugeiconsIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" icon={Search01Icon} size={16} />
            <Input aria-label="搜索工单" className="pl-9" onChange={(event) => updateFilter("search", event.target.value)} placeholder="搜索编号、标题或客户" value={filters.search ?? ""} />
          </div>
          <TicketFilter label="状态" onChange={(value) => updateFilter("status", value)} options={[['open','待处理'],['in_progress','处理中'],['done','已完成'],['canceled','已取消']]} />
          <TicketFilter label="来源" onChange={(value) => updateFilter("sourceType", value)} options={[['manual','人工创建'],['ai','智能创建']]} />
          <TicketFilter label="优先级" onChange={(value) => updateFilter("priority", value)} options={[['high','高'],['medium','中'],['low','低']]} />
          <TicketFilter label="截止时间" onChange={(value) => updateFilter("dueScope", value)} options={[['overdue','已逾期'],['today','今日到期'],['next_7_days','未来 7 天'],['none','无截止时间']]} />
          <Input aria-label="所属账号 ID" className="w-36" onChange={(event) => updateFilter("ownerAccountId", event.target.value)} placeholder="所属账号 ID" />
          <Input aria-label="负责人 ID" className="w-32" onChange={(event) => updateFilter("assigneeSubUserId", event.target.value)} placeholder="负责人 ID" />
          <Input aria-label="创建开始时间" className="w-40" onChange={(event) => setDateFilter("createdFrom", event.target.value, setFilters, setPage)} type="date" />
          <Input aria-label="创建结束时间" className="w-40" onChange={(event) => setDateFilter("createdTo", event.target.value, setFilters, setPage, true)} type="date" />
        </div>
        <div className="overflow-x-auto">
          <Table aria-label="工单列表">
            <TableHeader><TableRow>
              <TableHead>工单</TableHead><TableHead>客户 / 所属账号</TableHead><TableHead>状态</TableHead><TableHead>优先级</TableHead><TableHead>负责人</TableHead><TableHead>创建人 / 创建时间</TableHead><TableHead>截止时间</TableHead><TableHead>更新时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={8}><div className="flex h-32 items-center justify-center gap-2" role="status"><Spinner size={18} variant="classic" />正在加载</div></TableCell></TableRow>
                : error ? <TableRow><TableCell colSpan={8}><div className="py-12 text-center text-sm text-destructive" role="alert">{error}</div></TableCell></TableRow>
                : (result?.items.length ?? 0) === 0 ? <TableRow><TableCell className="py-12 text-center text-muted-foreground" colSpan={8}>暂无数据</TableCell></TableRow>
                : result!.items.map((ticket) => <TableRow key={ticket.ticketId}>
                  <TableCell><Link className="font-medium text-foreground hover:underline" to={`/chat/tickets/${ticket.ticketId}`}>#{ticket.ticketId} {ticket.title}</Link><div className="mt-1 text-xs text-muted-foreground">{ticket.sourceType === 'ai' ? '智能创建' : '人工创建'}</div></TableCell>
                  <TableCell><div>{ticket.customerName}</div><div className="text-xs text-muted-foreground">{ticket.ownerAccountName}</div></TableCell>
                  <TableCell><Badge variant="outline">{statusText(ticket.status)}</Badge>{ticket.overdue ? <Badge className="ml-1 bg-destructive/10 text-destructive">逾期</Badge> : null}</TableCell>
                  <TableCell>{priorityText(ticket.priority)}</TableCell>
                  <TableCell>{ticket.assignee?.displayName || "未分配"}</TableCell>
                  <TableCell><div>{ticket.createdBy?.displayName || (ticket.sourceType === "ai" ? "AI" : "-")}</div><div className="text-xs text-muted-foreground">{formatInsightTime(ticket.createdAt)}</div></TableCell>
                  <TableCell>{ticket.dueAt ? formatInsightTime(ticket.dueAt) : "-"}</TableCell>
                  <TableCell>{formatInsightTime(ticket.updatedAt)}</TableCell>
                </TableRow>)}
            </TableBody>
          </Table>
          <TablePagination itemLabel="项" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={result?.page ?? page} pageSize={result?.pageSize ?? pageSize} pageSizeOptions={[20, 50, 100]} total={result?.total ?? 0} totalPages={result?.totalPages ?? 1} />
        </div>
      </div>
    </TicketsLayout>
  );
}

function TicketFilter({ label, onChange, options }: { label: string; onChange: (value?: string) => void; options: Array<[string,string]> }) {
  return <Select onValueChange={(value) => onChange(value === "all" ? undefined : value)}><SelectTrigger aria-label={label} className="w-32"><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value="all">全部{label}</SelectItem>{options.map(([value,text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select>;
}

function setDateFilter(key: "createdFrom" | "createdTo", value: string, setFilters: React.Dispatch<React.SetStateAction<Omit<TicketListQuery,"page"|"pageSize"|"view">>>, setPage: (page:number)=>void, end = false) {
  const timestamp = value ? new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`).getTime() : undefined;
  setFilters((current) => ({ ...current, [key]: timestamp })); setPage(1);
}
function statusText(status: string) { return ({ open: "待处理", in_progress: "处理中", done: "已完成", canceled: "已取消" } as Record<string,string>)[status] ?? status; }
function priorityText(priority: string) { return ({ high: "高", medium: "中", low: "低" } as Record<string,string>)[priority] ?? priority; }
