import { useEffect, useMemo, useState } from "react";
import type { TicketListQuery, TicketListResponse, TicketView } from "@chatai/contracts";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FilterIcon,
  Male02Icon,
  Notification01Icon,
  Search01Icon,
  StickyNote02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import { InsightDateRangeFilter } from "@/pages/chat/insights/insight-date-range-filter";
import { toBoundaryDate, type InsightDateRange } from "@/pages/chat/insights/insights-date-range";
import { getTickets } from "./api/tickets-service";
import {
  setTicketReminderDisplayMode,
  syncAssignedToMeActiveCount,
  type TicketReminderDisplayMode,
  useTicketCountStore,
} from "./ticket-count-store";
import { TicketOverdueBadge, TicketPriority, TicketStatusBadge } from "./ticket-display";
import { useAuthStore } from "@/store/auth-store";

const views = new Set<TicketView>(["assigned_to_me_active", "assigned_to_me", "reception", "unassigned", "created_by_me", "all"]);
const viewTabs: Array<{ label: string; value: TicketView }> = [
  { label: "我的待办", value: "assigned_to_me_active" },
  { label: "分配给我", value: "assigned_to_me" },
  { label: "我接待的", value: "reception" },
  { label: "我创建的", value: "created_by_me" },
  { label: "待领取", value: "unassigned" },
];
const allStatusOptions: Array<[string, string]> = [
  ["open", "待处理"],
  ["in_progress", "处理中"],
  ["done", "已完成"],
  ["canceled", "已取消"],
];
const ticketReminderDisplayOptions: Array<{
  description: string;
  label: string;
  value: TicketReminderDisplayMode;
}> = [
  {
    description: "显示待处理工单数量",
    label: "数字角标（默认）",
    value: "number",
  },
  {
    description: "仅提示存在待处理工单",
    label: "仅圆点",
    value: "dot",
  },
  {
    description: "不显示工单提醒",
    label: "不展示",
    value: "hidden",
  },
];

