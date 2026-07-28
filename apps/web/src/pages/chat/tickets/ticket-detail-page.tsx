import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TicketActivity, TicketDetailResponse, TicketStatus, TicketUpdateRequest } from "@chatai/contracts";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import { adaptInsightMessages } from "@/pages/chat/insights/insight-detail-panel";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import { addTicketComment, claimTicket, getTicketDetail, updateTicket } from "./api/tickets-service";
import { TicketsLayout } from "./tickets-layout";

export function TicketDetailPage() {
  const { ticketId = "" } = useParams();
  const [detail, setDetail] = useState<TicketDetailResponse>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [form, setForm] = useState({ assigneeSubUserId: "", description: "", dueAt: "", priority: "medium", title: "" });
  const activeTicketIdRef = useRef(ticketId);
  const loadGenerationRef = useRef(0);
  activeTicketIdRef.current = ticketId;

  const load = useCallback(async () => {
    const requestedTicketId = ticketId;
    const generation = ++loadGenerationRef.current;

    if (activeTicketIdRef.current !== requestedTicketId) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const next = await getTicketDetail(requestedTicketId);
      if (
        activeTicketIdRef.current !== requestedTicketId
        || loadGenerationRef.current !== generation
      ) return;
      setDetail(next);
      setForm({
        assigneeSubUserId: next.ticket.assignee?.subUserId ?? "unassigned",
        description: next.ticket.description ?? "",
        dueAt: toDateTimeLocal(next.ticket.dueAt),
        priority: next.ticket.priority,
        title: next.ticket.title,
      });
    } catch (cause) {
      if (
        activeTicketIdRef.current !== requestedTicketId
        || loadGenerationRef.current !== generation
      ) return;
      setError(cause instanceof Error ? cause.message : "工单加载失败");
    } finally {
      if (
        activeTicketIdRef.current === requestedTicketId
        && loadGenerationRef.current === generation
      ) {
        setIsLoading(false);
      }
    }
  }, [ticketId]);

  useEffect(() => { void load(); }, [load]);
  const ticket = detail?.ticket;
  const messages = useMemo(
    () => adaptInsightMessages(detail?.context.kind === "none" ? [] : detail?.context.messages ?? []),
    [detail?.context],
  );

  const mutate = async (payload: TicketUpdateRequest) => {
    setIsSaving(true);
    try {
      await updateTicket(ticketId, payload);
      await load();
    } catch (cause) {
      if (isErrorCode(cause, "TICKET_STATE_CONFLICT")) await load();
      else setError(cause instanceof Error ? cause.message : "工单更新失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <TicketsLayout><div className="flex min-h-[420px] items-center justify-center gap-2" role="status"><Spinner size={20} variant="classic" />正在加载</div></TicketsLayout>;
  if (!ticket || !detail) return <TicketsLayout><div className="py-16 text-center text-destructive" role="alert">{error ?? "工单不存在"}</div></TicketsLayout>;

  return (
    <TicketsLayout>
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div><div className="text-sm text-muted-foreground">工单 #{ticket.ticketId}</div><h1 className="mt-1 text-[22px] font-semibold">{ticket.title}</h1></div>
          <div className="flex gap-2">
            {ticket.canClaim ? <Button disabled={isSaving} onClick={() => { setIsSaving(true); void claimTicket(ticketId).then(load).catch((cause) => { setError(cause instanceof Error ? cause.message : "领取失败"); return load(); }).finally(() => setIsSaving(false)); }}>领取</Button> : null}
            {ticket.canEdit ? <StatusActions disabled={isSaving} onChange={(status) => void mutate({ expectedStatus: ticket.status, status })} status={ticket.status} /> : null}
          </div>
        </header>
        {error ? <div className="text-sm text-destructive" role="alert">{error}</div> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="space-y-4 border-b pb-6">
              <h2 className="text-base font-semibold">工单信息</h2>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <Metadata label="客户" value={ticket.customerName || "-"} />
                <Metadata label="所属账号" value={ticket.ownerAccountName || "-"} />
                <Metadata label="状态" value={statusText(ticket.status)} />
                <Metadata label="来源" value={ticket.sourceType === "ai" ? "智能创建" : "人工创建"} />
                <Metadata label="创建人" value={ticket.createdBy?.displayName || (ticket.sourceType === "ai" ? "AI" : "-")} />
                <Metadata label="创建时间" value={formatInsightTime(ticket.createdAt)} />
                <Metadata label="更新时间" value={formatInsightTime(ticket.updatedAt)} />
                <Metadata label="接待会话" value={ticket.sessionId ?? "-"} />
              </dl>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="标题"><Input disabled={!ticket.canEdit} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} /></Field>
                <Field label="负责人"><Select disabled={!ticket.canEdit} onValueChange={(value) => setForm((current) => ({ ...current, assigneeSubUserId: value }))} value={form.assigneeSubUserId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">未分配</SelectItem>{detail.assigneeOptions.map((option) => <SelectItem key={option.subUserId} value={option.subUserId}>{option.displayName}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="优先级"><Select disabled={!ticket.canEdit} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))} value={form.priority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">高</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="low">低</SelectItem></SelectContent></Select></Field>
                <Field label="截止时间"><Input disabled={!ticket.canEdit} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} type="datetime-local" value={form.dueAt} /></Field>
              </div>
              <Field label="描述"><Textarea disabled={!ticket.canEdit} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} value={form.description} /></Field>
              {ticket.canEdit ? <Button disabled={isSaving || !form.title.trim()} onClick={() => void mutate({ assigneeSubUserId: form.assigneeSubUserId === "unassigned" ? null : form.assigneeSubUserId, description: form.description || null, dueAt: form.dueAt ? new Date(form.dueAt).getTime() : null, priority: form.priority as "high"|"medium"|"low", title: form.title })}>保存</Button> : null}
            </section>
            <section className="space-y-3"><h2 className="text-base font-semibold">关联上下文</h2><TicketContext detail={detail} messages={messages} /></section>
          </div>
          <aside className="space-y-4 border-l pl-6 max-xl:border-l-0 max-xl:pl-0">
            <h2 className="text-base font-semibold">处理记录</h2>
            {ticket.canEdit ? <div className="flex gap-2"><Input aria-label="添加处理备注" onChange={(event) => setComment(event.target.value)} placeholder="添加处理备注" value={comment} /><Button disabled={!comment.trim() || isSaving} onClick={() => { setIsSaving(true); void addTicketComment(ticketId, { content: comment }).then(() => { setComment(""); return load(); }).catch((cause) => setError(cause instanceof Error ? cause.message : "备注添加失败")).finally(() => setIsSaving(false)); }}>添加</Button></div> : null}
            <div className="space-y-4">{detail.activities.length ? detail.activities.map((activity) => <div className="border-l-2 pl-3" key={activity.activityId}><div className="text-sm">{activity.content ?? activityText(activity.activityType)}</div>{activityDetailText(activity) ? <div className="mt-1 text-xs text-muted-foreground">{activityDetailText(activity)}</div> : null}<div className="mt-1 text-xs text-muted-foreground">{activity.operator?.displayName || (activity.operatorType === 'ai' ? 'AI' : '系统')} · {formatInsightTime(activity.createdAt)}</div></div>) : <div className="text-sm text-muted-foreground">暂无记录</div>}</div>
          </aside>
        </div>
      </div>
    </TicketsLayout>
  );
}

function StatusActions({ disabled, onChange, status }: { disabled: boolean; onChange: (status: TicketStatus) => void; status: TicketStatus }) {
  if (status === "done" || status === "canceled") return <Button disabled={disabled} onClick={() => onChange("open")} variant="outline">重新打开</Button>;
  return <><Button disabled={disabled} onClick={() => onChange("done")}>完成</Button><Button disabled={disabled} onClick={() => onChange("canceled")} variant="outline">取消</Button></>;
}
function TicketContext({ detail, messages }: { detail: TicketDetailResponse; messages: ReturnType<typeof adaptInsightMessages> }) {
  if (detail.contextAccess === "forbidden") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-muted-foreground">无权查看关联聊天</div>;
  if (detail.contextAccess === "error") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-destructive">关联聊天加载失败</div>;
  if (detail.context.kind === "none") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-muted-foreground">未关联接待会话</div>;
  return <div className="max-h-[520px] overflow-y-auto rounded-[8px] bg-muted/50 p-4"><div className="mb-3 text-xs text-muted-foreground">{detail.context.kind === "session" ? `接待会话 ${detail.context.sessionId}` : `消息上下文 ${detail.context.anchorMessageId}`}</div><HistoryCompactMessageList messages={messages} textWeight="normal" /></div>;
}
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>; }
function Metadata({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }
function toDateTimeLocal(value: number | null) { if (!value) return ""; const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000); return date.toISOString().slice(0,16); }
function isErrorCode(value: unknown, code: string) { return Boolean(value && typeof value === "object" && "code" in value && value.code === code); }
function activityText(type: string) { return ({ created: "创建工单", status_changed: "更新状态", assignee_changed: "变更负责人", priority_changed: "变更优先级", due_at_changed: "变更截止时间", content_updated: "更新工单内容", comment_added: "添加备注" } as Record<string,string>)[type] ?? "更新工单"; }
function statusText(status: unknown) { return ({ open: "待处理", in_progress: "处理中", done: "已完成", canceled: "已取消", dismissed: "已取消", expired: "已取消" } as Record<string,string>)[String(status)] ?? String(status ?? "-"); }
function activityDetailText(activity: TicketActivity) {
  const before = activity.detail?.before;
  const after = activity.detail?.after;
  if (before === undefined && after === undefined) return null;
  if (activity.activityType === "status_changed") return `${statusText(before)} -> ${statusText(after)}`;
  if (activity.activityType === "priority_changed") return `${priorityText(before)} -> ${priorityText(after)}`;
  if (activity.activityType === "assignee_changed") return `${assigneeText(before)} -> ${assigneeText(after)}`;
  if (activity.activityType === "due_at_changed") return `${timeText(before)} -> ${timeText(after)}`;
  if (activity.activityType === "content_updated") return activity.detail?.field === "title" ? `${String(before ?? "")} -> ${String(after ?? "")}` : null;
  return null;
}
function priorityText(value: unknown) { return ({ high: "高", medium: "中", low: "低" } as Record<string,string>)[String(value)] ?? String(value ?? "-"); }
function assigneeText(value: unknown) { return value == null ? "未分配" : `子账号 ${String(value)}`; }
function timeText(value: unknown) { const timestamp = Number(value); return Number.isFinite(timestamp) && timestamp > 0 ? formatInsightTime(timestamp) : "未设置"; }
