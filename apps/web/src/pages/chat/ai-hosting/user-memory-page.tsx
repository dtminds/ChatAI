import type { AgentUserMemoryCategory, AgentUserMemoryCustomerDetailResponse, AgentUserMemoryItem, AgentUserMemoryOverviewResponse, AgentUserMemoryRun } from "@chatai/contracts";
import { Delete02Icon, Edit02Icon, PlusSignIcon, RefreshIcon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { createUserMemoryItem, deleteUserMemoryItem, getUserMemoryCustomer, getUserMemoryEvidence, getUserMemoryOverview, listUserMemoryCustomers, listUserMemoryRuns, retryUserMemoryRun, updateUserMemoryItem, updateUserMemorySettings } from "./api/user-memory-service";

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer>();
  const [detail, setDetail] = useState<AgentUserMemoryCustomerDetailResponse>();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ item?: AgentUserMemoryItem }>();
  const [deleting, setDeleting] = useState<AgentUserMemoryItem>();
  const [evidence, setEvidence] = useState<Evidence>();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextOverview, nextRuns, nextCustomers] = await Promise.all([
        getUserMemoryOverview(), listUserMemoryRuns({ pageSize: 20 }), listUserMemoryCustomers({ pageSize: 20, query: query.trim() || undefined }),
      ]);
      setOverview(nextOverview); setRuns(nextRuns.items); setCustomers(nextCustomers.items);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!overview?.activeRun) return;
    const timer = window.setInterval(() => void getUserMemoryOverview().then(setOverview).catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [overview?.activeRun?.id]);

  async function chooseCustomer(customer: Customer) {
    setSelected(customer); setDetail(undefined);
    try { setDetail(await getUserMemoryCustomer(customer.platform, customer.thirdExternalUserId)); }
    catch { toast.error("加载失败"); }
  }
  async function toggleEnabled(enabled: boolean) {
    setSaving(true);
    try { setOverview(await updateUserMemorySettings({ enabled })); toast.success(enabled ? "已开启" : "已关闭"); }
    catch { toast.error("操作失败"); }
    finally { setSaving(false); }
  }
  async function retry(runId: number) {
    setSaving(true);
    try { await retryUserMemoryRun(runId); toast.success("已重新提交失败项"); await load(); }
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
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  }
  async function removeMemory() {
    if (!selected || !detail || !deleting) return;
    setSaving(true);
    try { setDetail(await deleteUserMemoryItem(selected.platform, selected.thirdExternalUserId, deleting.id, { expectedVersion: detail.version })); setDeleting(undefined); toast.success("已删除"); await load(); }
    catch { toast.error("删除失败"); }
    finally { setSaving(false); }
  }
  async function showEvidence(item: AgentUserMemoryItem) {
    if (!selected || item.source !== "ai") return;
    try { setEvidence(await getUserMemoryEvidence(selected.platform, selected.thirdExternalUserId, item.id)); }
    catch { toast.error("证据加载失败"); }
  }

  return <AiHostingLayout title="用户记忆">
    <div className="space-y-6">
      <AiHostingPageHeader title="用户记忆" description="由 AI 按日提炼客户长期背景，人工维护拥有最终优先级" />
      <Tabs defaultValue="overview">
        <TabsList variant="underline"><TabsTrigger value="overview" variant="underline">运行概览</TabsTrigger><TabsTrigger value="customers" variant="underline">记忆管理</TabsTrigger></TabsList>
        <TabsContent className="pt-5" value="overview">
          {loading ? <Loading /> : error || !overview ? <LoadError onRetry={load} /> : <Overview overview={overview} runs={runs} canManage={canManage} saving={saving} onToggle={toggleEnabled} onRetryRun={retry} />}
        </TabsContent>
        <TabsContent className="pt-5" value="customers">
          <div className="mb-4 flex max-w-md gap-2"><Input aria-label="搜索客户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索客户" onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /><Button variant="outline" onClick={() => void load()}><HugeiconsIcon icon={Search01Icon} size={16} />搜索</Button></div>
          <div className="grid min-h-[520px] grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)] gap-5 max-lg:grid-cols-1">
            <Card className="rounded-xl"><CardHeader><CardTitle>客户</CardTitle></CardHeader><CardContent className="space-y-2">
              {loading ? <Loading /> : customers.length === 0 ? <Empty /> : customers.map((customer) => <button className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-3 text-left hover:bg-accent" key={`${customer.platform}:${customer.thirdExternalUserId}`} onClick={() => void chooseCustomer(customer)}><span className="min-w-0"><span className="block truncate text-sm font-medium">{customer.customerName}</span><span className="text-xs text-muted-foreground">{customer.memoryCount} / 20</span></span><Badge variant="outline">v{customer.version}</Badge></button>)}
            </CardContent></Card>
            <Card className="rounded-xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{selected?.customerName ?? "选择客户"}</CardTitle>{detail ? <p className="mt-1 text-xs text-muted-foreground">版本 {detail.version}</p> : null}</div>{canManage && detail ? <Button size="sm" onClick={() => setEditor({})}><HugeiconsIcon icon={PlusSignIcon} size={16} />新增记忆</Button> : null}</CardHeader><CardContent>
              {!selected ? <Empty text="请选择客户" /> : !detail ? <Loading /> : detail.items.length === 0 ? <Empty /> : <div className="space-y-3">{detail.items.map((item) => <div className="rounded-lg border border-border p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><Badge>{categoryLabel(item.category)}</Badge><Badge variant="outline">{item.source === "manual" ? "人工" : "AI 提炼"}</Badge></div><p className="text-sm leading-6">{item.content}</p></div><div className="flex shrink-0 gap-1">{item.source === "ai" ? <Button aria-label="查看证据" size="icon" variant="ghost" onClick={() => void showEvidence(item)}><HugeiconsIcon icon={ViewIcon} size={16} /></Button> : null}{canManage ? <><Button aria-label="编辑记忆" size="icon" variant="ghost" onClick={() => setEditor({ item })}><HugeiconsIcon icon={Edit02Icon} size={16} /></Button><Button aria-label="删除记忆" size="icon" variant="ghost" onClick={() => setDeleting(item)}><HugeiconsIcon icon={Delete02Icon} size={16} /></Button></> : null}</div></div></div>)}</div>}
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    <MemoryEditor open={Boolean(editor)} item={editor?.item} saving={saving} onOpenChange={(open) => { if (!open && !saving) setEditor(undefined); }} onSave={saveMemory} />
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(undefined); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>删除记忆</AlertDialogTitle><AlertDialogDescription>删除后将立即从客户当前记忆中移除</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>取消</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void removeMemory(); }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => { if (!open) setEvidence(undefined); }}><DialogContent><DialogHeader><DialogTitle>来源证据</DialogTitle><DialogDescription>AI 提炼时引用的客户消息</DialogDescription></DialogHeader><div className="space-y-2">{evidence?.messages.map((message) => <div className="rounded-lg bg-surface-muted p-3 text-sm" key={message.messageId}>{message.content}</div>)}</div></DialogContent></Dialog>
  </AiHostingLayout>;
}

function Overview({ overview, runs, canManage, saving, onToggle, onRetryRun }: { overview: AgentUserMemoryOverviewResponse; runs: AgentUserMemoryRun[]; canManage: boolean; saving: boolean; onToggle: (enabled: boolean) => void; onRetryRun: (id: number) => void }) {
  return <div className="space-y-5"><Card className="rounded-xl"><CardContent className="flex items-center justify-between gap-5 pt-6"><div><div className="font-medium">自动维护</div><p className="mt-1 text-sm text-muted-foreground">每天 {overview.schedule}（{overview.timezone}）处理前一自然日，客户额度 {overview.customerLimit}</p></div><Switch aria-label="自动维护" checked={overview.enabled} disabled={!canManage || saving} onCheckedChange={onToggle} /></CardContent></Card>
    <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1"><Metric label="当前状态" value={overview.activeRun ? statusLabel(overview.activeRun.status) : overview.enabled ? "等待调度" : "已关闭"} /><Metric label="最近选中客户" value={String(overview.recentRun?.selectedCustomerCount ?? 0)} /><Metric label="最近模型 Token" value={String((overview.recentRun?.inputTokens ?? 0) + (overview.recentRun?.outputTokens ?? 0))} /></div>
    <Card className="rounded-xl"><CardHeader><CardTitle>运行记录</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>目标日期</TableHead><TableHead>状态</TableHead><TableHead>候选会话</TableHead><TableHead>选中客户</TableHead><TableHead>结果</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{runs.length === 0 ? <TableRow><TableCell colSpan={6}><Empty /></TableCell></TableRow> : runs.map((run) => <TableRow key={run.id}><TableCell>{run.quotaDate}</TableCell><TableCell><Badge variant="outline">{statusLabel(run.status)}</Badge></TableCell><TableCell>{run.candidateSessionCount} / {run.candidateSessionLimit}</TableCell><TableCell>{run.selectedCustomerCount} / {run.customerLimit}</TableCell><TableCell>{run.successCount} 成功 · {run.failureCount} 失败 · {run.skippedCount} 跳过</TableCell><TableCell className="text-right">{canManage && (run.status === "partial" || run.status === "failed") ? <Button size="sm" variant="outline" disabled={saving} onClick={() => onRetryRun(run.id)}><HugeiconsIcon icon={RefreshIcon} size={15} />重试失败项</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card className="rounded-xl"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
function MemoryEditor({ open, item, saving, onOpenChange, onSave }: { open: boolean; item?: AgentUserMemoryItem; saving: boolean; onOpenChange: (open: boolean) => void; onSave: (input: { category: AgentUserMemoryCategory; content: string; expiresAt: number | null }) => void }) {
  const [category, setCategory] = useState<AgentUserMemoryCategory>("profile"); const [content, setContent] = useState(""); const [expiresAt, setExpiresAt] = useState("");
  useEffect(() => { if (open) { setCategory(item?.category ?? "profile"); setContent(item?.content ?? ""); setExpiresAt(item?.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : ""); } }, [open, item]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent closeButtonDisabled={saving}><DialogHeader><DialogTitle>{item ? "编辑记忆" : "新增记忆"}</DialogTitle><DialogDescription>人工维护会覆盖旧自动结果的写入边界</DialogDescription></DialogHeader><div className="space-y-4"><Select value={category} onValueChange={(value) => setCategory(value as AgentUserMemoryCategory)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent></Select><Textarea aria-label="记忆内容" maxLength={200} value={content} onChange={(event) => setContent(event.target.value)} placeholder="输入对未来服务有帮助的长期信息" />{category === "recent_context" ? <Input aria-label="过期时间" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /> : null}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving || !content.trim() || (category === "recent_context" && !expiresAt)} onClick={() => onSave({ category, content: content.trim(), expiresAt: expiresAt ? new Date(expiresAt).getTime() : null })}>{saving ? <Spinner size={16} /> : null}保存</Button></DialogFooter></DialogContent></Dialog>;
}
function Loading() { return <div className="flex min-h-32 items-center justify-center gap-2" role="status"><Spinner size={18} /><span className="text-sm text-muted-foreground">正在加载</span></div>; }
function Empty({ text = "暂无数据" }: { text?: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>; }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-40 flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">加载失败</p><Button variant="outline" onClick={onRetry}>重试</Button></div>; }
function categoryLabel(value: AgentUserMemoryCategory) { return categories.find((item) => item.value === value)?.label ?? value; }
function statusLabel(value: string) { return ({ pending: "等待中", running: "运行中", waiting: "等待结果", succeeded: "成功", partial: "部分成功", failed: "失败", canceled: "已取消", prepared: "待处理", submitted: "已提交", skipped: "已跳过" } as Record<string, string>)[value] ?? value; }
