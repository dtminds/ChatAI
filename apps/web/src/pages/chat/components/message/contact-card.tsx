import { UserIcon, WechatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ContactCardMessageContent } from "@/pages/chat/chat-types";

type ContactCardMessageCardProps = {
  content: ContactCardMessageContent;
};

export function ContactCardMessageCard({ content }: ContactCardMessageCardProps) {
  const company = content.company || "微信";
  const sourceLabel = content.sourceLabel || "个人名片";

  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3 pb-1.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium leading-5 text-muted-foreground">
        <HugeiconsIcon
          aria-hidden="true"
          className="text-wechat-brand"
          icon={WechatIcon}
          size={16}
        />
        <span className="line-clamp-1">{company}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-foreground">
          {content.name}
        </p>
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-muted text-muted-foreground"
          data-testid="contact-card-avatar-frame"
          style={{ height: 48, width: 48 }}
        >
          {content.avatarUrl ? (
            <img
              alt={content.name}
              className="block object-cover"
              height={48}
              loading="lazy"
              src={content.avatarUrl}
              style={{ height: "48px", width: "48px" }}
              width={48}
            />
          ) : (
            <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.8} />
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-divider pt-2 text-[12px] leading-5 text-muted-foreground">
        {sourceLabel}
      </div>
    </div>
  );
}
