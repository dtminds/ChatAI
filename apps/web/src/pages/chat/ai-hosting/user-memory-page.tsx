import type { AgentUserMemoryCategory, AgentUserMemoryCustomerDetailResponse, AgentUserMemoryItem, AgentUserMemoryOverviewResponse, AgentUserMemoryRun, AgentUserMemoryRunDetailResponse } from "@chatai/contracts";
import { GoogleGeminiIcon, ChartAreaIcon, UserEdit01Icon, Delete02Icon, Edit02Icon, MoreHorizontalIcon, PlusSignIcon, Settings03Icon, TimeHalfPassIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { toast } from "sonner";
import { RequestNormalizedError } from "@/lib/request";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveTablePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/auth-store";
import { insightChartColors, insightResolutionColors } from "../insights/insights-chart-palette";
import { canMaintainUserMemory, canManageAiHostingAgents } from "./agent-permissions";
import { AiHostingIntroGuide } from "./ai-hosting-intro-guide";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, getUserMemoryEvidence, getUserMemoryOverview, getUserMemoryRun, listUserMemoryCustomers, listUserMemoryRuns, updateUserMemoryItem, updateUserMemorySettings } from "./api/user-memory-service";
import { USER_MEMORY_CATEGORIES, UserMemoryEditorDialog } from "./user-memory-editor-dialog";
import { UserMemoryInstructionDialog } from "./user-memory-instruction-dialog";
import { UserMemoryObservability } from "./user-memory-observability";

type Customer = Awaited<ReturnType<typeof listUserMemoryCustomers>>["items"][number];
type CustomerSelection = Pick<Customer, "customerName" | "platform" | "thirdExternalUserId"> & Partial<Pick<Customer, "avatarUrl" | "memoryCount" | "updatedAt">>;
type Evidence = Awaited<ReturnType<typeof getUserMemoryEvidence>>;
type UserMemoryTab = "overview" | "customers" | "observability";
const USER_MEMORY_CUSTOMER_PAGE_SIZE = 20;
const userMemoryIntroSteps = [
  {
    description: "AI 自动从客户会话中提炼稳定信息形成记忆",
    imageAlt: "提炼记忆示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/memory_f1.png",
    step: "第 1 步",
    title: "提炼记忆",
  },
  {
    description: "客服在服务过程中，也可按需添加、修改或删除记忆",
    imageAlt: "协同维护示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/memory_f2.png",
    step: "第 2 步",
    title: "协同维护",
  },
  {
    description: "在 Agent 设置中开启客户记忆，让每次服务更懂客户",
    imageAlt: "授权使用示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/memory_f3.png",
    step: "第 3 步",
    title: "授权使用",
  },
] as const;

