import { useEffect, useRef, useState } from "react";
import type { WorkbenchBroadcastProtectionStatusDto } from "@chatai/contracts";
import {
  ArrowRight01Icon,
  Refresh03Icon,
  TimeQuarterPassIcon,
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

const BROADCAST_PROTECTION_ICON_URL =
  "https://b5.bokr.com.cn/dist/ui/shield-lightning.svg";
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
            className="size-9 rounded-[10px] p-0 shadow-none"
            onClick={() => {
              void refreshDetails();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <img
              alt=""
              aria-hidden="true"
              className="size-[19px]"
              src={BROADCAST_PROTECTION_ICON_URL}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          群发保护已激活
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <Button
      aria-label="群发保护已激活，查看详情"
      className="h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-[12px] border border-success/30 bg-success-muted/45 p-3 text-left text-foreground shadow-none hover:bg-success-muted/65"
      onClick={() => {
        void refreshDetails();
      }}
      type="button"
      variant="ghost"
    >
      <span className="flex w-full items-center gap-2.5">
        <img
          alt=""
          aria-hidden="true"
          className="size-[19px] shrink-0"
          src={BROADCAST_PROTECTION_ICON_URL}
        />
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-success">
          群发保护已激活
        </span>
        <HugeiconsIcon
          aria-hidden="true"
          className="shrink-0 text-success"
          color="currentColor"
          icon={ArrowRight01Icon}
          size={15}
          strokeWidth={1.8}
        />
      </span>
      <span className="mt-2 text-xs leading-5 text-muted-foreground">
        检测到大量群发，群发内容已延后展现
      </span>
    </Button>
  );

  const eta = formatBroadcastProtectionEta(
    status.degradeCallbackCnt,
    status.degradeCallbackRate,
  );

  return (
    <>
      {trigger}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="sm:max-w-xl"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-success-muted/55">
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-[21px]"
                  src={BROADCAST_PROTECTION_ICON_URL}
                />
              </div>
              <DialogTitle>群发保护模式</DialogTitle>
            </div>
          </DialogHeader>

          <section className="space-y-3 py-2 text-sm leading-6 text-muted-foreground">
            <DialogDescription className="leading-4">
              检测到消息群发，为保障客服正常收发用户消息，群发内容已延后处理
            </DialogDescription>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                客服正常接待能力已被最大限度保留
              </li>
              <li>
                群发内容会延后出现在聊天记录中，运营和客服应做好信息互通
              </li>
              <li>
                海量群发会导致客户端消息拥挤或丢失，建议尽量分批、错峰进行
              </li>
            </ul>
          </section>

          {detailState === "loading" ? (
            <div className="flex items-center gap-3 rounded-[10px] border border-info/20 bg-info/5 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info text-info-foreground">
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={TimeQuarterPassIcon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">预计恢复</p>
                <div
                  className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground"
                  role="status"
                >
                  <Spinner size={13} />
                  正在加载
                </div>
              </div>
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
            <div className="flex items-center gap-3 rounded-[10px] border border-info/20 bg-info/5 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info text-info-foreground">
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={TimeQuarterPassIcon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  预计恢复：{eta ?? "暂时无法估算"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  仅为当前估算值，实际时间受群发持续时间和群发消息量级影响
                </p>
              </div>
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
