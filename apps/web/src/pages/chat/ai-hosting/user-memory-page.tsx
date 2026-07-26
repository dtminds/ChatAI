import type { AgentUserMemoryCategory, AgentUserMemoryCustomerDetailResponse, AgentUserMemoryItem, AgentUserMemoryOverviewResponse, AgentUserMemoryRun, AgentUserMemoryRunDetailResponse, AgentUserMemoryRunItemStatus } from "@chatai/contracts";
import { Delete02Icon, Edit02Icon, PlusSignIcon, RefreshIcon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { RequestNormalizedError } from "@/lib/request";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/auth-store";
import { canMaintainUserMemory, canManageAiHostingAgents } from "./agent-permissions";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, getUserMemoryEvidence, getUserMemoryOverview, getUserMemoryRun, listUserMemoryCustomers, listUserMemoryRuns, retryUserMemoryRun, updateUserMemoryItem, updateUserMemorySettings } from "./api/user-memory-service";
import { getUserMemoryCategoryLabel, UserMemoryEditorDialog } from "./user-memory-editor-dialog";

type Customer = Awaited<ReturnType<typeof listUserMemoryCustomers>>["items"][number];
type Evidence = Awaited<ReturnType<typeof getUserMemoryEvidence>>;
export function UserMemoryPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const canManage = canManageAiHostingAgents(role);
  const canMaintain = canMaintainUserMemory(role);
  const [overview, setOverview] = useState<AgentUserMemoryOverviewResponse>();
  const [runs, setRuns] = useState<AgentUserMemoryRun[]>([]);
  const [runNextCursor, setRunNextCursor] = useState<string>();
  const [runDetail, setRunDetail] = useState<AgentUserMemoryRunDetailResponse>();
  const [runItemStatus, setRunItemStatus] = useState<"all" | AgentUserMemoryRunItemStatus>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerNextCursor, setCustomerNextCursor] = useState<string>();
  const [appliedQuery, setAppliedQuery] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [selected, setSelected] = useState<Customer>();
  const [detail, setDetail] = useState<AgentUserMemoryCustomerDetailResponse>();
  const [detailError, setDetailError] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paging, setPaging] = useState(false);
  const activeCustomerKey = useRef<string | undefined>(undefined);
  const [editor, setEditor] = useState<{ item?: AgentUserMemoryItem }>();
  const [deleting, setDeleting] = useState<AgentUserMemoryItem>();
  const [evidence, setEvidence] = useState<Evidence>();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextOverview, nextRuns, nextCustomers] = await Promise.all([
        getUserMemoryOverview(), listUserMemoryRuns({ pageSize: 20 }), listUserMemoryCustomers({ pageSize: 20, query: appliedQuery || undefined }),
      ]);
      setOverview(nextOverview); setRuns(nextRuns.items); setRunNextCursor(nextRuns.nextCursor); setCustomers(nextCustomers.items); setCustomerNextCursor(nextCustomers.nextCursor);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [appliedQuery, searchRevision]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!overview?.activeRun) return;
    const timer = window.setInterval(() => void Promise.all([getUserMemoryOverview(), listUserMemoryRuns({ pageSize: 20 })])
      .then(([nextOverview, nextRuns]) => { setOverview(nextOverview); setRuns(nextRuns.items); setRunNextCursor(nextRuns.nextCursor); })
      .catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [overview?.activeRun?.id]);

  async function chooseCustomer(customer: Customer) {
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
  function searchCustomers() {
    const nextQuery = query.trim();
    activeCustomerKey.current = undefined;
    setSelected(undefined); setDetail(undefined); setDetailError(false);
    if (nextQuery === appliedQuery) setSearchRevision((value) => value + 1);
    else setAppliedQuery(nextQuery);
  }
  async function reloadSelectedCustomer() {
    if (!selected) return;
    const next = await getUserMemoryCustomer(selected.thirdExternalUserId);
    setDetail(next); setDetailError(false);
  }
  async function handleVersionConflict(error: unknown, fallback: string) {
    if (error instanceof RequestNormalizedError && error.code === "AGENT_USER_MEMORY_VERSION_CONFLICT") {
      try { await reloadSelectedCustomer(); } catch { setDetailError(true); toast.error("记忆已更新，但最新数据加载失败"); return; }
      toast.error("记忆已更新，请基于最新版本重试");
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
  async function retry(runId: number) {
    setSaving(true);
    try {
      const result = await retryUserMemoryRun(runId);
      toast.success(result.resetCount > 0 ? "已重新提交失败项" : "失败项已被更晚运行覆盖");
      await load();
    }
    catch { toast.error("重试失败"); }
    finally { setSaving(false); }
  }
  async function saveMemory(input: { category: AgentUserMemoryCategory; content: string; expiresAt: number | null }) {
    if (!selected || !detail) return;
    setSaving(true);
    try {
      const next = editor?.item
        ? await updateUserMemoryItem(selected.thirdExternalUserId, editor.item.id, { ...input, expectedVersion: detail.version })
        : await createUserMemoryItem(selected.thirdExternalUserId, { ...input, expectedVersion: detail.version });
      setDetail(next); setEditor(undefined); toast.success("已保存"); await load();
    } catch (error) { await handleVersionConflict(error, "保存失败"); }
    finally { setSaving(false); }
  }
  async function removeMemory() {
    if (!selected || !detail || !deleting) return;
    setSaving(true);
    try { setDetail(await deleteUserMemoryItem(selected.thirdExternalUserId, deleting.id, { expectedVersion: detail.version })); setDeleting(undefined); toast.success("已删除"); await load(); }
    catch (error) { await handleVersionConflict(error, "删除失败"); }
    finally { setSaving(false); }
  }
  async function showEvidence(item: AgentUserMemoryItem) {
    if (!selected || item.source !== "ai") return;
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
  async function loadMoreCustomers() {
    if (!customerNextCursor || paging) return;
    setPaging(true);
    try { const page = await listUserMemoryCustomers({ cursor: customerNextCursor, pageSize: 20, query: appliedQuery || undefined }); setCustomers((current) => [...current, ...page.items]); setCustomerNextCursor(page.nextCursor); }
    catch { toast.error("加载失败"); }
    finally { setPaging(false); }
  }
  async function showRunDetail(runId: number) {
    setRunItemStatus("all");
    try { setRunDetail(await getUserMemoryRun(runId, { itemPageSize: 100 })); }
    catch { toast.error("运行详情加载失败"); }
  }
  async function filterRunItems(status: "all" | AgentUserMemoryRunItemStatus) {
    if (!runDetail || paging) return;
    setRunItemStatus(status); setPaging(true);
    try { setRunDetail(await getUserMemoryRun(runDetail.run.id, { itemPageSize: 100, ...(status === "all" ? {} : { status }) })); }
    catch { toast.error("运行详情加载失败"); }
    finally { setPaging(false); }
  }
  async function loadMoreRunItems() {
    if (!runDetail?.nextItemCursor || paging) return;
    const currentRunId = runDetail.run.id;
    setPaging(true);
    try {
      const page = await getUserMemoryRun(currentRunId, { itemCursor: runDetail.nextItemCursor, itemPageSize: 100, ...(runItemStatus === "all" ? {} : { status: runItemStatus }) });
      setRunDetail((current) => current?.run.id === currentRunId ? { ...page, items: [...current.items, ...page.items] } : current);
    } catch { toast.error("运行详情加载失败"); }
    finally { setPaging(false); }
  }

  return <AiHostingLayout title="用户记忆">
    <div className="space-y-6">
      <AiHostingPageHeader title="用户记忆" description="由 AI 按日提炼客户长期背景，人工维护拥有最终优先级" />
      <Tabs defaultValue="overview">
        <TabsList variant="underline"><TabsTrigger value="overview" variant="underline">概览</TabsTrigger><TabsTrigger value="customers" variant="underline">记忆明细</TabsTrigger></TabsList>
        <TabsContent className="pt-5" value="overview">
          {loading ? <Loading /> : error || !overview ? <LoadError onRetry={load} /> : <Overview overview={overview} runs={runs} canManage={canManage} saving={saving} hasMore={Boolean(runNextCursor)} onToggle={toggleEnabled} onRetryRun={retry} onLoadMore={() => void loadMoreRuns()} onShowDetail={(id) => void showRunDetail(id)} />}
        </TabsContent>
        <TabsContent className="pt-5" value="customers">
          <MemoryCustomerList
            appliedQuery={appliedQuery}
            customers={customers}
            error={error}
            hasMore={Boolean(customerNextCursor)}
            loading={loading}
            paging={paging}
            query={query}
            onLoadMore={() => void loadMoreCustomers()}
            onOpenCustomer={(customer) => void chooseCustomer(customer)}
            onQueryChange={setQuery}
            onRetry={load}
            onSearch={searchCustomers}
          />
        </TabsContent>
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
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(undefined); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>删除记忆</AlertDialogTitle><AlertDialogDescription>删除后将立即从客户当前记忆中移除</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>取消</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void removeMemory(); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => { if (!open) setEvidence(undefined); }}><DialogContent><DialogHeader><DialogTitle>来源证据</DialogTitle><DialogDescription>AI 提炼时引用的客户消息</DialogDescription></DialogHeader><div className="space-y-2">{evidence?.messages.map((message) => <div className="rounded-lg bg-surface-muted p-3 text-sm" key={message.messageId}>{message.content}</div>)}</div></DialogContent></Dialog>
    <Dialog open={Boolean(runDetail)} onOpenChange={(open) => { if (!open) setRunDetail(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>运行详情</DialogTitle><DialogDescription>{runDetail?.run.quotaDate} · {runDetail ? statusLabel(runDetail.run.status) : ""}</DialogDescription></DialogHeader><Select value={runItemStatus} onValueChange={(value) => void filterRunItems(value as "all" | AgentUserMemoryRunItemStatus)}><SelectTrigger aria-label="运行项状态" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="succeeded">成功</SelectItem><SelectItem value="failed">失败</SelectItem><SelectItem value="skipped">已跳过</SelectItem><SelectItem value="prepared">待处理</SelectItem><SelectItem value="submitted">已提交</SelectItem><SelectItem value="canceled">已取消</SelectItem></SelectContent></Select><div className="max-h-[60vh] overflow-auto"><Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>状态</TableHead><TableHead>会话</TableHead><TableHead>消息</TableHead><TableHead>错误</TableHead></TableRow></TableHeader><TableBody>{runDetail?.items.map((item) => <TableRow key={item.id}><TableCell>{item.thirdExternalUserId}</TableCell><TableCell>{statusLabel(item.status)}</TableCell><TableCell>{item.sessionCount}</TableCell><TableCell>{item.messageCount}</TableCell><TableCell>{item.lastErrorCode ?? "-"}</TableCell></TableRow>)}</TableBody></Table>{runDetail?.nextItemCursor ? <div className="mt-4 text-center"><Button variant="outline" disabled={paging} onClick={() => void loadMoreRunItems()}>{paging ? <Spinner size={16} /> : null}加载更多</Button></div> : null}</div></DialogContent></Dialog>
  </AiHostingLayout>;
}

function Overview({ overview, runs, canManage, saving, hasMore, onToggle, onRetryRun, onLoadMore, onShowDetail }: { overview: AgentUserMemoryOverviewResponse; runs: AgentUserMemoryRun[]; canManage: boolean; saving: boolean; hasMore: boolean; onToggle: (enabled: boolean) => void; onRetryRun: (id: number) => void; onLoadMore: () => void; onShowDetail: (id: number) => void }) {
  return <div className="space-y-5">
    <section className="flex items-center justify-between gap-5 rounded-xl border bg-card p-5"><div><div className="font-medium">自动维护</div><p className="mt-1 text-sm text-muted-foreground">每天 {overview.schedule}（{overview.timezone}）处理前一自然日，客户额度 {overview.customerLimit}</p></div><Switch aria-label="自动维护" checked={overview.enabled} disabled={!canManage || saving} onCheckedChange={onToggle} /></section>
    <section className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-3"><Metric label="当前状态" value={overview.activeRun ? statusLabel(overview.activeRun.status) : overview.enabled ? "等待调度" : "已关闭"} /><Metric label="最近选中客户" value={String(overview.recentRun?.selectedCustomerCount ?? 0)} /><Metric label="最近模型 Token" value={String((overview.recentRun?.inputTokens ?? 0) + (overview.recentRun?.outputTokens ?? 0))} /></section>
    <section className="rounded-xl border bg-card"><div className="flex items-start justify-between gap-4 p-5"><div><h3 className="text-base font-semibold">维护趋势</h3><p className="mt-1 text-sm text-muted-foreground">按目标自然日统计客户维护结果</p></div><div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground"><TrendLegend color="bg-primary" label="成功" /><TrendLegend color="bg-destructive" label="失败" /><TrendLegend color="bg-muted-foreground" label="跳过" /></div></div><div className="px-5 pb-5"><RunTrendChart runs={runs} /></div></section>
    <section className="rounded-xl border bg-card"><div className="p-5 pb-3"><h3 className="text-base font-semibold">每日任务</h3></div><div className="px-5 pb-5"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>目标日期</TableHead><TableHead>状态</TableHead><TableHead>候选会话</TableHead><TableHead>选中客户</TableHead><TableHead>结果</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{runs.length === 0 ? <TableRow><TableCell colSpan={6}><Empty /></TableCell></TableRow> : runs.map((run) => <TableRow key={run.id}><TableCell className="font-medium">{run.quotaDate}</TableCell><TableCell><Badge variant="outline">{statusLabel(run.status)}</Badge></TableCell><TableCell>{run.candidateSessionCount} / {run.candidateSessionLimit}</TableCell><TableCell>{run.selectedCustomerCount} / {run.customerLimit}</TableCell><TableCell>{run.successCount} 成功 · {run.failureCount} 失败 · {run.skippedCount} 跳过</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => onShowDetail(run.id)}>详情</Button>{canManage && (run.status === "partial" || run.status === "failed") ? <Button size="sm" variant="outline" disabled={saving} onClick={() => onRetryRun(run.id)}><HugeiconsIcon icon={RefreshIcon} size={15} />重试失败项</Button> : null}</div></TableCell></TableRow>)}</TableBody></Table></div>{hasMore ? <div className="mt-4 text-center"><Button variant="outline" disabled={saving} onClick={onLoadMore}>加载更多</Button></div> : null}</div></section>
  </div>;
}

function RunTrendChart({ runs }: { runs: AgentUserMemoryRun[] }) {
  const points = [...runs].sort((left, right) => left.quotaDate.localeCompare(right.quotaDate)).map((run) => ({ date: run.quotaDate, failure: run.failureCount, skipped: run.skippedCount, success: run.successCount }));
  if (points.length === 0) return <Empty text="暂无趋势数据" />;
  return <div className="h-64 min-w-0"><ResponsiveContainer height="100%" width="100%"><AreaChart data={points} margin={{ bottom: 0, left: -18, right: 14, top: 8 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.45} vertical={false} /><XAxis axisLine={false} dataKey="date" dy={10} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={formatTrendDate} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} width={42} /><Tooltip labelFormatter={(label) => String(label)} /><Area dataKey="success" fill="var(--primary)" fillOpacity={0.12} name="成功" stroke="var(--primary)" strokeWidth={2.2} type="monotone" /><Area dataKey="failure" fill="var(--destructive)" fillOpacity={0.08} name="失败" stroke="var(--destructive)" strokeWidth={2} type="monotone" /><Area dataKey="skipped" fill="var(--muted-foreground)" fillOpacity={0.06} name="跳过" stroke="var(--muted-foreground)" strokeWidth={1.8} type="monotone" /></AreaChart></ResponsiveContainer></div>;
}

function TrendLegend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${color}`} />{label}</span>; }

function MemoryCustomerList({ appliedQuery, customers, error, hasMore, loading, paging, query, onLoadMore, onOpenCustomer, onQueryChange, onRetry, onSearch }: { appliedQuery: string; customers: Customer[]; error: boolean; hasMore: boolean; loading: boolean; paging: boolean; query: string; onLoadMore: () => void; onOpenCustomer: (customer: Customer) => void; onQueryChange: (value: string) => void; onRetry: () => void; onSearch: () => void }) {
  const visibleCustomers = [...customers]
    .filter((customer) => Boolean(appliedQuery) || customer.memoryCount > 0)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || right.version - left.version);
  return <section className="rounded-xl border bg-card"><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-semibold">客户记忆</h3><p className="mt-1 text-sm text-muted-foreground">按最近更新时间查看客户当前记忆</p></div><div className="flex w-full gap-2 sm:max-w-md"><Input aria-label="搜索客户" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索客户" onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} /><Button variant="outline" onClick={onSearch}><HugeiconsIcon icon={Search01Icon} size={16} />搜索</Button></div></div><div className="px-5 pb-5">{loading ? <Loading /> : error ? <LoadError onRetry={onRetry} /> : visibleCustomers.length === 0 ? <Empty text={appliedQuery ? "暂无匹配客户" : "暂无客户记忆"} /> : <><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>记忆概览</TableHead><TableHead>最近更新</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{visibleCustomers.map((customer) => <TableRow key={`${customer.platform}:${customer.thirdExternalUserId}`}><TableCell><button className="flex min-w-0 items-center gap-3 text-left" onClick={() => onOpenCustomer(customer)}><CustomerAvatar customer={customer} /><span className="min-w-0"><span className="block max-w-56 truncate font-medium">{customer.customerName}</span><span className="block max-w-56 truncate text-xs text-muted-foreground">{customer.thirdExternalUserId}</span></span></button></TableCell><TableCell><div className="flex items-center gap-2"><Badge variant="outline">{customer.memoryCount} 条</Badge><span className="text-xs text-muted-foreground">版本 {customer.version}</span></div></TableCell><TableCell><span className="text-sm">{formatUpdatedAt(customer.updatedAt)}</span>{customer.lastAutoUpdatedAt ? <span className="mt-1 block text-xs text-muted-foreground">自动维护 {formatUpdatedAt(customer.lastAutoUpdatedAt)}</span> : null}</TableCell><TableCell className="text-right"><Button aria-label={`查看${customer.customerName}记忆`} size="icon" variant="ghost" onClick={() => onOpenCustomer(customer)}><HugeiconsIcon icon={ViewIcon} size={16} /></Button></TableCell></TableRow>)}</TableBody></Table></div>{hasMore ? <div className="mt-4 text-center"><Button variant="outline" disabled={paging} onClick={onLoadMore}>{paging ? <Spinner size={16} /> : null}加载更多</Button></div> : null}</>}</div></section>;
}

function CustomerDetailSheet({ canManage, customer, detail, error, open, onAdd, onDelete, onEdit, onOpenChange, onRetry, onShowEvidence }: { canManage: boolean; customer?: Customer; detail?: AgentUserMemoryCustomerDetailResponse; error: boolean; open: boolean; onAdd: () => void; onDelete: (item: AgentUserMemoryItem) => void; onEdit: (item: AgentUserMemoryItem) => void; onOpenChange: (open: boolean) => void; onRetry: () => void; onShowEvidence: (item: AgentUserMemoryItem) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-hidden p-0 sm:max-w-[680px]"><SheetHeader className="border-b pr-14"><div className="flex items-center gap-3"><CustomerAvatar customer={customer} /><div className="min-w-0"><SheetTitle className="truncate">{customer?.customerName ?? "客户记忆"}</SheetTitle><SheetDescription>{detail ? `${detail.items.length} 条记忆 · 版本 ${detail.version}` : "客户记忆明细"}</SheetDescription></div></div></SheetHeader><div className="flex items-center justify-between border-b px-6 py-3"><span className="text-sm text-muted-foreground">最近更新 {formatUpdatedAt(customer?.updatedAt)}</span>{canManage && detail ? <Button size="sm" onClick={onAdd}><HugeiconsIcon icon={PlusSignIcon} size={16} />新增记忆</Button> : null}</div><ScrollArea className="min-h-0 flex-1"><div className="p-6">{error ? <LoadError onRetry={onRetry} /> : !detail ? <Loading /> : detail.items.length === 0 ? <Empty /> : <div className="space-y-3">{detail.items.map((item) => <div className="rounded-lg border border-border p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge>{getUserMemoryCategoryLabel(item.category)}</Badge><Badge variant="outline">{item.source === "manual" ? "人工" : "AI 提炼"}</Badge>{item.expiresAt ? <span className="text-xs text-muted-foreground">有效至 {formatUpdatedAt(item.expiresAt)}</span> : null}</div><p className="text-sm leading-6">{item.content}</p><p className="mt-2 text-xs text-muted-foreground">更新于 {formatUpdatedAt(item.updatedAt)}</p></div><div className="flex shrink-0 gap-1">{item.source === "ai" ? <Button aria-label="查看证据" size="icon" variant="ghost" onClick={() => onShowEvidence(item)}><HugeiconsIcon icon={ViewIcon} size={16} /></Button> : null}{canManage ? <><Button aria-label="编辑记忆" size="icon" variant="ghost" onClick={() => onEdit(item)}><HugeiconsIcon icon={Edit02Icon} size={16} /></Button><Button aria-label="删除记忆" size="icon" variant="ghost" onClick={() => onDelete(item)}><HugeiconsIcon icon={Delete02Icon} size={16} /></Button></> : null}</div></div></div>)}</div>}</div></ScrollArea></SheetContent></Sheet>;
}

function CustomerAvatar({ customer }: { customer?: Customer }) { return <Avatar className="size-10"><AvatarImage alt="" src={customer?.avatarUrl} /><AvatarFallback>{customer?.customerName?.trim().slice(0, 1) || undefined}</AvatarFallback></Avatar>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function formatUpdatedAt(timestamp?: number) {
  if (!timestamp) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
function formatTrendDate(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}
function Loading() { return <div className="flex min-h-32 items-center justify-center gap-2" role="status"><Spinner size={18} /><span className="text-sm text-muted-foreground">正在加载</span></div>; }
function Empty({ text = "暂无数据" }: { text?: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">加载失败</p><Button variant="outline" onClick={onRetry}>重试</Button></div>; }
function statusLabel(value: string) { return ({ pending: "等待中", running: "运行中", waiting: "等待结果", succeeded: "成功", partial: "部分成功", failed: "失败", canceled: "已取消", prepared: "待处理", submitted: "已提交", skipped: "已跳过" } as Record<string, string>)[value] ?? value; }
