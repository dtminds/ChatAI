import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Add01Icon, Book04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationScopePanel } from "./agent-management-application-scope";
import { AgentTable } from "./agent-management-agent-table";
import { mockAgentMetricsByPeriod, mockAgents, type AgentStatsPeriod } from "./agent-management-mock-data";
import { AgentOverviewSection } from "./agent-management-overview";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

export function AgentManagementPage() {
  const navigate = useNavigate();
  const [statsPeriod, setStatsPeriod] = useState<AgentStatsPeriod>("today");
  const [agents] = useState(mockAgents);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my-agents");

  const metrics = mockAgentMetricsByPeriod[statsPeriod];
  const filteredAgents = useMemo(() => {
    const normalizedQuery = agentSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return agents;
    }

    return agents.filter((agent) => agent.name?.toLowerCase().includes(normalizedQuery));
  }, [agentSearchQuery, agents]);

  function handleGoToAddAgent() {
    navigate("/chat/ai-hosting/agents/new");
  }

  return (
    <AiHostingLayout title="Agent 管理">
      <div className="space-y-6">
        <AiHostingPageHeader
          actions={
            <Button className="h-9 rounded-[8px] px-3 text-sm" type="button" variant="outline">
              <HugeiconsIcon icon={Book04Icon} size={16} strokeWidth={1.8} />
              <span>帮助手册</span>
            </Button>
          }
          description="创建和管理负责客户接待的智能体"
          title="Agent 管理"
        />

        <AgentOverviewSection metrics={metrics} onPeriodChange={setStatsPeriod} period={statsPeriod} />

        <Tabs onValueChange={setActiveTab} value={activeTab}>
          <TabsList aria-label="Agent列表视图" className="w-fit">
            <TabsTrigger className="min-w-0 px-4" value="my-agents">
              我的Agent
            </TabsTrigger>
            <TabsTrigger className="min-w-0 px-4" value="scope">
              应用范围
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-4 space-y-4" value="my-agents">
            <section className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-[280px]">
                <HugeiconsIcon
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  color="currentColor"
                  icon={Search01Icon}
                  size={17}
                  strokeWidth={1.8}
                />
                <Input
                  aria-label="搜索 Agent 名称"
                  className="h-10 rounded-[8px] pl-9"
                  onChange={(event) => setAgentSearchQuery(event.target.value)}
                  placeholder="搜索 Agent 名称"
                  value={agentSearchQuery}
                />
              </div>

              <Button asChild className="h-10 px-4" type="button">
                <Link to="/chat/ai-hosting/agents/new">
                  <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
                  <span>添加Agent</span>
                </Link>
              </Button>
            </section>

            <AgentTable agents={filteredAgents} />
          </TabsContent>

          <TabsContent className="mt-4 space-y-4" value="scope">
            <ApplicationScopePanel agents={agents} onGoToAddAgent={handleGoToAddAgent} />
          </TabsContent>
        </Tabs>
      </div>
    </AiHostingLayout>
  );
}
