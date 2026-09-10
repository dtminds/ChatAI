import { Diamond02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useInRouterContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import "../ai-hosting/agent-module.css";
import { AI_BILLING_SUBSCRIPTION_PATH } from "./ai-credit-billing";

export function BillingBadge({ className }: { className?: string }) {
  const isInRouterContext = useInRouterContext();
  const linkClassName = cn(
    "billing-badge inline-flex h-5 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-[10px] font-bold leading-none transition-colors focus-visible:outline-none",
    className,
  );
  const content = (
    <>
      <HugeiconsIcon icon={Diamond02Icon} size={12} strokeWidth={1.8} />
      <span>AI Pro</span>
    </>
  );

  if (!isInRouterContext) {
    return (
      <a
        aria-label="前往 AI Pro 页面"
        className={linkClassName}
        href={AI_BILLING_SUBSCRIPTION_PATH}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      aria-label="前往 AI Pro 页面"
      className={linkClassName}
      to={AI_BILLING_SUBSCRIPTION_PATH}
    >
      {content}
    </Link>
  );
}
