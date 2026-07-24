import type { AgentUserMemoryCategory, AgentUserMemoryCustomerDetailResponse, AgentUserMemoryItem, AgentUserMemoryOverviewResponse, AgentUserMemoryRun, AgentUserMemoryRunDetailResponse, AgentUserMemoryRunItemStatus } from "@chatai/contracts";
import { Delete02Icon, Edit02Icon, PlusSignIcon, RefreshIcon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RequestNormalizedError } from "@/lib/request";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/auth-store";
import { canManageAiHostingAgents } from "./agent-permissions";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, getUserMemoryEvidence, getUserMemoryOverview, getUserMemoryRun, listUserMemoryCustomers, listUserMemoryRuns, retryUserMemoryRun, updateUserMemoryItem, updateUserMemorySettings } from "./api/user-memory-service";

type Customer = Awaited<ReturnType<typeof listUserMemoryCustomers>>["items"][number];
type Evidence = Awaited<ReturnType<typeof getUserMemoryEvidence>>;
const categories: Array<{ value: AgentUserMemoryCategory; label: string }> = [
  { value: "profile", label: "客户背景" }, { value: "preference", label: "偏好" },
  { value: "communication", label: "沟通方式" }, { value: "product_context", label: "商品背景" },
  { value: "recent_context", label: "近期上下文" }, { value: "manual_note", label: "人工备注" },
];

