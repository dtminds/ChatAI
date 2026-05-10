import {
  AccountSetting01Icon,
  ArrowLeft02Icon,
  Configuration01Icon,
  Layers01Icon,
  PaintBrush02Icon,
  ShieldUserIcon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountsSettingsPage } from "@/pages/chat/settings/pages/accounts-settings-page";
import { AppearanceSettingsPage } from "@/pages/chat/settings/pages/appearance-settings-page";
import { ReceptionWorkflowSettingsPage } from "@/pages/chat/settings/pages/reception-workflow-settings-page";
import { RolePermissionSettingsPage } from "@/pages/chat/settings/pages/role-permission-settings-page";
import { SubAccountsSettingsPage } from "@/pages/chat/settings/pages/sub-accounts-settings-page";
import { UiComponentDemoPage } from "@/pages/chat/settings/pages/ui-component-demo-page";

const settingsSections = [
  {
    id: "accounts",
    label: "托管账号",
    path: "/chat/settings",
    icon: AccountSetting01Icon,
  },
  {
    id: "sub-accounts",
    label: "子账号管理",
    path: "/chat/settings/sub-accounts",
    icon: UserSettings01Icon,
  },
  {
    id: "roles",
    label: "权限角色",
    path: "/chat/settings/roles",
    icon: ShieldUserIcon,
  },
  {
    id: "workflow",
    label: "接待配置",
    path: "/chat/settings/workflow",
    icon: Configuration01Icon,
  },
  {
    id: "appearance",
    label: "外观",
    path: "/chat/settings/appearance",
    icon: PaintBrush02Icon,
  },
  {
    id: "ui-kit",
    label: "组件示例",
    path: "/chat/settings/ui-kit",
    icon: Layers01Icon,
  },
] as const;

type SettingsSectionId = (typeof settingsSections)[number]["id"];

function isSettingsSectionId(id: string): id is SettingsSectionId {
  return settingsSections.some((section) => section.id === id);
}

export function ChatSettingsPage() {
  const { sectionId } = useParams();
  const activeSectionId = sectionId ?? "accounts";

  if (!isSettingsSectionId(activeSectionId)) {
    return <Navigate replace to="/chat/settings" />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-sidebar">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden">
        <SettingsSidebar activeSectionId={activeSectionId} />

        <main className="h-full min-h-0 overflow-hidden rounded-[14px_0_0_14px] bg-surface pl-0 shadow">
          <div className="h-full min-h-0 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-8 py-8">
              <SettingsContent sectionId={activeSectionId} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SettingsContent({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case "accounts":
      return <AccountsSettingsPage />;
    case "sub-accounts":
      return <SubAccountsSettingsPage />;
    case "roles":
      return <RolePermissionSettingsPage />;
    case "workflow":
      return <ReceptionWorkflowSettingsPage />;
    case "appearance":
      return <AppearanceSettingsPage />;
    case "ui-kit":
      return <UiComponentDemoPage />;
  }
}

function SettingsSidebar({
  activeSectionId,
}: {
  activeSectionId: SettingsSectionId;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar px-4 py-5 text-sidebar-foreground">
      <Button
        asChild
        className="mb-6 h-10 justify-start rounded-[8px] px-2 text-[14px] font-normal text-muted-foreground hover:text-foreground"
        variant="ghost"
      >
        <Link aria-label="返回应用" to="/chat">
          <HugeiconsIcon
            color="currentColor"
            icon={ArrowLeft02Icon}
            size={20}
            strokeWidth={1.8}
          />
          <span>返回应用</span>
        </Link>
      </Button>

      <nav aria-label="设置菜单" className="space-y-1">
        {settingsSections.map((section) => {
          const isActive = section.id === activeSectionId;

          return (
            <NavLink
              className={cn(
                "flex h-9 items-center gap-2 rounded-[8px] px-3 text-[14px] text-foreground transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              key={section.id}
              to={section.path}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={section.icon}
                size={18}
              />
              <span>{section.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
