import { useState } from "react";
import type { InsightDetailResponse } from "@chatai/contracts";
import { getInsightDetail } from "./api/insights-service";

export function useInsightDetail() {
  const [detail, setDetail] = useState<InsightDetailResponse>();
  const [isOpen, setIsOpen] = useState(false);

  async function openDetail(sessionId: string) {
    setIsOpen(true);
    setDetail(await getInsightDetail(sessionId));
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setDetail(undefined);
    }
  }

  return {
    detail,
    isOpen,
    onOpenChange: handleOpenChange,
    openDetail,
  };
}
