import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  AiIdeaIcon,
  Alert01Icon,
  Analytics02Icon,
  ArrowLeft02Icon,
  ClipboardCheckIcon,
  DashboardSquare01Icon,
  DatabaseSyncIcon,
  Setting07Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const insightNavItems = [
  {
    icon: DashboardSquare01Icon,
    label: "总览",
    to: "/chat/insights",
  },
  {
    icon: ClipboardCheckIcon,
    label: "服务质检",
    to: "/chat/insights/quality",
  },
  {
    icon: Task01Icon,
    label: "待处理",
    to: "/chat/insights/follow-ups",
  },
  {
    icon: Analytics02Icon,
    label: "经营洞察",
    to: "/chat/insights/business",
  },
  {
    icon: DatabaseSyncIcon,
    label: "分析明细",
    to: "/chat/insights/records",
  },
  {
    icon: Setting07Icon,
    label: "洞察配置",
    to: "/chat/insights/settings",
  },
] as const;

export function InsightsLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-sidebar text-foreground">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
        <aside className="flex h-full min-h-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground max-lg:hidden">
          <Button
            asChild
            className="mb-5 h-10 justify-start rounded-[8px] px-2 text-[14px] font-normal text-muted-foreground hover:text-foreground"
            variant="ghost"
          >
            <Link aria-label="返回工作台" to="/chat">
              <HugeiconsIcon icon={ArrowLeft02Icon} size={20} strokeWidth={1.8} />
              <span>返回工作台</span>
            </Link>
          </Button>

          <div className="mb-5 flex items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
              <HugeiconsIcon icon={AiIdeaIcon} size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold">会话洞察</div>
            </div>
          </div>

          <nav aria-label="会话洞察导航" className="space-y-1">
            {insightNavItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex h-9 items-center gap-2 rounded-[8px] px-3 text-[14px] transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
                end={item.to === "/chat/insights"}
                key={item.to}
                to={item.to}
              >
                <HugeiconsIcon icon={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="h-full min-h-0 overflow-hidden rounded-[14px_0_0_14px] bg-surface shadow max-lg:rounded-none">
          <div className="flex h-full min-h-0 flex-col">
            <header className="border-b bg-background/90 px-7 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={Alert01Icon} size={14} />
                    质检结果用于主管辅助复核
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal">{title}</h1>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-[8px] border bg-background px-3 py-1.5">
                    今日 00:00 至当前
                  </span>
                  <span className="rounded-[8px] border bg-background px-3 py-1.5">
                    当前洞察
                  </span>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1360px] px-7 py-6">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function InsightsPlaceholder({ title }: { title: string }) {
  return (
    <InsightsLayout title={title}>
      <div className="flex min-h-[420px] items-center justify-center rounded-[8px] border border-dashed bg-background">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Analytics02Icon} size={22} />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">后续版本接入</p>
        </div>
      </div>
    </InsightsLayout>
  );
}
