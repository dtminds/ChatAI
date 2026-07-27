import type { ReactNode } from "react";
import {
  ArrowLeft02Icon,
  CheckListIcon,
  InboxCheckIcon,
  Task01Icon,
  UserAccountIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import type { TicketView } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignedInAccountMenu } from "@/pages/chat/components/signed-in-account-menu";
import { useAuthStore } from "@/store/auth-store";

const navigation = [
  { icon: Task01Icon, label: "分配给我", view: "assigned_to_me" },
  { icon: UserAccountIcon, label: "接待工单", view: "reception" },
  { icon: InboxCheckIcon, label: "待领取", view: "unassigned" },
  { icon: CheckListIcon, label: "我创建的", view: "created_by_me" },
  { icon: UserGroupIcon, label: "全部工单", view: "all", global: true },
] as const satisfies ReadonlyArray<{
  global?: boolean;
  icon: typeof Task01Icon;
  label: string;
  view: TicketView;
}>;

export function TicketsLayout({
  children,
  unassignedCount,
}: {
  children: ReactNode;
  unassignedCount?: number;
}) {
  const role = useAuthStore((state) => state.subUser?.role);
  const [searchParams] = useSearchParams();
  const currentView = searchParams.get("view") ?? "assigned_to_me";

  return (
    <div className="fixed inset-0 overflow-hidden bg-sidebar text-foreground">
      <div className="grid h-full grid-cols-[13.5rem_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
        <aside className="flex h-full min-h-0 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground max-lg:hidden">
          <Button asChild className="mb-5 h-10 justify-start px-2 text-sm font-normal text-muted-foreground" variant="ghost">
            <Link aria-label="返回工作台" to="/chat">
              <HugeiconsIcon icon={ArrowLeft02Icon} size={20} />
              返回工作台
            </Link>
          </Button>
          <div className="mb-5 flex items-center gap-2 px-2 text-sm font-semibold">
            <HugeiconsIcon icon={Task01Icon} size={22} />
            <span>工单</span>
          </div>
          <nav aria-label="工单视图" className="space-y-1">
            {navigation.filter((item) => !("global" in item && item.global) || role === "owner" || role === "admin").map((item) => (
              <NavLink
                className={cn(
                  "flex h-9 items-center gap-2 rounded-[8px] px-3 text-sm transition-colors hover:bg-sidebar-accent",
                  currentView === item.view && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                )}
                key={item.view}
                to={`/chat/tickets?view=${item.view}`}
              >
                <HugeiconsIcon icon={item.icon} size={18} />
                <span>{item.label}</span>
                {item.view === "unassigned" && (unassignedCount ?? 0) > 0 ? (
                  <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5">{unassignedCount}</Badge>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto pt-3"><SignedInAccountMenu /></div>
        </aside>
        <main className="h-full min-h-0 overflow-y-auto rounded-[14px_0_0_14px] bg-surface shadow max-lg:rounded-none">
          <div className="mx-auto w-full max-w-[1440px] px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