export function TicketsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.subUser?.role);
  const ticketReminderDisplayMode = useTicketCountStore(
    (state) => state.reminderDisplayMode,
  );
  const canViewAll = role === "owner" || role === "admin";
  const requestedView = searchParams.get("view") as TicketView | null;
  const view = requestedView
    && views.has(requestedView)
    && (requestedView !== "all" || canViewAll)
    ? requestedView
    : "assigned_to_me_active";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Omit<TicketListQuery, "page" | "pageSize" | "view">>({});
  const [searchInput, setSearchInput] = useState("");
  const [dateRange, setDateRange] = useState<InsightDateRange>();
  const [result, setResult] = useState<TicketListResponse>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderDisplayDraft, setReminderDisplayDraft] =
    useState<TicketReminderDisplayMode>(ticketReminderDisplayMode);
  const hasActiveFilters = Boolean(
    searchInput.trim()
    || dateRange
    || Object.values(filters).some(Boolean),
  );
  const query = useMemo(() => ({
    ...filters,
    createdFrom: dateRange ? Date.parse(toBoundaryDate(dateRange.from, "start")!) : undefined,
    createdTo: dateRange ? Date.parse(toBoundaryDate(dateRange.to, "end")!) : undefined,
    page,
    pageSize,
    status: view === "assigned_to_me_active" ? undefined : filters.status,
    view,
  }), [dateRange, filters, page, pageSize, view]);
  const shouldSyncAssignedToMeActiveCount =
    query.view === "assigned_to_me_active"
    && query.assigneeSubUserId == null
    && query.createdFrom == null
    && query.createdTo == null
    && query.dueScope == null
    && query.ownerAccountId == null
    && query.priority == null
    && query.search == null
    && query.sourceType == null
    && query.status == null;

  useEffect(() => {
    setPage(1);
    if (view === "assigned_to_me_active") {
      setFilters((current) =>
        current.status
          ? { ...current, status: undefined }
          : current,
      );
    }
  }, [view]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = searchInput.trim() || undefined;
      setFilters((current) => current.search === search ? current : { ...current, search });
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(undefined);
    void getTickets(query).then((data) => {
      if (!active) {
        return;
      }
      setResult(data);
      if (shouldSyncAssignedToMeActiveCount) {
        syncAssignedToMeActiveCount(data.total);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "工单加载失败");
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [query, shouldSyncAssignedToMeActiveCount]);
  const updateFilter = (key: keyof typeof filters, value: string | undefined) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] space-y-5 px-8 py-6">
        <header className="space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold">工单</h1>
              <p className="mt-1 text-sm text-muted-foreground">记录、跟进、妥善解决每一个客户的诉求</p>
            </div>
            <Button
              onClick={() => {
                setReminderDisplayDraft(ticketReminderDisplayMode);
                setReminderDialogOpen(true);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Notification01Icon}
                size={15}
                strokeWidth={1.8}
              />
              通知配置
            </Button>
          </div>
          <Tabs
            onValueChange={(nextView) => navigate(`/chat/tickets?view=${nextView}`)}
            value={view}
          >
            <TabsList aria-label="工单视图" className="scrollbar-none h-auto w-full justify-start overflow-x-auto overflow-y-hidden rounded-none border-b border-divider bg-transparent p-0 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {viewTabs.map((tab) => (
                <TabsTrigger
                  className="shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 sm:px-4 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  key={tab.value}
                  value={tab.value}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
              {canViewAll ? (
                <TabsTrigger
                  className="shrink-0 whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2.5 sm:px-4 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  value="all"
                >
                  全部工单
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        </header>
        <Dialog
          onOpenChange={(open) => {
            setReminderDialogOpen(open);
            if (open) {
              setReminderDisplayDraft(ticketReminderDisplayMode);
            }
          }}
          open={reminderDialogOpen}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>工单通知配置</DialogTitle>
              <DialogDescription>设置工单角标的提醒方式</DialogDescription>
            </DialogHeader>
            <RadioGroup
              aria-label="工单角标提醒方式"
              className="gap-2"
              onValueChange={(value) =>
                setReminderDisplayDraft(value as TicketReminderDisplayMode)}
              value={reminderDisplayDraft}
            >
              {ticketReminderDisplayOptions.map((option) => (
                <Label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[8px] border px-3.5 py-3 transition-colors",
                    reminderDisplayDraft === option.value
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted/40",
                  )}
                  htmlFor={`ticket-reminder-${option.value}`}
                  key={option.value}
                >
                  <RadioGroupItem
                    className="mt-0.5"
                    id={`ticket-reminder-${option.value}`}
                    value={option.value}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
            <TicketReminderPreview mode={reminderDisplayDraft} />
            <DialogFooter>
              <Button
                onClick={() => setReminderDialogOpen(false)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  setTicketReminderDisplayMode(reminderDisplayDraft);
                  setReminderDialogOpen(false);
                }}
                type="button"
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 w-full sm:w-[220px]">
            <HugeiconsIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" icon={Search01Icon} size={16} />
            <Input aria-label="搜索工单" className="pl-9" onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索编号或标题" value={searchInput} />
          </div>
          {view !== "assigned_to_me_active" ? (
            <TicketFilter
              label="状态"
              onChange={(value) => updateFilter("status", value)}
              options={allStatusOptions}
              value={filters.status}
            />
          ) : null}
          <TicketFilter
            label="优先级"
            onChange={(value) => updateFilter("priority", value)}
            options={[["high", "高"], ["medium", "中"], ["low", "低"]]}
            value={filters.priority}
          />
          <div className="min-w-0 sm:contents">
            <InsightDateRangeFilter
              allowEmpty
              emptyLabel="创建时间"
              from={dateRange?.from}
              maxRangeDays={3650}
              onChange={(range) => {
                setDateRange(range);
                setPage(1);
              }}
              to={dateRange?.to}
            />
          </div>
          <TicketAdvancedFilterDropdown
            filters={filters}
            hasActiveFilters={hasActiveFilters}
            onReset={() => {
              setFilters({});
              setSearchInput("");
              setDateRange(undefined);
              setPage(1);
            }}
            onUpdate={updateFilter}
          />
        </div>
        <div className="overflow-x-auto">
          <Table aria-label="工单列表" className="min-w-[680px] table-fixed">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
            </colgroup>
            <TableHeader><TableRow>
              <TableHead>标题</TableHead><TableHead className="text-center">状态</TableHead><TableHead className="text-center">优先级</TableHead><TableHead>负责人</TableHead><TableHead>创建人</TableHead><TableHead>更新时间</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6}><div className="flex h-32 items-center justify-center gap-2" role="status"><Spinner size={18} variant="classic" />正在加载</div></TableCell></TableRow>
                : error ? <TableRow><TableCell colSpan={6}><div className="py-12 text-center text-sm text-destructive" role="alert">{error}</div></TableCell></TableRow>
                : (result?.items.length ?? 0) === 0 ? <TableRow><TableCell className="py-12 text-center text-muted-foreground" colSpan={6}>暂无数据</TableCell></TableRow>
                : result!.items.map((ticket) => <TableRow key={ticket.ticketId}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-9 shrink-0 rounded-[6px]">
                        {ticket.customerAvatarUrl ? <AvatarImage alt={ticket.customerName} src={ticket.customerAvatarUrl} /> : null}
                        <AvatarFallback>
                          <HugeiconsIcon aria-hidden="true" icon={Male02Icon} size={17} strokeWidth={1.8} />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Link
                          className="line-clamp-2 block whitespace-normal break-words font-medium leading-5 text-foreground hover:underline"
                          title={ticket.title}
                          to={`/chat/tickets/${ticket.ticketId}?view=${view}`}
                        >
                          {ticket.title}
                        </Link>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{ticket.customerName}</span>
                          <Badge className="shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground" variant="secondary">
                            #{ticket.ticketId}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex h-6 items-center justify-center">
                      <TicketStatusBadge status={ticket.status} />
                      {ticket.overdue ? <TicketOverdueBadge className="ml-1.5" /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex h-6 items-center justify-center">
                      <TicketPriority priority={ticket.priority} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {ticket.assignee?.displayName ?? <span className="text-muted-foreground">未分配</span>}
                  </TableCell>
                  <TableCell>{ticket.createdBy?.displayName || (ticket.sourceType === "ai" ? "AI" : "-")}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatInsightTime(ticket.updatedAt)}</TableCell>
                </TableRow>)}
            </TableBody>
          </Table>
          <TablePagination itemLabel="项" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={result?.page ?? page} pageSize={result?.pageSize ?? pageSize} pageSizeOptions={[20, 50, 100]} total={result?.total ?? 0} totalPages={result?.totalPages ?? 1} />
        </div>
      </div>
    </div>
  );
}

