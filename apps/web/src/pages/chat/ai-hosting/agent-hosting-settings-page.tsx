import { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { GroupChatHostingSettingsTab } from "./group-chat-hosting-settings-tab";
import { SingleChatHostingSettingsTab } from "./single-chat-hosting-settings-tab";

type HostingScopeTab = "group" | "single";

const hostingScopeTabs: Array<{ label: string; value: HostingScopeTab }> = [
  { label: "单聊托管", value: "single" },
  { label: "群聊托管", value: "group" },
];

export function AgentHostingSettingsPage() {
  const [activeTab, setActiveTab] = useState<HostingScopeTab>("single");

  return (
    <AiHostingLayout title="托管设置">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="配置托管账号关联的 Agent 和托管策略"
          title="托管设置"
        />

        <SegmentedControl
          aria-label="托管范围"
          className="h-auto gap-0.5 rounded-[8px] border border-border bg-surface-muted p-1"
          onValueChange={(value) => {
            if (value) {
              setActiveTab(value as HostingScopeTab);
            }
          }}
          type="single"
          value={activeTab}
        >
          {hostingScopeTabs.map((tab) => (
            <SegmentedControlItem
              className="h-8 min-w-[88px] w-auto rounded-[6px] px-4 text-sm data-[state=on]:shadow-none"
              key={tab.value}
              value={tab.value}
            >
              {tab.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        {activeTab === "single" ? <SingleChatHostingSettingsTab /> : <GroupChatHostingSettingsTab />}
      </div>
    </AiHostingLayout>
  );
}
