import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApplicationScopePanel } from "./agent-management-application-scope";
import { mockAgents } from "./agent-management-mock-data";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

export function AgentHostingSettingsPage() {
  const navigate = useNavigate();
  const [agents] = useState(mockAgents);

  function handleGoToAddAgent() {
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <AiHostingLayout title="托管设置">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="配置企微账号关联的 Agent 和托管能力"
          title="托管设置"
        />

        <ApplicationScopePanel agents={agents} onGoToAddAgent={handleGoToAddAgent} />
      </div>
    </AiHostingLayout>
  );
}
