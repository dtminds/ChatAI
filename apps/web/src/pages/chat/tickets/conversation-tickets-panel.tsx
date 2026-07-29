import { useEffect, useRef, useState } from "react";
import type {
  ConversationTicketFilter,
  ConversationTicketsResponse,
  Ticket,
  TicketStatus,
} from "@chatai/contracts";
import {
  Add01Icon,
  MoreHorizontalIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import {
  claimTicket,
  getConversationTickets,
  updateTicket,
} from "@/pages/chat/tickets/api/tickets-service";
import { refreshTicketCounts } from "@/pages/chat/tickets/ticket-count-store";
import {
  TicketOverdueBadge,
  TicketPriority,
  TicketStatusBadge,
} from "@/pages/chat/tickets/ticket-display";

const pageSize = 20;
const emptyStateIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/empty-state.svg";
const ticketSummaryTagClass =
  "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-xs font-medium";
const ticketFilters: Array<{
  label: string;
  value: ConversationTicketFilter;
}> = [
  { label: "待处理", value: "active" },
  { label: "已完成", value: "done" },
  { label: "已取消", value: "canceled" },
];

type ConversationTicketsPanelProps = {
  conversationId: string;
  onCreateTicket?: () => void;
  refreshKey?: number;
};

export function ConversationTicketsPanel({
  conversationId,
  onCreateTicket,
  refreshKey = 0,
}: ConversationTicketsPanelProps) {
  return (
    <ConversationTicketsPanelContent
      conversationId={conversationId}
      key={`${conversationId}:${refreshKey}`}
      onCreateTicket={onCreateTicket}
      refreshKey={refreshKey}
    />
  );
}

function ConversationTicketsPanelContent({
  conversationId,
  onCreateTicket,
  refreshKey = 0,
}: ConversationTicketsPanelProps) {
  const [filter, setFilter] = useState<ConversationTicketFilter>("active");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<ConversationTicketsResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [pendingTicketId, setPendingTicketId] = useState<string>();
  const requestScopeRef = useRef("");
  const mutationScopeRef = useRef("");
  const requestScope = `${conversationId}:${filter}:${page}:${refreshKey}:${reloadKey}`;
  requestScopeRef.current = requestScope;
  mutationScopeRef.current = `${conversationId}:${filter}`;

  useEffect(() => {
    setFilter("active");
    setPage(1);
    setResult(undefined);
    setError(undefined);
    setActionError(undefined);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    const isFirstPage = page === 1;
    if (isFirstPage) {
      setIsLoading(true);
      setResult(undefined);
    } else {
      setIsLoadingMore(true);
    }
    setError(undefined);

    void getConversationTickets(conversationId, {
      page,
      pageSize,
      scope: "conversation",
      filter,
    })
      .then((next) => {
        if (!active || requestScopeRef.current !== requestScope) {
          return;
        }
        setResult((current) =>
          isFirstPage || !current
            ? next
            : {
                ...next,
                items: [
                  ...current.items,
                  ...next.items.filter(
                    (item) => !current.items.some((existing) => existing.ticketId === item.ticketId),
                  ),
                ],
              },
        );
      })
      .catch((cause: unknown) => {
        if (active && requestScopeRef.current === requestScope) {
          setError(errorMessage(cause, "工单加载失败"));
        }
      })
      .finally(() => {
        if (active && requestScopeRef.current === requestScope) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      });

    return () => {
      active = false;
    };
  }, [conversationId, filter, page, refreshKey, reloadKey, requestScope]);

  const runAction = async (ticket: Ticket, action: "claim" | TicketStatus) => {
    const mutationScope = mutationScopeRef.current;
    setPendingTicketId(ticket.ticketId);
    setActionError(undefined);
    try {
      if (action === "claim") {
        await claimTicket(ticket.ticketId);
      } else {
        await updateTicket(ticket.ticketId, {
          expectedStatus: ticket.status,
          status: action,
        });
      }
      void refreshTicketCounts();
      if (mutationScopeRef.current === mutationScope) {
        setPage(1);
        setReloadKey((current) => current + 1);
      }
    } catch (cause) {
      if (mutationScopeRef.current === mutationScope) {
        const message = errorMessage(cause, "工单操作失败");
        if (isErrorCode(cause, "TICKET_STATE_CONFLICT")) {
          toast.error(message);
          setPage(1);
          setReloadKey((current) => current + 1);
        } else {
          setActionError(message);
        }
      }
    } finally {
      if (mutationScopeRef.current === mutationScope) {
        setPendingTicketId(undefined);
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-divider px-3 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <Tabs
            className="min-w-0"
            onValueChange={(value) => {
              setFilter(value as ConversationTicketFilter);
              setPage(1);
              setResult(undefined);
              setActionError(undefined);
            }}
            value={filter}
          >
            <TabsList className="grid h-9 min-w-0 grid-cols-3 rounded-[10px] p-1">
              {ticketFilters.map((item) => (
                <TabsTrigger
                  className="h-7 min-w-0 rounded-[8px] px-1 py-1 text-[13px]"
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {onCreateTicket ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="创建工单"
                    className="size-9 shrink-0 rounded-[10px] p-0"
                    onClick={onCreateTicket}
                    size="icon"
                    type="button"
                    variant="secondary"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={Add01Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  创建工单
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="border-b border-destructive/15 px-4 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner size={18} variant="classic" />
          正在加载
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button onClick={() => setReloadKey((current) => current + 1)} size="sm" variant="outline">
            重新加载
          </Button>
        </div>
      ) : !result?.items.length ? (
        <Empty
          aria-label="暂无数据"
          className="min-h-0 flex-1 gap-3 border-0 px-6 py-8"
          role="status"
        >
          <EmptyMedia className="mb-0">
            <img
              alt=""
              aria-hidden="true"
              className="h-[100px] w-[135px] object-contain opacity-40"
              src={emptyStateIllustrationUrl}
            />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>暂无数据</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea
          className="min-h-0 min-w-0 flex-1"
          viewportProps={{
            className:
              "max-w-full overflow-x-hidden [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full",
          }}
        >
          <div className="w-full min-w-0 max-w-full divide-y divide-divider overflow-hidden">
            {result.items.map((ticket) => (
              <TicketRow
                key={ticket.ticketId}
                onAction={(action) => void runAction(ticket, action)}
                pending={pendingTicketId === ticket.ticketId}
                ticket={ticket}
              />
            ))}
          </div>
          {result.page < result.totalPages ? (
            <div className="flex justify-center p-4">
              <Button
                disabled={isLoadingMore}
                onClick={() => setPage((current) => current + 1)}
                size="sm"
                variant="outline"
              >
                {isLoadingMore ? "正在加载" : "加载更多"}
              </Button>
            </div>
          ) : null}
        </ScrollArea>
      )}
    </div>
  );
}

function TicketRow({
  onAction,
  pending,
  ticket,
}: {
  onAction: (action: "claim" | TicketStatus) => void;
  pending: boolean;
  ticket: Ticket;
}) {
  return (
    <article className="w-full min-w-0 max-w-full space-y-2 overflow-hidden px-4 py-4">
      <div className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden">
        <Link
          className="block min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground hover:underline"
          to={`/chat/tickets/${ticket.ticketId}`}
        >
          {ticket.title}
        </Link>
        {ticket.canClaim || ticket.canEdit ? (
          <TicketActionsMenu
            onAction={onAction}
            pending={pending}
            ticket={ticket}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <TicketStatusBadge
          className="h-7 shrink-0 rounded-[6px] px-2 py-0 text-xs"
          status={ticket.status}
        />
        <span
          className={`${ticketSummaryTagClass} shrink-0 bg-surface-muted`}
        >
          <TicketPriority priority={ticket.priority} />
        </span>
        {ticket.overdue ? (
          <TicketOverdueBadge className="h-7 shrink-0 rounded-[6px] px-2 py-0 text-xs" />
        ) : null}
        <span
          className={`${ticketSummaryTagClass} min-w-0 max-w-44 shrink overflow-hidden bg-surface-muted text-muted-foreground`}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={UserIcon}
            size={14}
            strokeWidth={1.8}
          />
          <span className="truncate">
            负责人：{ticket.assignee?.displayName ?? "未分配"}
          </span>
        </span>
      </div>

      <p className="text-xs text-muted-foreground/75 pt-2.5">
        {ticket.createdBy?.displayName ??
          (ticket.sourceType === "ai" ? "AI" : "未知用户")} 创建，更新于{" "}
        {formatInsightTime(ticket.updatedAt)}
      </p>
    </article>
  );
}

function TicketActionsMenu({
  onAction,
  pending,
  ticket,
}: {
  onAction: (action: "claim" | TicketStatus) => void;
  pending: boolean;
  ticket: Ticket;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="更多工单操作"
          className="size-8 shrink-0 p-0"
          disabled={pending}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={MoreHorizontalIcon}
            size={17}
            strokeWidth={1.8}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ticket.canClaim ? (
          <DropdownMenuItem onSelect={() => onAction("claim")}>
            分配给我
          </DropdownMenuItem>
        ) : null}
        {ticket.canEdit && ticket.status === "open" && ticket.assignee ? (
          <DropdownMenuItem onSelect={() => onAction("in_progress")}>
            开始处理
          </DropdownMenuItem>
        ) : null}
        {ticket.canEdit &&
        (ticket.status === "open" || ticket.status === "in_progress") ? (
          <>
            <DropdownMenuItem onSelect={() => onAction("done")}>
              标记为已解决
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("canceled")}>
              关闭工单
            </DropdownMenuItem>
          </>
        ) : null}
        {ticket.canEdit &&
        (ticket.status === "done" || ticket.status === "canceled") ? (
          <DropdownMenuItem onSelect={() => onAction("open")}>
            重新打开
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function isErrorCode(value: unknown, code: string) {
  return Boolean(
    value
    && typeof value === "object"
    && "code" in value
    && value.code === code,
  );
}
