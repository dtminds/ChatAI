import { useRef, useState } from "react";
import type {
  InsightDetailResponse,
  InsightSessionMessagesResponse,
  TicketStatus,
} from "@chatai/contracts";
import {
  getInsightDetail,
  getInsightSessionMessages,
} from "./api/insights-service";
import { updateTicket } from "@/pages/chat/tickets/api/tickets-service";
import { toast } from "sonner";

type DetailActionStatus = Extract<TicketStatus, "canceled" | "done" | "open">;

export function useInsightDetail() {
  const [detail, setDetail] = useState<InsightDetailResponse>();
  const [error, setError] = useState<Error>();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<InsightSessionMessagesResponse["messages"]>([]);
  const [messagesError, setMessagesError] = useState<Error>();
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const requestIdRef = useRef(0);
  const sessionIdRef = useRef<string | undefined>(undefined);

  async function openDetail(sessionId: string) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    sessionIdRef.current = sessionId;
    setIsOpen(true);
    setIsLoading(true);
    setIsMessagesLoading(false);
    setError(undefined);
    setMessagesError(undefined);
    setDetail(undefined);
    setMessages([]);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    if (requestIdRef.current !== requestId) {
      return;
    }

    try {
      const nextDetail = await getInsightDetail(sessionId);

      if (requestIdRef.current !== requestId) {
        return;
      }

      setDetail(nextDetail);
      setIsLoading(false);
    } catch (nextError) {
      if (requestIdRef.current === requestId) {
        setError(nextError instanceof Error ? nextError : new Error("洞察详情加载失败"));
        setIsLoading(false);
      }
      return;
    }

    if (requestIdRef.current !== requestId) {
      return;
    }

    setIsMessagesLoading(true);

    try {
      const nextMessages = await getInsightSessionMessages(sessionId);

      if (requestIdRef.current === requestId) {
        setMessages(nextMessages.messages);
      }
    } catch (nextError) {
      if (requestIdRef.current === requestId) {
        setMessagesError(nextError instanceof Error ? nextError : new Error("本轮对话加载失败"));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsMessagesLoading(false);
      }
    }
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      requestIdRef.current += 1;
      sessionIdRef.current = undefined;
      setDetail(undefined);
      setError(undefined);
      setMessages([]);
      setMessagesError(undefined);
      setIsLoading(false);
      setIsMessagesLoading(false);
    }
  }

  async function updateActionStatus(
    ticketId: string,
    expectedStatus: TicketStatus,
    status: DetailActionStatus,
  ) {
    const requestId = requestIdRef.current;
    const sessionId = sessionIdRef.current;
    const isCurrentDetail = () =>
      sessionId != null
      && sessionIdRef.current === sessionId
      && requestIdRef.current === requestId;

    try {
      await updateTicket(ticketId, { expectedStatus, status });
      if (!isCurrentDetail()) return;
      setDetail((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          actionItems: current.actionItems.map((item) =>
            item.ticketId === ticketId ? { ...item, status } : item,
          ),
        };
      });
    } catch (cause) {
      if (!isCurrentDetail()) return;
      if (isErrorCode(cause, "TICKET_STATE_CONFLICT") && sessionId != null) {
        toast.error(cause instanceof Error ? cause.message : "工单状态已变化，请刷新后重试");
        try {
          const nextDetail = await getInsightDetail(sessionId);
          if (isCurrentDetail()) setDetail(nextDetail);
        } catch (reloadCause) {
          if (isCurrentDetail()) {
            toast.error(reloadCause instanceof Error ? reloadCause.message : "洞察详情刷新失败");
          }
        }
        return;
      }
      toast.error(cause instanceof Error ? cause.message : "待办状态更新失败");
    }
  }

  return {
    detail,
    error,
    isOpen,
    isLoading,
    isMessagesLoading,
    messages,
    messagesError,
    onOpenChange: handleOpenChange,
    openDetail,
    updateActionStatus,
  };
}

function isErrorCode(value: unknown, code: string) {
  return Boolean(
    value
    && typeof value === "object"
    && "code" in value
    && value.code === code,
  );
}
