import { useRef, useState } from "react";
import type { InsightActionStatus, InsightDetailResponse } from "@chatai/contracts";
import { getInsightDetail, updateInsightActionStatus } from "./api/insights-service";

type DetailActionStatus = Extract<InsightActionStatus, "done" | "dismissed" | "open">;

export function useInsightDetail() {
  const [detail, setDetail] = useState<InsightDetailResponse>();
  const [error, setError] = useState<Error>();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  async function openDetail(sessionId: string) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsOpen(true);
    setIsLoading(true);
    setError(undefined);
    setDetail(undefined);

    try {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
      if (requestIdRef.current !== requestId) {
        return;
      }

      const nextDetail = await getInsightDetail(sessionId);

      if (requestIdRef.current === requestId) {
        setDetail(nextDetail);
      }
    } catch (nextError) {
      if (requestIdRef.current === requestId) {
        setError(nextError instanceof Error ? nextError : new Error("洞察详情加载失败"));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      requestIdRef.current += 1;
      setDetail(undefined);
      setError(undefined);
      setIsLoading(false);
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
    onOpenChange: handleOpenChange,
    openDetail,
    updateActionStatus,
  };
}
