import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isRequestError } from "@/lib/request";
import { ApplicationScopePanel } from "./agent-management-application-scope";
import { listAiHostingAgents } from "./agent-service";
import type { AgentRecord } from "./agent-management-types";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

export function AgentHostingSettingsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      try {
        const response = await listAiHostingAgents({ page: 1, pageSize: 100 });

        if (!ignore) {
          setAgents(response.agents);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(isRequestError(error) ? error.message : "Agent列表加载失败");
        }
      }
    }

    void loadAgents();

    return () => {
      ignore = true;
    };
  }, []);

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

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <ApplicationScopePanel agents={agents} onGoToAddAgent={handleGoToAddAgent} />
      </div>
    </AiHostingLayout>
  );
}