export function UserMemoryPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const canManage = canManageAiHostingAgents(role);
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
      const next = await getUserMemoryCustomer(customer.platform, customer.thirdExternalUserId);
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
    const next = await getUserMemoryCustomer(selected.platform, selected.thirdExternalUserId);
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
        ? await updateUserMemoryItem(selected.platform, selected.thirdExternalUserId, editor.item.id, { ...input, expectedVersion: detail.version })
        : await createUserMemoryItem(selected.platform, selected.thirdExternalUserId, { ...input, expectedVersion: detail.version });
      setDetail(next); setEditor(undefined); toast.success("已保存"); await load();
    } catch (error) { await handleVersionConflict(error, "保存失败"); }
    finally { setSaving(false); }
  }
  async function removeMemory() {
    if (!selected || !detail || !deleting) return;
    setSaving(true);
    try { setDetail(await deleteUserMemoryItem(selected.platform, selected.thirdExternalUserId, deleting.id, { expectedVersion: detail.version })); setDeleting(undefined); toast.success("已删除"); await load(); }
    catch (error) { await handleVersionConflict(error, "删除失败"); }
    finally { setSaving(false); }
  }
  async function showEvidence(item: AgentUserMemoryItem) {
    if (!selected || item.source !== "ai") return;
    try { setEvidence(await getUserMemoryEvidence(selected.platform, selected.thirdExternalUserId, item.id)); }
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
        <TabsList variant="underline"><TabsTrigger value="overview" variant="underline">运行概览</TabsTrigger><TabsTrigger value="customers" variant="underline">记忆管理</TabsTrigger></TabsList>
        <TabsContent className="pt-5" value="overview">
          {loading ? <Loading /> : error || !overview ? <LoadError onRetry={load} /> : <Overview overview={overview} runs={runs} canManage={canManage} saving={saving} hasMore={Boolean(runNextCursor)} onToggle={toggleEnabled} onRetryRun={retry} onLoadMore={() => void loadMoreRuns()} onShowDetail={(id) => void showRunDetail(id)} />}
        </TabsContent>
        <TabsContent className="pt-5" value="customers">
          <div className="mb-4 flex max-w-md gap-2"><Input aria-label="搜索客户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索客户" onKeyDown={(event) => { if (event.key === "Enter") searchCustomers(); }} /><Button variant="outline" onClick={searchCustomers}><HugeiconsIcon icon={Search01Icon} size={16} />搜索</Button></div>
          <div className="grid min-h-[520px] grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)] gap-5 max-lg:grid-cols-1">
            <Card className="rounded-xl"><CardHeader><CardTitle>客户</CardTitle></CardHeader><CardContent className="space-y-2">
              {loading ? <Loading /> : error ? <LoadError onRetry={load} /> : customers.length === 0 ? <Empty /> : <>{customers.map((customer) => <button className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-3 text-left hover:bg-accent" key={`${customer.platform}:${customer.thirdExternalUserId}`} onClick={() => void chooseCustomer(customer)}><span className="min-w-0"><span className="block truncate text-sm font-medium">{customer.customerName}</span><span className="text-xs text-muted-foreground">{customer.memoryCount} / 20</span></span><Badge variant="outline">v{customer.version}</Badge></button>)}{customerNextCursor ? <Button className="w-full" variant="outline" disabled={paging} onClick={() => void loadMoreCustomers()}>{paging ? <Spinner size={16} /> : null}加载更多</Button> : null}</>}
            </CardContent></Card>
            <Card className="rounded-xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{selected?.customerName ?? "选择客户"}</CardTitle>{detail ? <p className="mt-1 text-xs text-muted-foreground">版本 {detail.version}</p> : null}</div>{canManage && detail ? <Button size="sm" onClick={() => setEditor({})}><HugeiconsIcon icon={PlusSignIcon} size={16} />新增记忆</Button> : null}</CardHeader><CardContent>
              {!selected ? <Empty text="请选择客户" /> : detailError ? <LoadError onRetry={() => void chooseCustomer(selected)} /> : !detail ? <Loading /> : detail.items.length === 0 ? <Empty /> : <div className="space-y-3">{detail.items.map((item) => <div className="rounded-lg border border-border p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><Badge>{categoryLabel(item.category)}</Badge><Badge variant="outline">{item.source === "manual" ? "人工" : "AI 提炼"}</Badge></div><p className="text-sm leading-6">{item.content}</p></div><div className="flex shrink-0 gap-1">{item.source === "ai" ? <Button aria-label="查看证据" size="icon" variant="ghost" onClick={() => void showEvidence(item)}><HugeiconsIcon icon={ViewIcon} size={16} /></Button> : null}{canManage ? <><Button aria-label="编辑记忆" size="icon" variant="ghost" onClick={() => setEditor({ item })}><HugeiconsIcon icon={Edit02Icon} size={16} /></Button><Button aria-label="删除记忆" size="icon" variant="ghost" onClick={() => setDeleting(item)}><HugeiconsIcon icon={Delete02Icon} size={16} /></Button></> : null}</div></div></div>)}</div>}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    <MemoryEditor open={Boolean(editor)} item={editor?.item} saving={saving} onOpenChange={(open) => { if (!open && !saving) setEditor(undefined); }} onSave={saveMemory} />
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(undefined); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>删除记忆</AlertDialogTitle><AlertDialogDescription>删除后将立即从客户当前记忆中移除</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>取消</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void removeMemory(); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => { if (!open) setEvidence(undefined); }}><DialogContent><DialogHeader><DialogTitle>来源证据</DialogTitle><DialogDescription>AI 提炼时引用的客户消息</DialogDescription></DialogHeader><div className="space-y-2">{evidence?.messages.map((message) => <div className="rounded-lg bg-surface-muted p-3 text-sm" key={message.messageId}>{message.content}</div>)}</div></DialogContent></Dialog>
    <Dialog open={Boolean(runDetail)} onOpenChange={(open) => { if (!open) setRunDetail(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>运行详情</DialogTitle><DialogDescription>{runDetail?.run.quotaDate} · {runDetail ? statusLabel(runDetail.run.status) : ""}</DialogDescription></DialogHeader><Select value={runItemStatus} onValueChange={(value) => void filterRunItems(value as "all" | AgentUserMemoryRunItemStatus)}><SelectTrigger aria-label="运行项状态" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="succeeded">成功</SelectItem><SelectItem value="failed">失败</SelectItem><SelectItem value="skipped">已跳过</SelectItem><SelectItem value="prepared">待处理</SelectItem><SelectItem value="submitted">已提交</SelectItem><SelectItem value="canceled">已取消</SelectItem></SelectContent></Select><div className="max-h-[60vh] overflow-auto"><Table><TableHeader><TableRow><TableHead>客户</TableHead><TableHead>状态</TableHead><TableHead>会话</TableHead><TableHead>消息</TableHead><TableHead>错误</TableHead></TableRow></TableHeader><TableBody>{runDetail?.items.map((item) => <TableRow key={item.id}><TableCell>{item.thirdExternalUserId}</TableCell><TableCell>{statusLabel(item.status)}</TableCell><TableCell>{item.sessionCount}</TableCell><TableCell>{item.messageCount}</TableCell><TableCell>{item.lastErrorCode ?? "-"}</TableCell></TableRow>)}</TableBody></Table>{runDetail?.nextItemCursor ? <div className="mt-4 text-center"><Button variant="outline" disabled={paging} onClick={() => void loadMoreRunItems()}>{paging ? <Spinner size={16} /> : null}加载更多</Button></div> : null}</div></DialogContent></Dialog>
  </AiHostingLayout>;
}

function Overview({ overview, runs, canManage, saving, hasMore, onToggle, onRetryRun, onLoadMore, onShowDetail }: { overview: AgentUserMemoryOverviewResponse; runs: AgentUserMemoryRun[]; canManage: boolean; saving: boolean; hasMore: boolean; onToggle: (enabled: boolean) => void; onRetryRun: (id: number) => void; onLoadMore: () => void; onShowDetail: (id: number) => void }) {
  return <div className="space-y-5"><Card className="rounded-xl"><CardContent className="flex items-center justify-between gap-5 pt-6"><div><div className="font-medium">自动维护</div><p className="mt-1 text-sm text-muted-foreground">每天 {overview.schedule}（{overview.timezone}）处理前一自然日，客户额度 {overview.customerLimit}</p></div><Switch aria-label="自动维护" checked={overview.enabled} disabled={!canManage || saving} onCheckedChange={onToggle} /></CardContent></Card>
    <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1"><Metric label="当前状态" value={overview.activeRun ? statusLabel(overview.activeRun.status) : overview.enabled ? "等待调度" : "已关闭"} /><Metric label="最近选中客户" value={String(overview.recentRun?.selectedCustomerCount ?? 0)} /><Metric label="最近模型 Token" value={String((overview.recentRun?.inputTokens ?? 0) + (overview.recentRun?.outputTokens ?? 0))} /></div>
    <Card className="rounded-xl"><CardHeader><CardTitle>运行记录</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>目标日期</TableHead><TableHead>状态</TableHead><TableHead>候选会话</TableHead><TableHead>选中客户</TableHead><TableHead>结果</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{runs.length === 0 ? <TableRow><TableCell colSpan={6}><Empty /></TableCell></TableRow> : runs.map((run) => <TableRow key={run.id}><TableCell>{run.quotaDate}</TableCell><TableCell><Badge variant="outline">{statusLabel(run.status)}</Badge></TableCell><TableCell>{run.candidateSessionCount} / {run.candidateSessionLimit}</TableCell><TableCell>{run.selectedCustomerCount} / {run.customerLimit}</TableCell><TableCell>{run.successCount} 成功 · {run.failureCount} 失败 · {run.skippedCount} 跳过</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => onShowDetail(run.id)}>详情</Button>{canManage && (run.status === "partial" || run.status === "failed") ? <Button size="sm" variant="outline" disabled={saving} onClick={() => onRetryRun(run.id)}><HugeiconsIcon icon={RefreshIcon} size={15} />重试失败项</Button> : null}</div></TableCell></TableRow>)}</TableBody></Table>{hasMore ? <div className="mt-4 text-center"><Button variant="outline" disabled={saving} onClick={onLoadMore}>加载更多</Button></div> : null}</CardContent></Card></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card className="rounded-xl"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
function MemoryEditor({ open, item, saving, onOpenChange, onSave }: { open: boolean; item?: AgentUserMemoryItem; saving: boolean; onOpenChange: (open: boolean) => void; onSave: (input: { category: AgentUserMemoryCategory; content: string; expiresAt: number | null }) => void }) {
  const [category, setCategory] = useState<AgentUserMemoryCategory>("profile"); const [content, setContent] = useState(""); const [expiresAt, setExpiresAt] = useState("");
  useEffect(() => { if (open) { setCategory(item?.category ?? "profile"); setContent(item?.content ?? ""); setExpiresAt(item?.expiresAt ? formatLocalDateTime(item.expiresAt) : ""); } }, [open, item]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent closeButtonDisabled={saving}><DialogHeader><DialogTitle>{item ? "编辑记忆" : "新增记忆"}</DialogTitle><DialogDescription>人工维护会覆盖旧自动结果的写入边界</DialogDescription></DialogHeader><div className="space-y-4"><Select value={category} onValueChange={(value) => setCategory(value as AgentUserMemoryCategory)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select><Textarea aria-label="记忆内容" maxLength={200} value={content} onChange={(event) => setContent(event.target.value)} placeholder="输入对未来服务有帮助的长期信息" />{category === "recent_context" ? <Input aria-label="过期时间" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /> : null}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving || !content.trim() || (category === "recent_context" && !expiresAt)} onClick={() => onSave({ category, content: content.trim(), expiresAt: expiresAt ? new Date(expiresAt).getTime() : null })}>{saving ? <Spinner size={16} /> : null}保存</Button></DialogFooter></DialogContent></Dialog>;
}
function formatLocalDateTime(timestamp: number) {
  const value = new Date(timestamp);
  const local = new Date(timestamp - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function Loading() { return <div className="flex min-h-32 items-center justify-center gap-2" role="status"><Spinner size={18} /><span className="text-sm text-muted-foreground">正在加载</span></div>; }
function Empty({ text = "暂无数据" }: { text?: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">加载失败</p><Button variant="outline" onClick={onRetry}>重试</Button></div>; }
function categoryLabel(value: AgentUserMemoryCategory) { return categories.find((item) => item.value === value)?.label ?? value; }
function statusLabel(value: string) { return ({ pending: "等待中", running: "运行中", waiting: "等待结果", succeeded: "成功", partial: "部分成功", failed: "失败", canceled: "已取消", prepared: "待处理", submitted: "已提交", skipped: "已跳过" } as Record<string, string>)[value] ?? value; }
