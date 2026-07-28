import { useEffect, useRef, useState } from "react";
import type {
  ConversationTicketsQuery,
  ConversationTicketsResponse,
  Ticket,
  TicketStatus,
} from "@chatai/contracts";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInsightTime } from "@/pages/chat/insights/insights-utils";
import {
  claimTicket,
  getConversationTickets,
  updateTicket,
} from "@/pages/chat/tickets/api/tickets-service";

const pageSize = 20;
type TicketConversationScope = NonNullable<ConversationTicketsQuery["scope"]>;

type ConversationTicketsPanelProps = {
  conversationId: string;
  refreshKey?: number;
};

export function ConversationTicketsPanel({
  conversationId,
  refreshKey = 0,
}: ConversationTicketsPanelProps) {
  const [scope, setScope] = useState<TicketConversationScope>("conversation");
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
  const requestScope = `${conversationId}:${scope}:${page}:${refreshKey}:${reloadKey}`;
  requestScopeRef.current = requestScope;
  mutationScopeRef.current = `${conversationId}:${scope}`;

  useEffect(() => {
    setScope("conversation");
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

    void getConversationTickets(conversationId, { page, pageSize, scope })
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
  }, [conversationId, page, refreshKey, reloadKey, requestScope, scope]);

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
      if (mutationScopeRef.current === mutationScope) {
        setPage(1);
        setReloadKey((current) => current + 1);
      }
    } catch (cause) {
      if (mutationScopeRef.current === mutationScope) {
        setActionError(errorMessage(cause, "工单操作失败"));
      }
    } finally {
      if (mutationScopeRef.current === mutationScope) {
        setPendingTicketId(undefined);
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-divider px-4 py-3">
        <Tabs
          onValueChange={(value) => {
            setScope(value as TicketConversationScope);
            setPage(1);
            setResult(undefined);
            setActionError(undefined);
          }}
          value={scope}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conversation">
              当前聊天
              {scope === "conversation" && result ? (
                <span className="text-xs">{result.activeCount}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="customer">
              该客户
              {scope === "customer" && result ? (
                <span className="text-xs">{result.activeCount}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-divider">
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
    <article className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <Link
          className="min-w-0 font-medium leading-5 text-foreground hover:underline"
          to={`/chat/tickets/${ticket.ticketId}`}
        >
          <span className="mr-1 text-xs text-muted-foreground">#{ticket.ticketId}</span>
          {ticket.title}
        </Link>
        <Badge className="shrink-0" variant="outline">
          {statusText(ticket.status)}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{priorityText(ticket.priority)}</span>
        <span>{ticket.assignee?.displayName ?? "未分配"}</span>
        {ticket.dueAt ? (
          <span className={ticket.overdue ? "text-destructive" : undefined}>
            {formatInsightTime(ticket.dueAt)}
          </span>
        ) : null}
      </div>
      {ticket.canClaim || ticket.canEdit ? (
        <div className="flex flex-wrap gap-2">
          {ticket.canClaim ? (
            <Button disabled={pending} onClick={() => onAction("claim")} size="sm" variant="outline">
              分配给我
            </Button>
          ) : null}
          {ticket.canEdit && ticket.status === "open" && ticket.assignee ? (
            <Button disabled={pending} onClick={() => onAction("in_progress")} size="sm" variant="outline">
              开始处理
            </Button>
          ) : null}
          {ticket.canEdit && (ticket.status === "open" || ticket.status === "in_progress") ? (
            <>
              <Button disabled={pending} onClick={() => onAction("done")} size="sm">
                标记为已解决
              </Button>
              <Button disabled={pending} onClick={() => onAction("canceled")} size="sm" variant="ghost">
                关闭工单
              </Button>
            </>
          ) : null}
          {ticket.canEdit && (ticket.status === "done" || ticket.status === "canceled") ? (
            <Button disabled={pending} onClick={() => onAction("open")} size="sm" variant="outline">
              重新打开
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function statusText(status: TicketStatus) {
  return {
    canceled: "已取消",
    done: "已完成",
    in_progress: "处理中",
    open: "待处理",
  }[status];
}

function priorityText(priority: Ticket["priority"]) {
  return { high: "高优先级", low: "低优先级", medium: "中优先级" }[priority];
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
