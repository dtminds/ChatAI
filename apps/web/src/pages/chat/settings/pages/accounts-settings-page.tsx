import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/pages/chat/settings/shared";
import { GroupChatsSettingsTab } from "@/pages/chat/settings/pages/group-chats-settings-tab";
import { WecomAccountsSettingsTab } from "@/pages/chat/settings/pages/wecom-accounts-settings-tab";

const settingsTabs = [
  { label: "企微账号", value: "wecom-accounts" },
  { label: "开通群聊", value: "group-chats" },
] as const;

export function AccountsSettingsPage() {
  return (
    <>
      <PageHeader
        description="管理企微账号与开通群聊的接待配置"
        eyebrow="SETTINGS / MANAGED ACCOUNTS"
        title="托管账号"
      />

      <Tabs className="gap-4" defaultValue="wecom-accounts">
        <div className="w-fit border-b border-divider">
          <TabsList className="h-auto w-fit justify-start gap-8 rounded-none bg-transparent p-0 text-muted-foreground">
            {settingsTabs.map((tab) => (
              <TabsTrigger
                className="min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                key={tab.value}
                value={tab.value}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent className="mt-0 space-y-0" value="wecom-accounts">
          <WecomAccountsSettingsTab />
        </TabsContent>

        <TabsContent className="mt-0 space-y-0" value="group-chats">
          <GroupChatsSettingsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
