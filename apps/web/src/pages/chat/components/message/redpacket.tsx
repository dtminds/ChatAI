import type { RedPacketMessageContent } from "@/pages/chat/chat-types";

const REDPACKET_ICON_URL = "https://b5.bokr.com.cn/dist/redpack_icon.png";

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
        className="redpacket-message-card flex items-center gap-4 rounded-[8px] px-5 py-4 text-white shadow-[0_1px_2px_var(--shadow-soft)]"
        data-testid="redpacket-message-card"
        role="img"
      >
        <img
          alt="红包图标"
          className="h-16 w-12 shrink-0 object-contain"
          loading="lazy"
          src={REDPACKET_ICON_URL}
        />
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
