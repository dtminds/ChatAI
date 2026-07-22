import { useCallback, useEffect, useState } from "react";
import type { AiHostingQuota, AiHostingQuotaOverview } from "@chatai/contracts";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  AiGenerativeIcon,
  ArrowLeft02Icon,
  AiBookIcon,
  RoboticIcon,
  TokenCircleIcon,
  UserAiIcon,
  WorkflowSquare06Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignedInAccountMenu } from "@/pages/chat/components/signed-in-account-menu";
import { useAuthStore } from "@/store/auth-store";
import {
  fetchAiHostingQuota,
  formatAiHostingQuotaOwnerKey,
  getCachedAiHostingQuota,
  subscribeAiHostingQuota,
} from "./ai-hosting-quota-store";

const agentLogoUrl = "https://b5.bokr.com.cn/dist/agent-color.svg";

const aiHostingNavItems = [
  {
    icon: RoboticIcon,
    label: "Agent",
    to: "/chat/ai-hosting/agents",
  },
  {
    icon: WorkflowSquare06Icon,
    label: "工作流",
    to: "/chat/workflows",
  },
  {
    icon: AiBookIcon,
    label: "知识库",
    to: "/chat/ai-hosting/kb",
  },
  {
    icon: UserAiIcon,
    label: "托管设置",
    to: "/chat/ai-hosting/hosting-settings",
  },
  {
    icon: TokenCircleIcon,
    label: "订阅",
    to: "/chat/ai-hosting/subscription",
  },
] as const;

const quotaRefreshEventName = "ai-hosting:quota-refresh";

export function notifyAiHostingQuotaChanged() {
  window.dispatchEvent(new Event(quotaRefreshEventName));
}

export function AiHostingLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const quotaOwnerKey = useAuthStore((state) => formatAiHostingQuotaOwnerKey(state.subUser));
  const [quota, setQuota] = useState<AiHostingQuotaOverview | null>(() =>
    getCachedAiHostingQuota(),
  );

  const refreshQuota = useCallback(
    () => fetchAiHostingQuota({ force: true }),
    [quotaOwnerKey],
  );

  useEffect(() => {
    const unsubscribe = subscribeAiHostingQuota(setQuota);

    void fetchAiHostingQuota().catch(() => {
      // Initial load failures keep the last subscribed quota state.
    });

    return unsubscribe;
  }, [quotaOwnerKey]);

  useEffect(() => {
    function handleQuotaRefresh() {
      void refreshQuota().catch(() => {
        // Keep the current cached quota visible when a background refresh fails.
      });
    }

    window.addEventListener(quotaRefreshEventName, handleQuotaRefresh);

    return () => {
      window.removeEventListener(quotaRefreshEventName, handleQuotaRefresh);
    };
  }, [refreshQuota]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-sidebar text-foreground">
      <div className="grid h-full grid-cols-[13.5rem_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
        <aside className="flex h-full min-h-0 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground max-lg:hidden">
          <Button
            asChild
            className="mb-5 h-10 justify-start rounded-[8px] px-2 text-[14px] font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            variant="ghost"
          >
            <Link aria-label="返回工作台" to="/chat">
              <HugeiconsIcon
                icon={ArrowLeft02Icon}
                size={20}
                strokeWidth={1.8}
              />
              <span>返回工作台</span>
            </Link>
          </Button>

          <div className="mb-5 flex items-center gap-1.5 px-2">
            <img
              alt=""
              aria-hidden="true"
              className="size-6 shrink-0"
              src={agentLogoUrl}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold">智能体</div>
            </div>
          </div>

          <nav aria-label="智能体导航" className="space-y-1">
            {aiHostingNavItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex h-9 items-center gap-2 rounded-[8px] px-3 text-[14px] transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
                key={item.to}
                to={item.to}
              >
                <HugeiconsIcon icon={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-3">
            <AiHostingQuotaPanel quota={quota} />
            <SignedInAccountMenu />
          </div>
        </aside>

        <main className="h-full min-h-0 overflow-hidden rounded-[14px_0_0_14px] bg-surface pl-0 shadow max-lg:rounded-none">
          <div className="h-full min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1360px] px-8 py-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AiHostingQuotaPanel({ quota }: { quota: AiHostingQuotaOverview | null }) {
  return (
    <section
      aria-label="智能体用量"
      className="rounded-[8px] border border-border/60 bg-background p-3"
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">用量</div>
        {quota ? (
          <div className="space-y-3">
            <QuotaMeter
              label="Agent"
              quota={quota.agents}
              valueLabel={formatCountQuota(quota.agents)}
            />
            <QuotaMeter
              label="知识库"
              quota={quota.kbs}
              valueLabel={formatCountQuota(quota.kbs)}
            />
            <QuotaMeter
              label="文档容量"
              quota={quota.kbDocs}
              valueLabel={formatStorageQuota(quota.kbDocs)}
            />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">正在加载</div>
        )}
      </div>
    </section>
  );
}

function QuotaMeter({
  label,
  quota,
  valueLabel,
}: {
  label: string;
  quota: AiHostingQuota;
  valueLabel: string;
}) {
  const percentage =
    quota.limit > 0 ? Math.min((quota.used / quota.limit) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-sidebar-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">{valueLabel}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function formatCountQuota(quota: AiHostingQuota) {
  return `${quota.used}/${quota.limit}`;
}

function formatStorageQuota(quota: AiHostingQuota) {
  return `${formatStorageSize(quota.used)}/${formatStorageSize(quota.limit)}`;
}

function formatStorageSize(bytes: number) {
  const megabytes = bytes / 1024 / 1024;

  if (bytes >= 1024 * 1024 * 1024) {
    return `${formatStorageNumber(bytes / 1024 / 1024 / 1024)}GB`;
  }

  if (megabytes >= 0.1) {
    return `${formatStorageNumber(megabytes)}MB`;
  }

  return "0";
}

function formatStorageNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function AiHostingPageHeader({
  actions,
  description,
  title,
  titleAriaLabel,
}: {
  actions?: ReactNode;
  description?: string;
  title: ReactNode;
  titleAriaLabel?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          aria-label={titleAriaLabel}
          className="truncate text-[22px] font-semibold leading-tight text-foreground"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function AiHostingPlaceholder({ title }: { title: string }) {
  return (
    <AiHostingLayout title={title}>
      <div className="space-y-5">
        <AiHostingPageHeader
          description="该能力将在后续版本接入，目前先保留导航入口"
          title={title}
        />
        <div className="flex min-h-[420px] items-center justify-center rounded-[8px] border border-dashed bg-background">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
              <HugeiconsIcon icon={AiGenerativeIcon} size={22} />
            </div>
            <h2 className="text-lg font-semibold">功能建设中</h2>
            <p className="mt-2 text-sm text-muted-foreground">后续版本接入</p>
          </div>
        </div>
      </div>
    </AiHostingLayout>
  );
}
