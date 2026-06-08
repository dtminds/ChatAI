import { useRef, useState } from "react";
import type {
  InsightActionStatus,
  InsightDetailResponse,
  InsightSessionMessagesResponse,
} from "@chatai/contracts";
import {
  getInsightDetail,
  getInsightSessionMessages,
  updateInsightActionStatus,
} from "./api/insights-service";

type DetailActionStatus = Extract<InsightActionStatus, "done" | "dismissed" | "open">;

export function useInsightDetail() {
  const [detail, setDetail] = useState<InsightDetailResponse>();
  const [error, setError] = useState<Error>();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<InsightSessionMessagesResponse["messages"]>([]);
  const [messagesError, setMessagesError] = useState<Error>();
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const requestIdRef = useRef(0);

  async function openDetail(sessionId: string) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
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
      setDetail(undefined);
      setError(undefined);
      setMessages([]);
      setMessagesError(undefined);
      setIsLoading(false);
      setIsMessagesLoading(false);
    }
  }

  async function updateActionStatus(actionItemId: string, status: DetailActionStatus) {
    await updateInsightActionStatus(actionItemId, status);
    setDetail((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        actionItems: current.actionItems.map((item) =>
          item.actionItemId === actionItemId ? { ...item, status } : item,
        ),
      };
    });
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
