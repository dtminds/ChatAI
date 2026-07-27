import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Ticket,
  TicketContextOptionsResponse,
  TicketCreateRequest,
  TicketPriority,
  TicketUser,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import {
  createTicket,
  getTicketContextOptions,
} from "@/pages/chat/tickets/api/tickets-service";

const pageSize = 20;

type TicketCreateDialogProps = {
  conversationId: string;
  onCreated: (ticket: Ticket) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function TicketCreateDialog({
  conversationId,
  onCreated,
  onOpenChange,
  open,
}: TicketCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [assigneeSubUserId, setAssigneeSubUserId] = useState<string>();
  const [contextValue, setContextValue] = useState("current");
  const [assignees, setAssignees] = useState<TicketUser[]>([]);
  const [sessions, setSessions] = useState<
    TicketContextOptionsResponse["sessions"]["items"]
  >([]);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionTotalPages, setSessionTotalPages] = useState(1);
  const [isOptionsLoading, setIsOptionsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const scopeRef = useRef("");
  const scopeKey = `${conversationId}:${open ? "open" : "closed"}`;
  scopeRef.current = scopeKey;

  useEffect(() => {
    if (!open) {
      return;
    }

    const requestScope = scopeKey;
    let active = true;
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueAt("");
    setAssigneeSubUserId(undefined);
    setContextValue("current");
    setAssignees([]);
    setSessions([]);
    setSessionPage(1);
    setSessionTotalPages(1);
    setError(undefined);
    setIsOptionsLoading(true);

    void getTicketContextOptions({ conversationId, page: 1, pageSize })
      .then((result) => {
        if (!active || scopeRef.current !== requestScope) {
          return;
        }
        setAssignees(result.assignees);
        setAssigneeSubUserId(result.defaultAssigneeSubUserId ?? "unassigned");
        setSessions(result.sessions.items);
        setSessionPage(result.sessions.page);
        setSessionTotalPages(result.sessions.totalPages);
      })
      .catch((cause: unknown) => {
        if (active && scopeRef.current === requestScope) {
          setError(errorMessage(cause, "工单选项加载失败"));
        }
      })
      .finally(() => {
        if (active && scopeRef.current === requestScope) {
          setIsOptionsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [conversationId, open, scopeKey]);

  const handleLoadMore = async () => {
    if (isLoadingMore || sessionPage >= sessionTotalPages) {
      return;
    }
    const requestScope = scopeRef.current;
    const nextPage = sessionPage + 1;
    setIsLoadingMore(true);
    setError(undefined);
    try {
      const result = await getTicketContextOptions({
        conversationId,
        page: nextPage,
        pageSize,
      });
      if (scopeRef.current !== requestScope) {
        return;
      }
      setSessions((current) => [
        ...current,
        ...result.sessions.items.filter(
          (item) => !current.some((existing) => existing.sessionId === item.sessionId),
        ),
      ]);
      setSessionPage(result.sessions.page);
      setSessionTotalPages(result.sessions.totalPages);
    } catch (cause) {
      if (scopeRef.current === requestScope) {
        setError(errorMessage(cause, "接待会话加载失败"));
      }
    } finally {
      if (scopeRef.current === requestScope) {
        setIsLoadingMore(false);
      }
    }
  };

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError("请输入工单标题");
      return;
    }

    const requestScope = scopeRef.current;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const result = await createTicket({
        ...(assigneeSubUserId === undefined
          ? {}
          : { assigneeSubUserId: assigneeSubUserId === "unassigned" ? null : assigneeSubUserId }),
        context: parseContext(contextValue),
        conversationId,
        description: description.trim() || null,
        dueAt: dueAt ? new Date(dueAt).getTime() : null,
        priority,
        title: normalizedTitle,
      });
      if (scopeRef.current !== requestScope) {
        return;
      }
      onCreated(result.ticket);
      onOpenChange(false);
    } catch (cause) {
      if (scopeRef.current === requestScope) {
        setError(errorMessage(cause, "工单创建失败"));
      }
    } finally {
      if (scopeRef.current === requestScope) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent closeButtonDisabled={isSubmitting} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>创建工单</DialogTitle>
          <DialogDescription className="sr-only">
            填写工单信息并选择关联的接待会话
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="标题" required>
            <Input
              aria-label="标题"
              maxLength={255}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="请输入工单标题"
              value={title}
            />
          </Field>
          <Field label="描述">
            <Textarea
              aria-label="描述"
              className="min-h-24 resize-y"
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充背景和处理要求"
              value={description}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="负责人">
              <Select
                disabled={isOptionsLoading}
                onValueChange={setAssigneeSubUserId}
                value={assigneeSubUserId}
              >
                <SelectTrigger aria-label="负责人">
                  <SelectValue placeholder="默认负责人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">未分配</SelectItem>
                  {assignees.map((assignee) => (
                    <SelectItem key={assignee.subUserId} value={assignee.subUserId}>
                      {assignee.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="优先级" required>
              <Select
                onValueChange={(value) => setPriority(value as TicketPriority)}
                value={priority}
              >
                <SelectTrigger aria-label="优先级">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="截止时间">
              <Input
                aria-label="截止时间"
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </Field>
            <Field label="关联接待会话" required>
              <Select
                disabled={isOptionsLoading}
                onValueChange={setContextValue}
                value={contextValue}
              >
                <SelectTrigger aria-label="关联接待会话">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">当前会话</SelectItem>
                  <SelectItem value="none">不关联</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.sessionId} value={`session:${session.sessionId}`}>
                      {sessionLabel(session)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isOptionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner size={16} variant="classic" />
              正在加载
            </div>
          ) : sessionPage < sessionTotalPages ? (
            <Button
              className="w-fit"
              disabled={isLoadingMore}
              onClick={() => void handleLoadMore()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isLoadingMore ? "正在加载" : "加载更多接待会话"}
            </Button>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={isSubmitting || isOptionsLoading || !title.trim()}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {isSubmitting ? "正在创建" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <div className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </div>
      {children}
    </div>
  );
}

function parseContext(value: string): TicketCreateRequest["context"] {
  if (value === "none") {
    return { type: "none" };
  }
  if (value.startsWith("session:")) {
    return { sessionId: value.slice("session:".length), type: "session" };
  }
  return { type: "current" };
}

function sessionLabel(
  session: TicketContextOptionsResponse["sessions"]["items"][number],
) {
  const range = session.endedAt
    ? `${formatInsightTime(session.startedAt)} - ${formatInsightTime(session.endedAt)}`
    : `${formatInsightTime(session.startedAt)} 至今`;
  const summary = session.title ?? session.summary;
  return summary ? `${range} ${summary}` : range;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
