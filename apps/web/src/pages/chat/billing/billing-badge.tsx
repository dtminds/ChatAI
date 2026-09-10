import { Diamond02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useInRouterContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AI_BILLING_SUBSCRIPTION_PATH } from "./ai-credit-billing";

export function BillingBadge({ className }: { className?: string }) {
  const isInRouterContext = useInRouterContext();
  const linkClassName = cn(
    "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-lg bg-primary/10 px-1.5 text-[10px] font-bold leading-none text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
    className,
  );
  const content = (
    <>
      <HugeiconsIcon icon={Diamond02Icon} size={12} strokeWidth={1.8} />
      <span>付费</span>
    </>
  );

  if (!isInRouterContext) {
    return (
      <a
        aria-label="前往订阅页查看计费说明"
        className={linkClassName}
        href={AI_BILLING_SUBSCRIPTION_PATH}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      aria-label="前往订阅页查看计费说明"
      className={linkClassName}
      to={AI_BILLING_SUBSCRIPTION_PATH}
    >
      {content}
    </Link>
  );
}
