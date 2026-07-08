import { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { PageHeader } from "@/pages/chat/settings/shared";
import { GroupChatsSettingsTab } from "@/pages/chat/settings/pages/group-chats-settings-tab";
import { WecomAccountsSettingsTab } from "@/pages/chat/settings/pages/wecom-accounts-settings-tab";

type AccountsSettingsTab = "group-chats" | "wecom-accounts";

const settingsTabs: Array<{ label: string; value: AccountsSettingsTab }> = [
  { label: "企微账号", value: "wecom-accounts" },
  { label: "开通群聊", value: "group-chats" },
];

export function AccountsSettingsPage() {
  const [activeTab, setActiveTab] = useState<AccountsSettingsTab>("wecom-accounts");

  return (
    <>
      <PageHeader
        description="管理企微账号与开通群聊的接待配置"
        eyebrow="SETTINGS / MANAGED ACCOUNTS"
        title="托管账号"
      />

      <div className="space-y-4">
        <SegmentedControl
          aria-label="托管账号范围"
          className="h-auto gap-0.5 rounded-[8px] border border-border bg-surface-muted p-1"
          onValueChange={(value) => {
            if (value) {
              setActiveTab(value as AccountsSettingsTab);
            }
          }}
          type="single"
          value={activeTab}
        >
          {settingsTabs.map((tab) => (
            <SegmentedControlItem
              className="h-8 min-w-[88px] w-auto rounded-[6px] px-4 text-sm data-[state=on]:shadow-none"
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        {activeTab === "wecom-accounts" ? (
          <WecomAccountsSettingsTab />
        ) : (
          <GroupChatsSettingsTab />
        )}
      </div>
    </>
  );
}
