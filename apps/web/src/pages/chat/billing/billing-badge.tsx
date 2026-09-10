import { Diamond02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AI_BILLING_SUBSCRIPTION_PATH } from "./ai-credit-billing";

export function BillingBadge({ className }: { className?: string }) {
  return (
    <Link
      aria-label="前往订阅页查看计费说明"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[#F0EEFF] px-2 text-[10px] font-medium leading-none text-[#5B45FF] transition-colors hover:bg-[#E8E5FF] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B45FF]/15 dark:bg-[#2D2750] dark:text-[#B8AEFF] dark:hover:bg-[#37305F]",
        className,
      )}
      to={AI_BILLING_SUBSCRIPTION_PATH}
    >
      <HugeiconsIcon icon={Diamond02Icon} size={12} strokeWidth={1.8} />
      <span>付费</span>
    </Link>
  );
}
