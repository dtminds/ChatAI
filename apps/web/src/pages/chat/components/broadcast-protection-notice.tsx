import { useEffect, useRef, useState } from "react";
import type { WorkbenchBroadcastProtectionStatusDto } from "@chatai/contracts";
import {
  ArrowRight01Icon,
  Clock01Icon,
  Refresh03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BroadcastProtectionRefreshResult } from "@/pages/chat/broadcast-protection/broadcast-protection-store";
import { formatBroadcastProtectionEta } from "@/pages/chat/lib/broadcast-protection";

type BroadcastProtectionNoticeProps = {
  compact?: boolean;
  onInactive?: () => void;
  onRefresh: () => Promise<BroadcastProtectionRefreshResult>;
  status: WorkbenchBroadcastProtectionStatusDto;
};

type DetailState = "error" | "idle" | "loading" | "ready";

export function BroadcastProtectionNotice({
  compact = false,
  onInactive,
  onRefresh,
  status,
}: BroadcastProtectionNoticeProps) {
  const [detailState, setDetailState] = useState<DetailState>("idle");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const detailRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      detailRequestIdRef.current += 1;
    },
    [],
  );

  const refreshDetails = async () => {
    const requestId = ++detailRequestIdRef.current;
    setDetailState("loading");
    setIsDialogOpen(true);

    try {
      const result = await onRefresh();

      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      if (result.kind === "inactive") {
        setIsDialogOpen(false);
        setDetailState("idle");
        onInactive?.();
        return;
      }

      setDetailState(result.kind === "active" ? "ready" : "error");
    } catch {
      if (detailRequestIdRef.current === requestId) {
        setDetailState("error");
      }
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);

    if (!open) {
      detailRequestIdRef.current += 1;
      setDetailState("idle");
    }
  };

  const trigger = compact ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="群发保护已激活，查看详情"
            className="size-9 rounded-[10px] p-0 text-warning shadow-none"
            onClick={() => {
              void refreshDetails();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              color="currentColor"
              icon={Clock01Icon}
              size={19}
              strokeWidth={1.9}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          群发保护已激活
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <section className="rounded-[12px] border border-warning/30 bg-warning-muted/45 p-3 text-foreground">
      <div className="flex items-start gap-2.5">
        <HugeiconsIcon
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-warning"
          color="currentColor"
          icon={Clock01Icon}
          size={19}
          strokeWidth={1.9}
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-5">群发保护已激活</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            检测到大量群发，群发内容已延后展现
          </p>
        </div>
      </div>
      <Button
        className="mt-2"
        onClick={() => {
          void refreshDetails();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        查看详情
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={ArrowRight01Icon}
          size={15}
          strokeWidth={1.8}
        />
      </Button>
    </section>
  );

  const eta = formatBroadcastProtectionEta(
    status.degradeCallbackCnt,
    status.degradeCallbackRate,
  );

  return (
    <>
      {trigger}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-[10px] bg-warning-muted/55 text-warning">
              <HugeiconsIcon
                aria-hidden="true"
                color="currentColor"
                icon={Clock01Icon}
                size={21}
                strokeWidth={1.9}
              />
            </div>
            <DialogTitle>群发消息延后显示</DialogTitle>
            <DialogDescription>
              检测到大量群发，群发内容正在排队展现
            </DialogDescription>
          </DialogHeader>

          {detailState === "loading" ? (
            <div
              className="flex items-center justify-center gap-2 py-7 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner size={16} />
              正在加载
            </div>
          ) : detailState === "error" ? (
            <div
              className="rounded-[10px] border border-warning/30 bg-warning-muted/35 p-3 text-sm"
              role="alert"
            >
              <p className="font-medium">预计时间暂时无法获取</p>
              <Button
                className="mt-2"
                onClick={() => {
                  void refreshDetails();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={Refresh03Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                重新获取
              </Button>
            </div>
          ) : detailState === "ready" ? (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-muted/55 p-3">
                <p className="text-sm font-semibold">
                  预计恢复：{eta ?? "暂时无法估算"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  按当前处理速度估算，实际时间可能受后续群发影响
                </p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                客服在工作台发送的消息不受影响，请勿因群发内容暂未出现而重复发送。
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button">知道了</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
