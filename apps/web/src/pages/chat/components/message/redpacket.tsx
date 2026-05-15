import { GiftCardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RedPacketMessageContent } from "@/pages/chat/chat-types";

type RedPacketMessageCardProps = {
  content: RedPacketMessageContent;
};

export function RedPacketMessageCard({ content }: RedPacketMessageCardProps) {
  const amountLabel = formatRedPacketAmount(content.totalAmount);
  const title = content.title || "恭喜发财，大吉大利";

  return (
    <div className="w-[min(19rem,calc(100vw-7rem))]">
      <div
        aria-label={`红包：${title}，${amountLabel}`}
        className="flex items-center gap-4 rounded-[8px] bg-warning px-5 py-4 text-white shadow-[0_1px_2px_var(--shadow-soft)]"
        data-testid="redpacket-message-card"
        role="img"
      >
        <div className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-destructive text-warning">
          <div className="absolute inset-x-0 top-0 h-5 bg-destructive/70" />
          <HugeiconsIcon aria-hidden="true" icon={GiftCardIcon} size={28} strokeWidth={1.9} />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-white">
            {title}
          </p>
          <p className="text-[14px] font-medium leading-5 text-white/90">
            {amountLabel}
          </p>
        </div>
      </div>

      {content.description ? (
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {content.description}
        </p>
      ) : null}
    </div>
  );
}

function formatRedPacketAmount(totalAmount: number | undefined) {
  if (totalAmount == null || !Number.isFinite(totalAmount) || totalAmount < 0) {
    return "¥0.00";
  }

  return `¥${(totalAmount / 100).toFixed(2)}`;
}
