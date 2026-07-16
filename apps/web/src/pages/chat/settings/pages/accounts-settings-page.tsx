import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const tabs = (
    <Tabs
      onValueChange={(value) => setActiveTab(value as AccountsSettingsTab)}
      value={activeTab}
    >
      <TabsList className="h-10 rounded-[8px] bg-muted p-1">
        {settingsTabs.map((tab) => (
          <TabsTrigger
            className="h-8 min-w-20 rounded-[6px] px-4 py-0 text-sm"
            key={tab.value}
            value={tab.value}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <>
      <PageHeader
        description="管理企微账号与开通群聊的接待配置"
        eyebrow="SETTINGS / MANAGED ACCOUNTS"
        title="托管账号"
      />

      <div className="space-y-4">
        {activeTab === "wecom-accounts" ? (
          <WecomAccountsSettingsTab toolbarStart={tabs} />
        ) : (
          <GroupChatsSettingsTab toolbarStart={tabs} />
        )}
      </div>
    </>
  );
}