function TicketReminderPreview({ mode }: { mode: TicketReminderDisplayMode }) {
  return (
    <section aria-label="工单提醒效果预览" className="space-y-2">
      <p className="text-sm font-medium text-foreground">效果预览</p>
      <div className="rounded-[8px] border border-border bg-background p-3">
        <div className="mx-auto flex h-9 max-w-[220px] items-center gap-2 rounded-[8px] bg-sidebar px-3 text-sm text-sidebar-foreground">
          <HugeiconsIcon
            aria-hidden="true"
            icon={StickyNote02Icon}
            size={16}
            strokeWidth={1.6}
          />
          <span>工单</span>
          {mode === "number" ? (
            <Badge
              aria-label="3 个待处理工单"
              className="ml-auto h-4 min-w-4 justify-center rounded-full border border-background bg-destructive px-1 py-0 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums"
            >
              3
            </Badge>
          ) : null}
          {mode === "dot" ? (
            <span
              aria-label="有待处理工单"
              className="ml-auto block size-2 rounded-full bg-destructive"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TicketFilter({ label, onChange, options, value }: { label: string; onChange: (value?: string) => void; options: Array<[string, string]>; value?: string }) {
  return <Select onValueChange={(nextValue) => onChange(nextValue === "all" ? undefined : nextValue)} value={value ?? "all"}><SelectTrigger aria-label={label} className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部{label}</SelectItem>{options.map(([optionValue,text]) => <SelectItem key={optionValue} value={optionValue}>{text}</SelectItem>)}</SelectContent></Select>;
}

function TicketAdvancedFilterDropdown({
  filters,
  hasActiveFilters,
  onReset,
  onUpdate,
}: {
  filters: Omit<TicketListQuery, "page" | "pageSize" | "view">;
  hasActiveFilters: boolean;
  onReset: () => void;
  onUpdate: (key: keyof Omit<TicketListQuery, "page" | "pageSize" | "view">, value: string | undefined) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="relative h-9 w-full rounded-[8px] sm:w-auto" variant="outline">
          <HugeiconsIcon icon={FilterIcon} size={16} />
          更多筛选
          {hasActiveFilters ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="更多筛选" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground">更多筛选</DropdownMenuLabel>
        <TicketFilterSubMenu label="来源" onValueChange={(value) => onUpdate("sourceType", value === "all" ? undefined : value)} options={[["all", "全部来源"], ["manual", "人工创建"], ["ai", "智能创建"]]} value={filters.sourceType ?? "all"} />
        <TicketFilterSubMenu label="截止时间" onValueChange={(value) => onUpdate("dueScope", value === "all" ? undefined : value)} options={[["all", "全部截止时间"], ["overdue", "已逾期"], ["today", "今日到期"], ["next_7_days", "未来 7 天"], ["none", "无截止时间"]]} value={filters.dueScope ?? "all"} />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasActiveFilters} onClick={onReset}>重置筛选</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TicketFilterSubMenu({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenuSub onOpenChange={setIsOpen} open={isOpen}>
      <DropdownMenuSubTrigger onClick={() => setIsOpen(true)}>
        <span className="min-w-0 flex-1">{label}</span>
        {value !== "all" ? <span className="mr-1 max-w-24 truncate text-xs text-muted-foreground">{options.find(([optionValue]) => optionValue === value)?.[1]}</span> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {options.map(([optionValue, optionLabel]) => <DropdownMenuRadioItem key={optionValue} value={optionValue}>{optionLabel}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
