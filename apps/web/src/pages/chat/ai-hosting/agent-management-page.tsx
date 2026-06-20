import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Add01Icon, Book04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { AgentTable } from "./agent-management-agent-table";
import { mockAgentMetricsByPeriod, mockAgents, type AgentStatsPeriod } from "./agent-management-mock-data";
import { AgentOverviewSection } from "./agent-management-overview";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

const AGENT_PAGE_SIZE = 10;

export function AgentManagementPage() {
  const [statsPeriod, setStatsPeriod] = useState<AgentStatsPeriod>("today");
  const [agents] = useState(mockAgents);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const metrics = mockAgentMetricsByPeriod[statsPeriod];
  const filteredAgents = useMemo(() => {
    const normalizedQuery = agentSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return agents;
    }

    return agents.filter((agent) => agent.name?.toLowerCase().includes(normalizedQuery));
  }, [agentSearchQuery, agents]);
  const { activePage, endRow, startRow, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: AGENT_PAGE_SIZE,
    total: filteredAgents.length,
  });
  const pagedAgents = useMemo(() => {
    const start = (activePage - 1) * AGENT_PAGE_SIZE;
    return filteredAgents.slice(start, start + AGENT_PAGE_SIZE);
  }, [activePage, filteredAgents]);

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

        <section aria-label="Agent列表区块" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-[280px] max-w-full">
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
                onChange={(event) => {
                  setAgentSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜索 Agent 名称"
                value={agentSearchQuery}
              />
            </div>

            <Button asChild className="h-10 px-4" type="button">
              <Link to="/chat/ai-hosting/agents/new">
                <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
                <span>添加 Agent</span>
              </Link>
            </Button>
          </div>

          <AgentTable agents={pagedAgents} />
          <TablePagination
            endRow={endRow}
            onPageChange={setCurrentPage}
            page={activePage}
            startRow={startRow}
            total={filteredAgents.length}
            totalPages={totalPages}
          />
        </section>
      </div>
    </AiHostingLayout>
  );
}