export function UserMemoryPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const canManage = canManageAiHostingAgents(role);
  const canMaintain = canMaintainUserMemory(role);
  const [overview, setOverview] = useState<AgentUserMemoryOverviewResponse>();
  const [activeTab, setActiveTab] = useState<UserMemoryTab>("overview");
  const [runs, setRuns] = useState<AgentUserMemoryRun[]>([]);
  const [runNextCursor, setRunNextCursor] = useState<string>();
  const [runDetail, setRunDetail] = useState<AgentUserMemoryRunDetailResponse>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [selected, setSelected] = useState<CustomerSelection>();
  const [detail, setDetail] = useState<AgentUserMemoryCustomerDetailResponse>();
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paging, setPaging] = useState(false);
  const activeCustomerKey = useRef<string | undefined>(undefined);
  const [editor, setEditor] = useState<{ item?: AgentUserMemoryItem }>();
  const [deleting, setDeleting] = useState<AgentUserMemoryItem>();
  const [evidence, setEvidence] = useState<Evidence>();
  const [instructionOpen, setInstructionOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    setError(false); setLoading(true);
    try {
      const [nextOverview, nextRuns] = await Promise.all([
        getUserMemoryOverview(), listUserMemoryRuns({ pageSize: 20 }),
      ]);
      setOverview(nextOverview); setRuns(nextRuns.items); setRunNextCursor(nextRuns.nextCursor);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  const loadCustomers = useCallback(async () => {
    setCustomerError(false); setCustomerLoading(true);
    try {
      const nextCustomers = await listUserMemoryCustomers({ page: 1, pageSize: USER_MEMORY_CUSTOMER_PAGE_SIZE });
      setCustomers(nextCustomers.items); setCustomerPage(nextCustomers.page); setCustomerTotal(nextCustomers.total);
    } catch { setCustomerError(true); }
    finally { setCustomerLoading(false); }
  }, []);
  useEffect(() => {
    if (activeTab === "overview") void loadOverview();
  }, [activeTab, loadOverview]);
  useEffect(() => {
    if (activeTab === "customers") void loadCustomers();
  }, [activeTab, loadCustomers]);
  useEffect(() => {
    if (activeTab !== "overview" || !overview?.activeRun) return;
    const timer = window.setInterval(() => void Promise.all([getUserMemoryOverview(), listUserMemoryRuns({ pageSize: 20 })])
      .then(([nextOverview, nextRuns]) => { setOverview(nextOverview); setRuns(nextRuns.items); setRunNextCursor(nextRuns.nextCursor); })
      .catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [activeTab, overview?.activeRun?.id]);

  async function chooseCustomer(customer: CustomerSelection) {
    const key = `${customer.platform}:${customer.thirdExternalUserId}`;
    activeCustomerKey.current = key;
    setSelected(customer); setDetail(undefined); setDetailError(false);
    try {
      const next = await getUserMemoryCustomer(customer.thirdExternalUserId);
      if (activeCustomerKey.current === key) setDetail(next);
    } catch {
      if (activeCustomerKey.current === key) { setDetailError(true); toast.error("加载失败"); }
    }
  }
  async function reloadSelectedCustomer() {
    if (!selected) return;
    const next = await getUserMemoryCustomer(selected.thirdExternalUserId);
    setDetail(next); setDetailError(false);
  }
  async function handleVersionConflict(error: unknown, fallback: string) {
    if (error instanceof RequestNormalizedError && error.code === "AGENT_USER_MEMORY_VERSION_CONFLICT") {
      try { await reloadSelectedCustomer(); } catch { setDetailError(true); toast.error("记忆已更新，但最新数据加载失败"); return; }
      toast.error("记忆内容已发生变化，请确认后重试");
      return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
  }
  async function toggleEnabled(enabled: boolean) {
    setSaving(true);
    try { setOverview(await updateUserMemorySettings({ enabled })); toast.success(enabled ? "已开启" : "已关闭"); }
    catch { toast.error("操作失败"); }
    finally { setSaving(false); }
  }
  async function saveExtractionInstruction(extractionInstruction: string) {
    setSaving(true);
    try {
      setOverview(await updateUserMemorySettings({ extractionInstruction }));
      setInstructionOpen(false);
      toast.success("已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }
  async function saveMemory(input: { category: AgentUserMemoryCategory; content: string; expiresAt: number | null }) {
    if (!selected || !detail) return;
    setSaving(true);
    try {
      const next = editor?.item
        ? await updateUserMemoryItem(selected.thirdExternalUserId, editor.item.id, { ...input, expectedVersion: detail.version })
        : await createUserMemoryItem(selected.thirdExternalUserId, { ...input, expectedVersion: detail.version });
      setDetail(next); setEditor(undefined); toast.success("已保存"); await loadCustomers();
    } catch (error) { await handleVersionConflict(error, "保存失败"); }
    finally { setSaving(false); }
  }
  async function removeMemory() {
    if (!selected || !detail || !deleting) return;
    setSaving(true);
    try { setDetail(await deleteUserMemoryItem(selected.thirdExternalUserId, deleting.id, { expectedVersion: detail.version })); setDeleting(undefined); toast.success("已删除"); await loadCustomers(); }
    catch (error) { await handleVersionConflict(error, "删除失败"); }
    finally { setSaving(false); }
  }
  async function showEvidence(item: AgentUserMemoryItem) {
    if (!selected || item.source !== "ai" || !item.sourceSessionId || !item.evidenceMessageIds?.length) return;
    try { setEvidence(await getUserMemoryEvidence(selected.thirdExternalUserId, item.id)); }
    catch { toast.error("证据加载失败"); }
  }
  async function loadMoreRuns() {
    if (!runNextCursor || paging) return;
    setPaging(true);
    try { const page = await listUserMemoryRuns({ cursor: runNextCursor, pageSize: 20 }); setRuns((current) => [...current, ...page.items]); setRunNextCursor(page.nextCursor); }
    catch { toast.error("加载失败"); }
    finally { setPaging(false); }
  }
  async function changeCustomerPage(nextPage: number) {
    if (paging || nextPage === customerPage) return;
    setPaging(true);
    try {
      const result = await listUserMemoryCustomers({
        page: nextPage,
        pageSize: USER_MEMORY_CUSTOMER_PAGE_SIZE,
      });
      setCustomers(result.items);
      setCustomerPage(result.page);
      setCustomerTotal(result.total);
    }
    catch { toast.error("加载失败"); }
    finally { setPaging(false); }
  }
  async function showRunDetail(runId: number) {
    try { setRunDetail(await getUserMemoryRun(runId, { itemPageSize: 100 })); }
    catch { toast.error("运行详情加载失败"); }
  }
  async function loadMoreRunItems() {
    if (!runDetail?.nextItemCursor || paging) return;
    const currentRunId = runDetail.run.id;
    setPaging(true);
    try {
      const page = await getUserMemoryRun(currentRunId, { itemCursor: runDetail.nextItemCursor, itemPageSize: 100 });
      setRunDetail((current) => current?.run.id === currentRunId ? { ...page, items: [...current.items, ...page.items] } : current);
    } catch { toast.error("运行详情加载失败"); }
    finally { setPaging(false); }
  }

  return <AiHostingLayout title="记忆">
    <div className="space-y-6">
      <AiHostingPageHeader
        title="记忆"
        titleActions={overview ? <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-2 rounded-full bg-muted px-2.5"><span className={overview.enabled ? "text-sm font-medium text-success" : "text-sm font-medium text-destructive"}>{overview.enabled ? "已开启" : "未开启"}</span><Switch aria-label="用户记忆" checked={overview.enabled} className="data-[state=checked]:bg-success data-[state=unchecked]:bg-destructive" disabled={!canManage || saving} onCheckedChange={toggleEnabled} /></div>
          <Button
            className="h-8 rounded-full bg-muted px-3 text-sm"
            disabled={!canManage || saving}
            onClick={() => setInstructionOpen(true)}
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={Settings03Icon} size={15} />
            规则配置
          </Button>
        </div> : undefined}
        description="AI 自动提炼客户的稳定背景、长期偏好与沟通习惯，让每次服务更懂客户"
      />
      <AiHostingIntroGuide ariaLabel="客户记忆使用引导" steps={userMemoryIntroSteps} />
      <Tabs onValueChange={(value) => setActiveTab(value as UserMemoryTab)} value={activeTab}>
        <TabsList variant="underline"><TabsTrigger value="overview" variant="underline">概览</TabsTrigger><TabsTrigger value="customers" variant="underline">记忆明细</TabsTrigger>{overview?.canViewWorkerObservability ? <TabsTrigger value="observability" variant="underline">运行观测</TabsTrigger> : null}</TabsList>
        <TabsContent className="pt-5" value="overview">
          {loading ? <Loading /> : error || !overview ? <LoadError onRetry={loadOverview} /> : <Overview runs={runs} canViewDetails={canManage} loadingMore={paging} hasMore={Boolean(runNextCursor)} onLoadMore={() => void loadMoreRuns()} onShowDetail={(id) => void showRunDetail(id)} />}
        </TabsContent>
        <TabsContent className="pt-5" value="customers">
          <MemoryCustomerList
            customers={customers}
            error={customerError}
            loading={customerLoading}
            page={customerPage}
            paging={paging}
            onOpenCustomer={(customer) => void chooseCustomer(customer)}
            onPageChange={(page) => void changeCustomerPage(page)}
            onRetry={loadCustomers}
            total={customerTotal}
          />
        </TabsContent>
        {overview?.canViewWorkerObservability ? <TabsContent className="pt-5" value="observability"><UserMemoryObservability /></TabsContent> : null}
      </Tabs>
    </div>
    <CustomerDetailSheet
      canManage={canMaintain}
      customer={selected}
      detail={detail}
      error={detailError}
      onAdd={() => setEditor({})}
      onDelete={setDeleting}
      onEdit={(item) => setEditor({ item })}
      onOpenChange={(open) => { if (!open && !saving) { activeCustomerKey.current = undefined; setSelected(undefined); setDetail(undefined); setDetailError(false); } }}
      onRetry={() => { if (selected) void chooseCustomer(selected); }}
      onShowEvidence={(item) => void showEvidence(item)}
      open={Boolean(selected)}
    />
    <UserMemoryEditorDialog open={Boolean(editor)} item={editor?.item} saving={saving} onOpenChange={(open) => { if (!open && !saving) setEditor(undefined); }} onSave={saveMemory} />
    <UserMemoryInstructionDialog
      onOpenChange={setInstructionOpen}
      onSave={(value) => void saveExtractionInstruction(value)}
      open={instructionOpen}
      saving={saving}
      value={overview?.extractionInstruction ?? ""}
    />
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(undefined); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>删除记忆</AlertDialogTitle><AlertDialogDescription>删除后将立即从客户当前记忆中移除</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>取消</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void removeMemory(); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => { if (!open) setEvidence(undefined); }}><DialogContent><DialogHeader><DialogTitle>来源证据</DialogTitle><DialogDescription>AI 提炼时引用的客户消息</DialogDescription></DialogHeader><div className="space-y-2">{evidence?.messages.map((message) => <div className="rounded-lg bg-surface-muted p-3 text-sm" key={message.messageId}>{message.content}</div>)}</div></DialogContent></Dialog>
    <RunDetailDialog
      detail={runDetail}
      loading={paging}
      onLoadMore={() => void loadMoreRunItems()}
      onOpenChange={(open) => { if (!open) setRunDetail(undefined); }}
      onOpenCustomer={(customer) => void chooseCustomer(customer)}
    />
  </AiHostingLayout>;
}

function Overview({ runs, canViewDetails, loadingMore, hasMore, onLoadMore, onShowDetail }: { runs: AgentUserMemoryRun[]; canViewDetails: boolean; loadingMore: boolean; hasMore: boolean; onLoadMore: () => void; onShowDetail: (id: number) => void }) {
  return (
    <div className="space-y-5">
      <section className="flex min-h-[240px] flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border bg-background text-muted-foreground">
              <HugeiconsIcon icon={ChartAreaIcon} size={17} />
            </span>
            <h2 className="text-base font-medium">记忆维护趋势</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
            {memoryTrendSeries.map((series) => (
              <TrendLegend color={series.color} key={series.key} label={series.label} />
            ))}
          </div>
        </div>
        <RunTrendChart runs={runs} />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="grid gap-3 p-4 sm:px-6 sm:py-4">
          <h2 className="text-base font-medium">运行记录</h2>
        </div>
        <div className="overflow-x-auto px-4 pb-4 sm:px-6">
          <Table aria-label="记忆维护运行记录">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 min-w-[140px]">日期</TableHead>
                <TableHead className="h-11 min-w-[100px]">客户数</TableHead>
                <TableHead className="h-11 min-w-[260px]">记忆变更</TableHead>
                <TableHead className="h-11 min-w-[100px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Empty />
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="py-4 font-medium">{run.quotaDate}</TableCell>
                    <TableCell className="py-4">{run.selectedCustomerCount}</TableCell>
                    <TableCell className="py-4">{runMemoryChangeLabel(run)}</TableCell>
                    <TableCell className="py-4 text-right">
                      <Button
                        aria-label="详情"
                        className="size-8 p-0 text-muted-foreground"
                        disabled={!canViewDetails}
                        onClick={() => onShowDetail(run.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={ViewIcon} size={18} strokeWidth={1.8} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasMore ? (
            <div className="mt-4 text-center">
              <Button disabled={loadingMore} onClick={onLoadMore} variant="outline">
                {loadingMore ? <Spinner size={16} /> : null}
                加载更多
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RunTrendChart({ runs }: { runs: AgentUserMemoryRun[] }) {
  const points = [...runs]
    .filter(hasMemoryChangeStats)
    .sort((left, right) => left.quotaDate.localeCompare(right.quotaDate))
    .map((run) => ({ date: run.quotaDate, added: run.memoryAddedCount, removed: run.memoryRemovedCount, updated: run.memoryUpdatedCount }));

  return (
    <div className="flex flex-1 items-stretch">
      <div className="min-h-[180px] min-w-0 flex-1">
        {points.length > 0 ? (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={points} margin={{ bottom: 0, left: -16, right: 14, top: 10 }}>
              <defs>
                {memoryTrendSeries.map((series) => (
                  <linearGradient
                    id={`userMemoryTrend-${series.key}`}
                    key={series.key}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={series.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={series.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeOpacity={0.45}
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="date"
                dy={10}
                tick={{ fill: insightChartColors.axis, fontSize: 12 }}
                tickFormatter={formatTrendDate}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: insightChartColors.axis, fontSize: 12 }}
                tickLine={false}
                width={46}
              />
              <Tooltip content={<MemoryTrendTooltip />} />
              {memoryTrendSeries.map((series) => (
                <Area
                  animationDuration={450}
                  dataKey={series.key}
                  fill={`url(#userMemoryTrend-${series.key})`}
                  key={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2.2}
                  type="monotone"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[10px] bg-muted/35 text-sm text-muted-foreground">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}

const memoryTrendSeries = [
  { color: insightResolutionColors.resolved, key: "added", label: "新增" },
  { color: insightResolutionColors.unknown, key: "updated", label: "更新" },
  { color: insightResolutionColors.unresolved, key: "removed", label: "删除" },
] as const;

function MemoryTrendTooltip({
  active,
  label,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{String(label).replaceAll("-", "/")}</div>
      <div className="mt-2 grid gap-1.5">
        {memoryTrendSeries.map((series) => {
          const value = payload.find((item) => item.dataKey === series.key)?.value ?? 0;
          return (
            <div className="flex items-center gap-2" key={series.key}>
              <span className="size-2 rounded-full" style={{ backgroundColor: series.color }} />
              <span className="text-muted-foreground">{series.label}</span>
              <span className="font-semibold tabular-nums">{Number(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function MemoryCustomerList({ customers, error, loading, page, paging, total, onOpenCustomer, onPageChange, onRetry }: { customers: Customer[]; error: boolean; loading: boolean; page: number; paging: boolean; total: number; onOpenCustomer: (customer: Customer) => void; onPageChange: (page: number) => void; onRetry: () => void }) {
  const { activePage, totalPages } = resolveTablePagination({
    page,
    pageSize: USER_MEMORY_CUSTOMER_PAGE_SIZE,
    total,
  });
  const visibleCustomers = [...customers]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  return (
    <section className="space-y-4">
      <div className="overflow-x-auto">
        <Table aria-label="客户记忆" className="min-w-[760px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-[35%] px-4">客户</TableHead>
              <TableHead className="h-11 w-[18%] px-4">记忆概览</TableHead>
              <TableHead className="h-11 w-[32%] px-4">最近更新</TableHead>
              <TableHead className="h-11 w-[15%] px-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || paging ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Loading />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <LoadError onRetry={onRetry} />
                </TableCell>
              </TableRow>
            ) : visibleCustomers.length > 0 ? (
              visibleCustomers.map((customer) => (
                <TableRow key={`${customer.platform}:${customer.thirdExternalUserId}`}>
                  <TableCell className="px-4 py-4">
                    <button
                      className="flex min-w-0 items-center gap-3 text-left"
                      onClick={() => onOpenCustomer(customer)}
                    >
                      <CustomerAvatar customer={customer} />
                      <span className="block min-w-0 max-w-56 truncate font-medium">
                        {customer.customerName}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <Badge variant="outline">{customer.memoryCount} 条</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span className="text-sm">{formatUpdatedAt(customer.updatedAt)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    <Button
                      aria-label={`查看${customer.customerName}记忆`}
                      className="size-8 p-0 text-muted-foreground"
                      onClick={() => onOpenCustomer(customer)}
                      size="icon"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={ViewIcon} size={18} strokeWidth={1.8} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-sm text-muted-foreground"
                  colSpan={4}
                >
                  暂无客户记忆
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!loading && !error && totalPages > 1 ? (
          <TablePagination
            itemLabel="位客户"
            onPageChange={onPageChange}
            page={activePage}
            total={total}
            totalPages={totalPages}
          />
        ) : null}
      </div>
    </section>
  );
}

function CustomerDetailSheet({ canManage, customer, detail, error, open, onAdd, onDelete, onEdit, onOpenChange, onRetry, onShowEvidence }: { canManage: boolean; customer?: CustomerSelection; detail?: AgentUserMemoryCustomerDetailResponse; error: boolean; open: boolean; onAdd: () => void; onDelete: (item: AgentUserMemoryItem) => void; onEdit: (item: AgentUserMemoryItem) => void; onOpenChange: (open: boolean) => void; onRetry: () => void; onShowEvidence: (item: AgentUserMemoryItem) => void }) {
  const memoryCount = detail?.items.length ?? customer?.memoryCount ?? 0;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-hidden p-0 [&>button:last-child]:top-5 sm:max-w-[680px]">
        <SheetHeader className={canManage && detail ? "border-b pr-24 sm:pr-44" : "border-b pr-14"}>
          <div className="flex items-center gap-3">
            <CustomerAvatar customer={customer} />
            <div className="min-w-0">
              <SheetTitle className="truncate">{customer?.customerName ?? "客户记忆"}</SheetTitle>
              <SheetDescription>
                记忆 {memoryCount} / 20，最近更新于 {formatUpdatedAt(customer?.updatedAt)}
              </SheetDescription>
            </div>
          </div>
          {canManage && detail ? (
            <Button aria-label="新增记忆" className="absolute right-14 top-5 size-8 p-0 sm:w-auto sm:px-3" onClick={onAdd} size="sm" variant="ghost">
              <HugeiconsIcon icon={PlusSignIcon} size={16} />
              <span className="hidden sm:inline">新增记忆</span>
            </Button>
          ) : null}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            {error ? <LoadError onRetry={onRetry} /> : !detail ? <Loading /> : detail.items.length === 0 ? <Empty /> : (
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <CustomerDetailMemoryItem
                    canManage={canManage}
                    item={item}
                    key={item.id}
                    onDelete={() => onDelete(item)}
                    onEdit={() => onEdit(item)}
                    onShowEvidence={() => onShowEvidence(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function CustomerDetailMemoryItem({ canManage, item, onDelete, onEdit, onShowEvidence }: { canManage: boolean; item: AgentUserMemoryItem; onDelete: () => void; onEdit: () => void; onShowEvidence: () => void }) {
  const category = USER_MEMORY_CATEGORIES.find((option) => option.value === item.category) ?? USER_MEMORY_CATEGORIES[0];
  const hasEvidence = item.source === "ai" && Boolean(item.sourceSessionId && item.evidenceMessageIds?.length);
  return (
    <div className="rounded-[10px] border bg-background px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="h-5 shrink-0 gap-1 rounded-[6px] border-border/80 bg-background px-1.5 py-0 text-[11px] leading-none text-muted-foreground" variant="outline">
            <HugeiconsIcon aria-hidden="true" icon={category.icon} size={12} strokeWidth={1.8} />
            {category.label}
          </Badge>
          <Badge className={`h-5 shrink-0 gap-1 rounded-[6px] border-border/80 bg-background px-1.5 py-0 text-[11px] leading-none ${item.source === "ai" ? "border-success/20 text-success" : "text-muted-foreground"}`} variant="outline">
            <HugeiconsIcon
              aria-hidden="true"
              icon={item.source === "manual" ? UserEdit01Icon : GoogleGeminiIcon}
              size={12}
              strokeWidth={1.8}
            />
            {item.source === "manual" ? "手动创建" : "AI 提炼"}
          </Badge>
        </div>
        {canManage || hasEvidence ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button aria-label="记忆操作" className="size-7 rounded-[8px] p-0" size="icon" type="button" variant="ghost">
                <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasEvidence ? (
                <DropdownMenuItem onSelect={onShowEvidence}>
                  <HugeiconsIcon icon={ViewIcon} />
                  查看证据
                </DropdownMenuItem>
              ) : null}
              {hasEvidence && canManage ? <DropdownMenuSeparator /> : null}
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={onEdit}>
                    <HugeiconsIcon icon={Edit02Icon} />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                    <HugeiconsIcon icon={Delete02Icon} />
                    删除
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {item.expiresAt ? (
        <div className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-warning">
          <HugeiconsIcon aria-hidden="true" className="mt-0.5 shrink-0" icon={TimeHalfPassIcon} size={15} strokeWidth={1.8} />
          <span>{formatExpiryStatus(item.expiresAt)}</span>
        </div>
      ) : null}
      <p className="mt-3 break-words text-sm font-medium leading-6">{item.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>更新于 {formatUpdatedAt(item.updatedAt)}</span>
      </div>
    </div>
  );
}

function RunDetailDialog({ detail, loading, onLoadMore, onOpenChange, onOpenCustomer }: {
  detail?: AgentUserMemoryRunDetailResponse;
  loading: boolean;
  onLoadMore: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenCustomer: (customer: CustomerSelection) => void;
}) {
  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>运行详情</DialogTitle>
          <DialogDescription>{detail?.run.quotaDate} · 处理 {detail?.run.selectedCustomerCount ?? 0} 位客户</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table aria-label="客户处理明细" className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%]">客户</TableHead>
                <TableHead className="w-[10%] text-center">会话</TableHead>
                <TableHead className="w-[10%] text-center">消息</TableHead>
                <TableHead className="w-[50%]">记忆变更</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail?.items.length ? detail.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Button aria-label={`查看${item.customerName}记忆`} className="h-auto min-w-0 justify-start gap-2.5 p-0 text-left text-foreground hover:no-underline" onClick={() => onOpenCustomer(item)} variant="link">
                      <CustomerAvatar className="size-8" customer={item} />
                      <span className="min-w-0 truncate font-medium" title={item.customerName}>{item.customerName}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{item.sessionCount}</TableCell>
                  <TableCell className="text-center tabular-nums">{item.messageCount}</TableCell>
                  <TableCell>{runItemMemoryChangeLabel(item)}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4}><Empty /></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {detail?.nextItemCursor ? (
            <div className="mt-4 text-center">
              <Button variant="outline" disabled={loading} onClick={onLoadMore}>
                {loading ? <Spinner size={16} /> : null}
                加载更多
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerAvatar({ className, customer }: { className?: string; customer?: { avatarUrl?: string; customerName?: string } }) { return <Avatar className={className ?? "size-10"}><AvatarImage alt="" src={customer?.avatarUrl} /><AvatarFallback>{customer?.customerName?.trim().slice(0, 1) || undefined}</AvatarFallback></Avatar>; }
function formatUpdatedAt(timestamp?: number) {
  if (!timestamp) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
}
function formatExpiryStatus(expiresAt: number) {
  return `短期记忆：${expiresAt > Date.now() ? "将于" : "已于"} ${formatDate(expiresAt)} 到期`;
}
function formatTrendDate(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}
function Loading() { return <div className="flex min-h-32 items-center justify-center gap-2" role="status"><Spinner size={18} /><span className="text-sm text-muted-foreground">正在加载</span></div>; }
function Empty({ text = "暂无数据" }: { text?: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">加载失败</p><Button variant="outline" onClick={onRetry}>重试</Button></div>; }
type MemoryChangeStats = { memoryAddedCount?: number; memoryRemovedCount?: number; memoryUpdatedCount?: number };
type RecordedMemoryChangeStats = { memoryAddedCount: number; memoryRemovedCount: number; memoryUpdatedCount: number };

function hasMemoryChangeStats(value: MemoryChangeStats): value is MemoryChangeStats & RecordedMemoryChangeStats {
  return value.memoryAddedCount != null && value.memoryUpdatedCount != null && value.memoryRemovedCount != null;
}
function formatMemoryChanges(value: RecordedMemoryChangeStats) {
  const total = value.memoryAddedCount + value.memoryUpdatedCount + value.memoryRemovedCount;
  return total === 0 ? "无变化" : `新增 ${value.memoryAddedCount} · 更新 ${value.memoryUpdatedCount} · 删除 ${value.memoryRemovedCount}`;
}
function isRunInProgress(run: AgentUserMemoryRun) { return ["pending", "running", "waiting"].includes(run.status); }
function runMemoryChangeLabel(run: AgentUserMemoryRun) {
  if (hasMemoryChangeStats(run)) return formatMemoryChanges(run);
  return isRunInProgress(run) ? "处理中" : "暂无变更记录";
}
function runItemMemoryChangeLabel(item: AgentUserMemoryRunDetailResponse["items"][number]) {
  if (hasMemoryChangeStats(item)) return formatMemoryChanges(item);
  if (["prepared", "submitted"].includes(item.status)) return "处理中";
  return item.lastErrorCode ? "未更新" : "暂无变更记录";
}
