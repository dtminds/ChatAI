import { useEffect, useRef, useState, type ReactNode } from "react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import type {
  Ticket,
  TicketContextOptionsResponse,
  TicketCreateRequest,
  TicketPriority,
  TicketUser,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import {
  createTicket,
  getTicketContextOptions,
} from "@/pages/chat/tickets/api/tickets-service";
import { refreshTicketCounts } from "@/pages/chat/tickets/ticket-count-store";
import { TicketPriority as TicketPriorityDisplay, ticketPriorityText } from "@/pages/chat/tickets/ticket-display";

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
  const [dueAt, setDueAt] = useState<Date>();
  const [assigneeSubUserId, setAssigneeSubUserId] = useState<string>();
  const [contextValue, setContextValue] = useState("current");
  const [assignees, setAssignees] = useState<TicketUser[]>([]);
  const [sessions, setSessions] = useState<TicketContextOptionsResponse["sessions"]>([]);
  const [isOptionsLoading, setIsOptionsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optionsError, setOptionsError] = useState<string>();
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
    setDueAt(undefined);
    setAssigneeSubUserId(undefined);
    setContextValue("current");
    setAssignees([]);
    setSessions([]);
    setOptionsError(undefined);
    setIsOptionsLoading(true);

    void getTicketContextOptions({ conversationId })
      .then((result) => {
        if (!active || scopeRef.current !== requestScope) {
          return;
        }
        setAssignees(result.assignees);
        setAssigneeSubUserId(result.defaultAssigneeSubUserId ?? "unassigned");
        setSessions(result.sessions);
      })
      .catch((cause: unknown) => {
        if (active && scopeRef.current === requestScope) {
          setOptionsError(errorMessage(cause, "工单选项加载失败"));
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

  const handleSubmit = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }

    const requestScope = scopeRef.current;
    setIsSubmitting(true);
    try {
      const result = await createTicket({
        ...(assigneeSubUserId === undefined
          ? {}
          : { assigneeSubUserId: assigneeSubUserId === "unassigned" ? null : assigneeSubUserId }),
        context: parseContext(contextValue),
        conversationId,
        description: description.trim() || null,
        dueAt: dueAt?.getTime() ?? null,
        priority,
        title: normalizedTitle,
      });
      void refreshTicketCounts();
      if (scopeRef.current !== requestScope) {
        return;
      }
      onCreated(result.ticket);
      onOpenChange(false);
    } catch (cause) {
      if (scopeRef.current === requestScope) {
        toast.error(errorMessage(cause, "工单创建失败"));
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
      <DialogContent closeButtonDisabled={isSubmitting} className="gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="px-6 pb-5 pt-6">
          <DialogTitle>创建工单</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 px-6 pb-6">
          <Field label="标题" required>
            <div className="relative">
              <Input
                aria-label="标题"
                className="pr-16"
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入工单标题"
                value={title}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {title.length}/120
              </span>
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="负责人">
              <Select
                disabled={isOptionsLoading}
                onValueChange={setAssigneeSubUserId}
                value={assigneeSubUserId}
              >
                <SelectTrigger aria-label="负责人" className="w-full">
                  {isOptionsLoading ? (
                    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground" role="status">
                      <Spinner size={14} variant="classic" />
                      <span>正在加载</span>
                    </div>
                  ) : (
                    <SelectValue placeholder="默认负责人" />
                  )}
                </SelectTrigger>
                <SelectContent className="max-h-64">
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
              <SegmentedControl
                aria-label="优先级"
                className="h-10 w-full gap-0 rounded-[10px] bg-background p-0"
                onValueChange={(value) => {
                  if (value) setPriority(value as TicketPriority);
                }}
                type="single"
                value={priority}
              >
                {(["low", "medium", "high"] as const).map((itemPriority) => (
                  <SegmentedControlItem
                    aria-label={ticketPriorityText(itemPriority)}
                    className="h-full w-auto flex-1 rounded-none border-r border-border first:rounded-l-[9px] last:rounded-r-[9px] last:border-r-0 data-[state=on]:bg-info/10 data-[state=on]:shadow-none"
                    key={itemPriority}
                    value={itemPriority}
                  >
                    <TicketPriorityDisplay priority={itemPriority} size="default" />
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="截止时间">
              <DateTimePicker
                ariaLabel="截止时间"
                onChange={setDueAt}
                value={dueAt}
              />
            </Field>
            <Field
              hint="用于协作者了解工单对应的对话背景"
              label="关联接待会话"
              required
            >
              <Select
                disabled={isOptionsLoading}
                onValueChange={setContextValue}
                value={contextValue}
              >
                <SelectTrigger aria-label="关联接待会话" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="current">当前会话</SelectItem>
                  <SelectItem value="none">不关联</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem
                      className="min-w-0 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1 [&>span:last-child]:truncate"
                      key={session.sessionId}
                      value={`session:${session.sessionId}`}
                    >
                      {sessionLabel(session)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="描述">
            <Textarea
              aria-label="描述"
              className="min-h-28 resize-y"
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充处理背景、跟进方式或特殊说明"
              value={description}
            />
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>描述将帮助协作者更快理解工单背景</span>
              <span className="shrink-0">{description.length}/2000</span>
            </div>
          </Field>
          {optionsError ? (
            <p className="text-sm text-destructive" role="alert">
              {optionsError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
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
  hint,
  label,
  required = false,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center text-sm font-medium text-foreground">
        <span>{label}</span>
        {required ? <span className="ml-1 text-destructive">*</span> : null}
        {hint ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${label}说明`}
                  className="ml-1 inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  type="button"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    color="currentColor"
                    icon={InformationCircleIcon}
                    size={14}
                    strokeWidth={1.8}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
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
  session: TicketContextOptionsResponse["sessions"][number],
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
