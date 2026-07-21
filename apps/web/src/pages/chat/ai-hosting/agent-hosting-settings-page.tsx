import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { SingleChatHostingSettingsTab } from "./single-chat-hosting-settings-tab";

export function AgentHostingSettingsPage() {
  return (
    <AiHostingLayout title="托管设置">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="配置托管账号关联的 Agent 和托管策略"
          title="托管设置"
        />

        <SingleChatHostingSettingsTab />
      </div>
    </AiHostingLayout>
  );
}
