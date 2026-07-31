import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Ticket, TicketActivity, TicketActivityPage, TicketContextResponse, TicketStatus, TicketUpdateRequest, TicketUser } from "@chatai/contracts";
import {
  ArrowLeft01Icon,
  BadgeAlertIcon,
  Calendar03Icon,
  Comment02Icon,
  Delete02Icon,
  Edit02Icon,
  FilePlusIcon,
  Flag01Icon,
  InformationCircleIcon,
  Loading03Icon,
  Male02Icon,
  MoreHorizontalIcon,
  Pen01Icon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import { OpenConversationLink } from "@/pages/chat/components/open-conversation-link";
import { adaptInsightMessages } from "@/pages/chat/insights/insight-detail-panel";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import { addTicketComment, claimTicket, deleteTicket, getTicketActivities, getTicketAssigneeOptions, getTicketContext, getTicketDetail, updateTicket } from "./api/tickets-service";
import { refreshTicketCounts } from "./ticket-count-store";
import { TicketOverdueBadge, TicketPriority, TicketStatusBadge, ticketPriorityText, ticketStatusText } from "./ticket-display";
import "./tickets.css";

const emptyStateIllustrationUrl = "https://b5.bokr.com.cn/dist/ui/empty-state.svg";
const ticketActivityPageSize = 20;

export function TicketDetailPage() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReturnView = searchParams.get("view");
  const returnView = ticketViews.has(requestedReturnView ?? "")
    ? requestedReturnView
    : "assigned_to_me_active";

  return (
    <TicketDetailContent
      backTo={`/chat/tickets?view=${returnView}`}
      onDeleted={() => navigate(`/chat/tickets?view=${returnView}`)}
      ticketId={ticketId}
    />
  );
}

type TicketDetailContentProps = {
  backTo?: string;
  onDeleted?: () => void;
  onTicketChange?: () => void;
  presentation?: "drawer" | "page";
  ticketId: string;
};

export function TicketDetailContent({
  backTo,
  onDeleted,
  onTicketChange,
  presentation = "page",
  ticketId,
}: TicketDetailContentProps) {
  const [ticket, setTicket] = useState<Ticket>();
  const [activities, setActivities] = useState<TicketActivityPage>({ hasMore: false, items: [], nextCursor: null });
  const [context, setContext] = useState<TicketContextResponse>();
  const [assigneeOptions, setAssigneeOptions] = useState<TicketUser[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isLoadingOlderContext, setIsLoadingOlderContext] = useState(false);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activityError, setActivityError] = useState<string>();
  const [comment, setComment] = useState("");
  const [isCommentEditing, setIsCommentEditing] = useState(false);
  const [form, setForm] = useState({ assigneeSubUserId: "", description: "", dueAt: "", priority: "medium", title: "" });
  const activeTicketIdRef = useRef(ticketId);
  const loadGenerationRef = useRef(0);
  activeTicketIdRef.current = ticketId;

  const loadTicket = useCallback(async () => {
    const requestedTicketId = ticketId;
    const generation = ++loadGenerationRef.current;

    if (activeTicketIdRef.current !== requestedTicketId) return;
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const next = await getTicketDetail(requestedTicketId);
      if (
        activeTicketIdRef.current !== requestedTicketId
        || loadGenerationRef.current !== generation
      ) return;
      setTicket(next.ticket);
      setForm(createTicketForm(next.ticket));
    } catch (cause) {
      if (
        activeTicketIdRef.current !== requestedTicketId
        || loadGenerationRef.current !== generation
      ) return;
      setLoadError(cause instanceof Error ? cause.message : "工单加载失败");
    } finally {
      if (
        activeTicketIdRef.current === requestedTicketId
        && loadGenerationRef.current === generation
      ) {
        setIsLoading(false);
      }
    }
  }, [ticketId]);

  useEffect(() => {
    const requestedTicketId = ticketId;
    setTicket(undefined);
    setActivities({ hasMore: false, items: [], nextCursor: null });
    setContext(undefined);
    setAssigneeOptions([]);
    setActivityError(undefined);
    setComment("");
    setIsCommentEditing(false);
    setIsEditing(false);
    setIsSaving(false);
    setIsLoadingActivities(true);
    setIsLoadingContext(true);
    void loadTicket();
    void getTicketActivities(requestedTicketId, { pageSize: ticketActivityPageSize })
      .then((page) => {
        if (activeTicketIdRef.current === requestedTicketId) setActivities(page);
      })
      .catch((cause: unknown) => {
        if (activeTicketIdRef.current === requestedTicketId) {
          setActivityError(cause instanceof Error ? cause.message : "处理记录加载失败");
        }
      })
      .finally(() => {
        if (activeTicketIdRef.current === requestedTicketId) setIsLoadingActivities(false);
      });
    void getTicketContext(requestedTicketId, { pageSize: 50 })
      .then((nextContext) => {
        if (activeTicketIdRef.current === requestedTicketId) setContext(nextContext);
      })
      .catch(() => {
        if (activeTicketIdRef.current === requestedTicketId) {
          setContext({ context: { kind: "none" }, contextAccess: "error" });
        }
      })
      .finally(() => {
        if (activeTicketIdRef.current === requestedTicketId) setIsLoadingContext(false);
      });
  }, [loadTicket, ticketId]);
  const messages = useMemo(
    () => adaptInsightMessages(context?.context.kind === "none" ? [] : context?.context.messages ?? []),
    [context?.context],
  );
  const activityGroups = useMemo(
    () => groupTicketActivities(activities.items),
    [activities.items],
  );
  const assigneeNames = useMemo(() => {
    const names = new Map(
      assigneeOptions.map((option) => [option.subUserId, option.displayName]),
    );
    if (ticket?.assignee) names.set(ticket.assignee.subUserId, ticket.assignee.displayName);
    return names;
  }, [assigneeOptions, ticket?.assignee]);

  const refreshActivitiesAfterMutation = async (
    requestedTicketId: string,
    isCurrentRequest: () => boolean,
  ) => {
    try {
      const page = await getTicketActivities(requestedTicketId, { pageSize: ticketActivityPageSize });
      if (isCurrentRequest()) {
        setActivities(page);
        setActivityError(undefined);
      }
    } catch (cause) {
      if (isCurrentRequest()) {
        setActivityError(cause instanceof Error ? cause.message : "处理记录加载失败");
      }
    }
  };

  const mutate = async (payload: TicketUpdateRequest) => {
    const requestedTicketId = ticketId;
    const generation = loadGenerationRef.current;
    const shouldRefreshCounts = "status" in payload
      || (
        payload.assigneeSubUserId !== undefined
        && payload.assigneeSubUserId !== (ticket?.assignee?.subUserId ?? null)
      );
    const isCurrentRequest = () =>
      activeTicketIdRef.current === requestedTicketId
      && loadGenerationRef.current === generation;
    const isCurrentRoute = () => activeTicketIdRef.current === requestedTicketId;
    setIsSaving(true);
    try {
      const response = await updateTicket(requestedTicketId, payload);
      if (shouldRefreshCounts) void refreshTicketCounts();
      if (!isCurrentRequest()) return false;
      setTicket(response.ticket);
      setForm(createTicketForm(response.ticket));
      onTicketChange?.();
      void refreshActivitiesAfterMutation(requestedTicketId, isCurrentRequest);
      return true;
    } catch (cause) {
      if (!isCurrentRoute()) return false;
      toast.error(cause instanceof Error ? cause.message : "工单更新失败");
      if (isErrorCode(cause, "TICKET_STATE_CONFLICT")) await loadTicket();
      return false;
    } finally {
      if (isCurrentRoute()) setIsSaving(false);
    }
  };

  const addComment = async () => {
    const requestedTicketId = ticketId;
    const generation = loadGenerationRef.current;
    const isCurrentRequest = () =>
      activeTicketIdRef.current === requestedTicketId
      && loadGenerationRef.current === generation;
    setIsSaving(true);
    try {
      const response = await addTicketComment(requestedTicketId, { content: comment });
      if (!isCurrentRequest()) return;
      setComment("");
      setIsCommentEditing(false);
      setActivities((current) => {
        return {
          ...current,
          items: [
            response.activity,
            ...current.items.filter((activity) => activity.activityId !== response.activity.activityId),
          ],
        };
      });
      setTicket((current) => current ? {
        ...current,
        updatedAt: Math.max(current.updatedAt, response.activity.createdAt),
      } : current);
      onTicketChange?.();
    } catch (cause) {
      if (!isCurrentRequest()) return;
      toast.error(cause instanceof Error ? cause.message : "评论添加失败");
    } finally {
      if (isCurrentRequest()) setIsSaving(false);
    }
  };

  const claimCurrentTicket = async () => {
    const requestedTicketId = ticketId;
    const generation = loadGenerationRef.current;
    const isCurrentRequest = () =>
      activeTicketIdRef.current === requestedTicketId
      && loadGenerationRef.current === generation;
    const isCurrentRoute = () => activeTicketIdRef.current === requestedTicketId;
    setIsSaving(true);
    try {
      const response = await claimTicket(requestedTicketId);
      void refreshTicketCounts();
      if (!isCurrentRequest()) return;
      setTicket(response.ticket);
      onTicketChange?.();
      void refreshActivitiesAfterMutation(requestedTicketId, isCurrentRequest);
    } catch (cause) {
      if (!isCurrentRoute()) return;
      toast.error(cause instanceof Error ? cause.message : "分配失败");
    } finally {
      if (isCurrentRoute()) setIsSaving(false);
    }
  };

  const deleteCurrentTicket = async () => {
    const requestedTicketId = ticketId;
    setIsDeleting(true);
    try {
      await deleteTicket(requestedTicketId);
      void refreshTicketCounts();
      if (activeTicketIdRef.current !== requestedTicketId) return;
      onDeleted?.();
    } catch (cause) {
      if (activeTicketIdRef.current === requestedTicketId) {
        setIsDeleteDialogOpen(false);
        toast.error(cause instanceof Error ? cause.message : "工单删除失败");
      }
    } finally {
      if (activeTicketIdRef.current === requestedTicketId) setIsDeleting(false);
    }
  };

  const openEditor = async () => {
    if (!ticket) return;
    setForm(createTicketForm(ticket));
    setAssigneeOptions([]);
    setIsEditing(true);
    setIsLoadingAssignees(true);
    try {
      const response = await getTicketAssigneeOptions(ticketId);
      if (activeTicketIdRef.current === ticketId) setAssigneeOptions(response.items);
    } catch (cause) {
      if (activeTicketIdRef.current === ticketId) {
        toast.error(cause instanceof Error ? cause.message : "负责人加载失败");
      }
    } finally {
      if (activeTicketIdRef.current === ticketId) setIsLoadingAssignees(false);
    }
  };

  const loadOlderContext = async () => {
    if (
      isLoadingOlderContext
      || context?.context.kind !== "session"
      || !context.context.hasMore
      || !context.context.nextCursor
    ) return;
    const requestedTicketId = ticketId;
    const cursor = context.context.nextCursor;
    setIsLoadingOlderContext(true);
    try {
      const page = await getTicketContext(requestedTicketId, { cursor, pageSize: 50 });
      if (activeTicketIdRef.current !== requestedTicketId || page.context.kind !== "session") return;
      const olderContext = page.context;
      setContext((current) => {
        if (current?.context.kind !== "session" || current.context.nextCursor !== cursor) return current;
        return {
          contextAccess: page.contextAccess,
          context: {
            ...olderContext,
            messages: [...olderContext.messages, ...current.context.messages],
          },
        };
      });
    } catch {
      toast.error("更早的关联聊天加载失败");
    } finally {
      if (activeTicketIdRef.current === requestedTicketId) setIsLoadingOlderContext(false);
    }
  };

  const loadOlderActivities = async () => {
    const cursor = activities.nextCursor;
    if (!cursor || isLoadingActivities) return;

    const requestedTicketId = ticketId;
    setActivityError(undefined);
    setIsLoadingActivities(true);
    try {
      const page = await getTicketActivities(requestedTicketId, {
        beforeActivityId: cursor,
        pageSize: ticketActivityPageSize,
      });
      if (activeTicketIdRef.current !== requestedTicketId) return;
      setActivities((current) => {
        if (current.nextCursor !== cursor) return current;
        const existingIds = new Set(current.items.map((activity) => activity.activityId));
        return {
          ...page,
          items: [
            ...current.items,
            ...page.items.filter((activity) => !existingIds.has(activity.activityId)),
          ],
        };
      });
    } catch (cause) {
      if (activeTicketIdRef.current === requestedTicketId) {
        setActivityError(cause instanceof Error ? cause.message : "处理记录加载失败");
      }
    } finally {
      if (activeTicketIdRef.current === requestedTicketId) {
        setIsLoadingActivities(false);
      }
    }
  };

  if (isLoading) return <div className="flex h-full min-h-[420px] items-center justify-center gap-2" role="status"><Spinner size={20} variant="classic" />正在加载</div>;
  if (!ticket) return <div className="h-full py-16 text-center text-destructive" role="alert">{loadError ?? "工单不存在"}</div>;

  return (
    <div className="h-full min-h-0 overflow-y-auto xl:overflow-hidden">
      <div className={`${presentation === "drawer" ? "w-full" : "mx-auto w-full max-w-[1180px]"} xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_380px]`}>
        <ScrollArea className="xl:min-h-0" viewportProps={{ className: "overflow-x-hidden" }}>
        <div className="space-y-6 px-8 py-6 xl:pr-6">
        <header>
          <div>
            {backTo ? (
              <Button
                asChild
                className="-ml-2 h-8 w-fit justify-start rounded-[8px] px-2 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <Link to={backTo}>
                  <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} size={17} strokeWidth={1.8} />
                  <span>返回工单列表</span>
                </Link>
              </Button>
            ) : null}
            <h1 className={`${backTo ? "mt-1" : "pr-10"} text-[22px] font-semibold`}>{ticket.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {ticket.canEdit ? (
                <Button
                  disabled={isSaving}
                  onClick={() => void openEditor()}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <HugeiconsIcon aria-hidden="true" icon={Edit02Icon} size={15} strokeWidth={1.8} />
                  编辑
                </Button>
              ) : null}
              {ticket.canClaim ? <Button disabled={isSaving} onClick={() => void claimCurrentTicket()} size="sm" variant="secondary">分配给我</Button> : null}
              {ticket.canEdit ? <StatusActions canStart={ticket.assignee != null} disabled={isSaving} onChange={(status) => void mutate({ expectedStatus: ticket.status, status })} status={ticket.status} /> : null}
              {ticket.canDelete ? (
                <TicketDeleteMenu
                  disabled={isSaving || isDeleting}
                  onDelete={() => setIsDeleteDialogOpen(true)}
                />
              ) : null}
            </div>
          </div>
        </header>
          <section className="space-y-4 border-b pb-6">
              <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
                <div className="space-y-4">
                  <Metadata label="客户" value={<Party avatarUrl={ticket.customerAvatarUrl} customer label={ticket.customerName || "-"} />} />
                  <Metadata label="接待账号" value={<Party avatarUrl={ticket.ownerAccountAvatarUrl} label={ticket.ownerAccountName || "-"} />} />
                  <Metadata label="创建时间" value={formatInsightTime(ticket.createdAt)} />
                  <Metadata label="更新时间" value={formatInsightTime(ticket.updatedAt)} />
                  <Metadata
                    label="截止时间"
                    value={<TicketDueAt dueAt={ticket.dueAt} status={ticket.status} />}
                  />
                  {ticket.status === "done" && ticket.completedAt != null
                    ? <Metadata label="完成时间" value={formatInsightTime(ticket.completedAt)} />
                    : null}
                  {ticket.status === "canceled" && ticket.canceledAt != null
                    ? <Metadata label="取消时间" value={formatInsightTime(ticket.canceledAt)} />
                    : null}
                </div>
                <div className="space-y-4">
                  <Metadata label="状态" value={<TicketStatusBadge size="default" status={ticket.status} />} />
                  <Metadata label="优先级" value={<TicketPriority priority={ticket.priority} size="default" />} />
                  <Metadata label="工单 ID" value={`#${ticket.ticketId}`} />
                  <Metadata label="负责人" value={ticket.assignee?.displayName || "未分配"} />
                  <Metadata label="创建人" value={ticket.createdBy?.displayName || (ticket.sourceType === "ai" ? "AI" : "-")} />
                </div>
                <Metadata align="start" className="sm:col-span-2" label="描述" value={ticket.description || "暂无描述"} />
              </dl>
          </section>
          <section className="space-y-4">
              <h2 className="text-base font-semibold">处理记录</h2>
              {ticket.canEdit ? (
                <div className="space-y-2">
                  <Textarea
                    aria-label="添加评论"
                    className={isCommentEditing ? "min-h-24 resize-y" : "h-10 min-h-10 resize-none overflow-hidden px-3.5 py-2"}
                    maxLength={1000}
                    onBlur={() => {
                      if (!comment.trim()) setIsCommentEditing(false);
                    }}
                    onChange={(event) => setComment(event.target.value)}
                    onFocus={() => setIsCommentEditing(true)}
                    placeholder="添加评论"
                    rows={isCommentEditing ? 4 : 1}
                    value={comment}
                  />
                  {isCommentEditing ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={isSaving}
                        onClick={() => {
                          setComment("");
                          setIsCommentEditing(false);
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        取消
                      </Button>
                      <Button disabled={!comment.trim() || isSaving} onClick={() => void addComment()} size="sm" type="button">
                        添加
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {isLoadingActivities && activities.items.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner size={16} variant="classic" />正在加载</div>
              ) : activities.items.length ? (
                <div className="ticket-activity-list">
                  {activityGroups.map((group) => (
                    <section className="ticket-activity-group" key={group.key}>
                      <div className="ticket-activity-date-heading">
                        <h3>{group.label}</h3>
                        <span aria-hidden="true" />
                      </div>
                      <div className="ticket-activity-group-items">
                        {group.items.map((activity) => (
                          <TicketActivityItem
                            activity={activity}
                            assigneeNames={assigneeNames}
                            key={activity.activityId}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <Empty aria-label="暂无处理记录" className="min-h-52 gap-3 border-0 p-6" role="status">
                  <EmptyMedia className="mb-0">
                    <img alt="" aria-hidden="true" className="size-28 object-contain opacity-40" src={emptyStateIllustrationUrl} />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyDescription>暂无处理记录</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {activityError ? <div className="text-sm text-destructive" role="alert">{activityError}</div> : null}
              {activities.hasMore ? (
                <div className="flex justify-center">
                  <Button disabled={isLoadingActivities} onClick={() => void loadOlderActivities()} size="sm" variant="secondary">
                    {isLoadingActivities ? <><Spinner size={14} variant="classic" />正在加载</> : "加载更多"}
                  </Button>
                </div>
              ) : null}
          </section>
        </div>
        </ScrollArea>
        <aside className="flex min-h-0 flex-col gap-3 px-8 pb-6 max-xl:border-t max-xl:pt-6 xl:h-full xl:border-l xl:px-6 xl:py-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">关联上下文</h2>
            <OpenConversationLink conversationId={ticket.conversationId} />
          </div>
          {isLoadingContext ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner size={16} variant="classic" />正在加载</div> : <TicketContext context={context} isLoadingOlder={isLoadingOlderContext} messages={messages} onLoadOlder={() => void loadOlderContext()} />}
        </aside>
        </div>
        <Dialog
          onOpenChange={(open) => {
            if (!open && !isSaving) setForm(createTicketForm(ticket));
            if (!isSaving) setIsEditing(open);
          }}
          open={isEditing}
        >
          <DialogContent closeButtonDisabled={isSaving} className="gap-0 overflow-hidden p-0 sm:max-w-[640px]">
            <DialogHeader className="px-6 pb-5 pt-6">
              <DialogTitle>编辑工单</DialogTitle>
            </DialogHeader>
            <div className="grid gap-5 px-6 pb-6">
              <Field label="标题" required>
                <div className="relative">
                  <Input
                    aria-label="标题"
                    className="pr-16"
                    maxLength={120}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    value={form.title}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {form.title.length}/120
                  </span>
                </div>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="负责人">
                  <Select disabled={isLoadingAssignees} onValueChange={(value) => setForm((current) => ({ ...current, assigneeSubUserId: value }))} value={form.assigneeSubUserId}>
                    <SelectTrigger aria-label="负责人" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="unassigned">未分配</SelectItem>
                      {assigneeOptions.map((option) => <SelectItem key={option.subUserId} value={option.subUserId}>{option.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {isLoadingAssignees ? <span className="text-xs text-muted-foreground">正在加载</span> : null}
                </Field>
                <Field label="优先级" required>
                  <SegmentedControl
                    aria-label="优先级"
                    className="h-10 w-full gap-0 rounded-[10px] bg-background p-0"
                    onValueChange={(value) => {
                      if (value) setForm((current) => ({ ...current, priority: value }));
                    }}
                    type="single"
                    value={form.priority}
                  >
                    {(["low", "medium", "high"] as const).map((priority) => (
                      <SegmentedControlItem
                        aria-label={ticketPriorityText(priority)}
                        className="h-full w-auto flex-1 rounded-none border-r border-border first:rounded-l-[9px] last:rounded-r-[9px] last:border-r-0 data-[state=on]:bg-info/10 data-[state=on]:shadow-none"
                        key={priority}
                        value={priority}
                      >
                        <TicketPriority priority={priority} size="default" />
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="截止时间">
                  <DateTimePicker
                    ariaLabel="截止时间"
                    onChange={(value) => setForm((current) => ({
                      ...current,
                      dueAt: value ? toDateTimeLocal(value.getTime()) : "",
                    }))}
                    value={form.dueAt ? new Date(form.dueAt) : undefined}
                  />
                </Field>
              </div>
              <Field label="描述">
                <Textarea
                  aria-label="描述"
                  className="min-h-28 resize-y"
                  maxLength={2000}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="补充处理背景、跟进方式或特殊说明"
                  value={form.description}
                />
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <span>描述将帮助协作者更快理解工单背景</span>
                  <span className="shrink-0">{form.description.length}/2000</span>
                </div>
              </Field>
            </div>
            <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between sm:space-x-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HugeiconsIcon aria-hidden="true" icon={InformationCircleIcon} size={16} strokeWidth={1.8} />
                保存后将记录本次修改
              </div>
              <div className="flex gap-2">
                <Button disabled={isSaving} onClick={() => setIsEditing(false)} type="button" variant="secondary">取消</Button>
                <Button
                  disabled={isSaving || !form.title.trim()}
                  onClick={() => {
                    void mutate({
                      assigneeSubUserId: form.assigneeSubUserId === "unassigned" ? null : form.assigneeSubUserId,
                      description: form.description || null,
                      dueAt: form.dueAt ? new Date(form.dueAt).getTime() : null,
                      priority: form.priority as "high" | "medium" | "low",
                      title: form.title,
                    }).then((saved) => {
                      if (saved) setIsEditing(false);
                    });
                  }}
                  type="button"
                >
                  保存修改
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认要删除吗</AlertDialogTitle>
              <AlertDialogDescription>删除后该工单将不再展示，且无法恢复</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteCurrentTicket();
                }}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}

const ticketViews = new Set(["assigned_to_me_active", "assigned_to_me", "reception", "created_by_me", "all"]);

function TicketDeleteMenu({
  disabled,
  onDelete,
}: {
  disabled: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const openMenu = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => cancelClose, []);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(nextOpen) => {
        cancelClose();
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="更多操作"
          className="size-8"
          disabled={disabled}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          size="icon"
          type="button"
          variant="secondary"
        >
          <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[116px]"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <DropdownMenuItem
          className="text-destructive data-[highlighted]:text-destructive"
          onSelect={() => {
            setOpen(false);
            onDelete();
          }}
        >
          <HugeiconsIcon aria-hidden="true" icon={Delete02Icon} size={15} strokeWidth={1.8} />
          删除工单
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusActions({ canStart, disabled, onChange, status }: { canStart: boolean; disabled: boolean; onChange: (status: TicketStatus) => void; status: TicketStatus }) {
  if (status === "done" || status === "canceled") return <Button disabled={disabled} onClick={() => onChange("open")} size="sm" variant="secondary">重新打开</Button>;
  return <>{status === "open" && canStart ? <Button disabled={disabled} onClick={() => onChange("in_progress")} size="sm" variant="secondary">开始处理</Button> : null}<Button disabled={disabled} onClick={() => onChange("done")} size="sm" variant="secondary">标记为已解决</Button><Button disabled={disabled} onClick={() => onChange("canceled")} size="sm" variant="secondary">关闭工单</Button></>;
}
function TicketContext({ context, isLoadingOlder, messages, onLoadOlder }: { context: TicketContextResponse | undefined; isLoadingOlder: boolean; messages: ReturnType<typeof adaptInsightMessages>; onLoadOlder: () => void }) {
  if (!context || context.contextAccess === "error") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-destructive">关联聊天加载失败</div>;
  if (context.contextAccess === "forbidden") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-muted-foreground">无权查看关联聊天</div>;
  if (context.context.kind === "none") return <div className="rounded-[8px] border border-dashed p-6 text-sm text-muted-foreground">未关联接待会话</div>;
  return <div className="flex min-h-0 flex-1 flex-col gap-2">{context.context.kind === "session" && context.context.hasMore ? <Button disabled={isLoadingOlder} onClick={onLoadOlder} size="sm" variant="secondary">{isLoadingOlder ? <><Spinner size={14} variant="classic" />正在加载</> : "加载更早消息"}</Button> : null}<ScrollArea className="min-w-0 xl:min-h-0 xl:flex-1" viewportProps={{ className: "overflow-x-hidden pr-4" }}><HistoryCompactMessageList messages={messages} textWeight="normal" /></ScrollArea></div>;
}
function TicketActivityItem({
  activity,
  assigneeNames,
}: {
  activity: TicketActivity;
  assigneeNames: ReadonlyMap<string, string>;
}) {
  const changes = activityChangeBlocks(activity, assigneeNames);
  const operator = activity.operator?.displayName || (activity.operatorType === "ai" ? "AI" : "系统");
  const ActivityIcon = activityIcon(activity.activityType);
  const isComment = activity.activityType === "comment_added";

  return (
    <div
      className="ticket-activity-item"
      data-activity-id={activity.activityId}
      data-activity-type={activity.activityType}
      data-testid="ticket-activity-item"
    >
      <div className="ticket-activity-icon" aria-hidden="true">
        <HugeiconsIcon icon={ActivityIcon} size={14} strokeWidth={1.9} />
      </div>
      <div className="ticket-activity-content">
        <div className="ticket-activity-summary">
          <span className="ticket-activity-operator">{operator}</span>
          <span className="ticket-activity-action">{activityText(activity)}</span>
          {!isComment ? changes.map((change, index) => {
            const label = change.text ?? `${change.label ? `${change.label}：` : ""}${change.before} → ${change.after}`;
            return (
              <span aria-label={label} className="ticket-activity-change" key={`${label}:${index}`}>
                {change.text ? change.text : (
                <>
                  {change.label ? <span className="ticket-activity-change-label">{change.label}：</span> : null}
                  <span>{change.before}</span>
                  <span aria-hidden="true" className="ticket-activity-change-arrow">→</span>
                  <span>{change.after}</span>
                </>
                )}
              </span>
            );
          }) : null}
        </div>
        {activity.content && isComment ? <div className="ticket-activity-comment">{activity.content}</div> : null}
      </div>
      <time className="ticket-activity-time" dateTime={new Date(activity.createdAt).toISOString()}>
        {formatActivityTime(activity.createdAt)}
      </time>
    </div>
  );
}
function Field({ children, label, required = false }: { children: ReactNode; label: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}
function Metadata({
  align = "center",
  className = "",
  label,
  value,
}: {
  align?: "center" | "start";
  className?: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={`grid min-h-6 grid-cols-[84px_minmax(0,1fr)] gap-3 ${align === "start" ? "items-start" : "items-center"} ${className}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
function TicketDueAt({ dueAt, status }: { dueAt: number | null; status: TicketStatus }) {
  if (dueAt == null) {
    return "未设置";
  }

  const urgency = ticketDueUrgency(dueAt, status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{timeText(dueAt)}</span>
      {urgency === "due_soon" ? (
        <span aria-label="即将到期" className="inline-flex text-warning" title="即将到期">
          <HugeiconsIcon aria-hidden="true" icon={BadgeAlertIcon} size={16} strokeWidth={1.8} />
        </span>
      ) : null}
      {urgency === "overdue" ? (
        <TicketOverdueBadge />
      ) : null}
    </span>
  );
}
function ticketDueUrgency(dueAt: number, status: TicketStatus) {
  if (status !== "open" && status !== "in_progress") {
    return null;
  }

  const remainingMs = dueAt - Date.now();
  if (remainingMs < 0) {
    return "overdue";
  }
  return remainingMs <= 30 * 60_000 ? "due_soon" : null;
}
function Party({ avatarUrl, customer = false, label }: { avatarUrl: string | null; customer?: boolean; label: string }) { return <span className="flex min-w-0 items-center gap-2"><Avatar className="size-6 rounded-[6px]"><AvatarImage alt={label} src={avatarUrl ?? undefined} /><AvatarFallback>{customer ? <HugeiconsIcon aria-hidden="true" icon={Male02Icon} size={13} strokeWidth={1.8} /> : null}</AvatarFallback></Avatar><span className="truncate">{label}</span></span>; }
function createTicketForm(ticket: Ticket) { return { assigneeSubUserId: ticket.assignee?.subUserId ?? "unassigned", description: ticket.description ?? "", dueAt: toDateTimeLocal(ticket.dueAt), priority: ticket.priority, title: ticket.title }; }
function toDateTimeLocal(value: number | null) { if (!value) return ""; const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000); return date.toISOString().slice(0,16); }
function isErrorCode(value: unknown, code: string) { return Boolean(value && typeof value === "object" && "code" in value && value.code === code); }
function activityText(activity: TicketActivity) {
  if (
    activity.activityType === "content_updated"
    && Array.isArray(activity.detail?.changes)
  ) {
    return "编辑工单";
  }
  return ({ created: "创建工单", status_changed: "更新状态", assignee_changed: "变更负责人", priority_changed: "变更优先级", due_at_changed: "变更截止时间", content_updated: "更新工单内容", comment_added: "添加评论" } as Record<string,string>)[activity.activityType] ?? "更新工单";
}
function activityIcon(type: TicketActivity["activityType"]) {
  return ({
    assignee_changed: UserSwitchIcon,
    comment_added: Comment02Icon,
    content_updated: Pen01Icon,
    created: FilePlusIcon,
    due_at_changed: Calendar03Icon,
    priority_changed: Flag01Icon,
    status_changed: Loading03Icon,
  } as const)[type];
}
function groupTicketActivities(activities: TicketActivity[]) {
  const groups: Array<{ items: TicketActivity[]; key: string; label: string }> = [];
  for (const activity of activities) {
    const date = new Date(activity.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const current = groups.at(-1);
    if (current?.key === key) current.items.push(activity);
    else groups.push({ items: [activity], key, label: formatActivityDate(date) });
  }
  return groups;
}
function formatActivityDate(date: Date) {
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  ) return "今天";
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
function formatActivityTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(timestamp);
}
function activityChangeValues(
  activity: TicketActivity,
  assigneeNames: ReadonlyMap<string, string>,
) {
  const before = activity.detail?.before;
  const after = activity.detail?.after;
  if (before === undefined && after === undefined) return null;
  if (activity.activityType === "status_changed") {
    return { after: ticketStatusText(after), before: ticketStatusText(before) };
  }
  if (activity.activityType === "priority_changed") {
    return { after: ticketPriorityText(after), before: ticketPriorityText(before) };
  }
  if (activity.activityType === "assignee_changed") {
    return {
      after: assigneeText(after, assigneeNames),
      before: assigneeText(before, assigneeNames),
    };
  }
  if (activity.activityType === "due_at_changed") {
    return { after: timeText(after), before: timeText(before) };
  }
  if (activity.activityType === "content_updated" && activity.detail?.field === "title") {
    return { after: String(after ?? ""), before: String(before ?? "") };
  }
  return null;
}
function activityChangeBlocks(
  activity: TicketActivity,
  assigneeNames: ReadonlyMap<string, string>,
) {
  if (
    activity.activityType === "content_updated"
    && Array.isArray(activity.detail?.changes)
  ) {
    return activity.detail.changes.flatMap((value) =>
      ticketEditChangeBlock(value, assigneeNames),
    );
  }
  const change = activityChangeValues(activity, assigneeNames);

  return change ? [{ ...change, label: "" }] : [];
}
function ticketEditChangeBlock(
  value: unknown,
  assigneeNames: ReadonlyMap<string, string>,
): Array<
  | { after: string; before: string; label: string; text?: never }
  | { after?: never; before?: never; label?: never; text: string }
> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const change = value as Record<string, unknown>;
  if (change.field === "title") return [{ text: "标题已更新" }];
  if (change.field === "description") return [{ text: "描述已更新" }];
  if (change.field === "priority") {
    return [{ after: ticketPriorityText(change.after), before: ticketPriorityText(change.before), label: "优先级" }];
  }
  if (change.field === "dueAt") {
    return [{ after: timeText(change.after), before: timeText(change.before), label: "截止时间" }];
  }
  if (change.field === "assignee") {
    return [{
      after: typeof change.afterLabel === "string" ? change.afterLabel : assigneeText(change.after, assigneeNames),
      before: typeof change.beforeLabel === "string" ? change.beforeLabel : assigneeText(change.before, assigneeNames),
      label: "负责人",
    }];
  }
  if (change.field === "status") {
    return [{ after: ticketStatusText(change.after), before: ticketStatusText(change.before), label: "状态" }];
  }
  return [];
}
function assigneeText(value: unknown, assigneeNames: ReadonlyMap<string, string>) {
  return value == null ? "未分配" : assigneeNames.get(String(value)) ?? "未知负责人";
}
function timeText(value: unknown) { const timestamp = Number(value); return Number.isFinite(timestamp) && timestamp > 0 ? formatInsightTime(timestamp) : "未设置"; }
