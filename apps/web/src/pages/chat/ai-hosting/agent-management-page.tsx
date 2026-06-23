import { useEffect, useState } from "react";
import type { AiHostingAgentListItem } from "@chatai/contracts";
import { Link } from "react-router-dom";
import { Add01Icon, Book04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { isRequestError } from "@/lib/request";
import {
  listAiHostingAgents,
  removeAiHostingAgent,
} from "./agent-service";
import { AgentModelBadge } from "./agent-model-badge";
import {
  AgentOverviewSection,
  type AgentMetric,
  type AgentStatsPeriod,
} from "./agent-management-overview";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

type AgentRecord = AiHostingAgentListItem;

const AGENT_PAGE_SIZE = 10;

const emptyAgentMetrics: AgentMetric[] = [
  { key: "totalSessions", label: "会话总数", value: 0, changePercent: 0 },
  { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 0, changePercent: 0 },
  { key: "totalMessages", label: "发送消息总数", value: 0, changePercent: 0 },
  { key: "aiMessages", label: "AI 发送消息数", value: 0, changePercent: 0 },
  { key: "humanMessages", label: "人工发送消息数", value: 0, changePercent: 0 },
];

export function AgentManagementPage() {
  const [statsPeriod, setStatsPeriod] = useState<AgentStatsPeriod>("today");
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAgents, setTotalAgents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [removeTarget, setRemoveTarget] = useState<AgentRecord | null>(null);
  const [removing, setRemoving] = useState(false);

  const metrics = emptyAgentMetrics;
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: AGENT_PAGE_SIZE,
    total: totalAgents,
  });

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await listAiHostingAgents({
          page: activePage,
          pageSize: AGENT_PAGE_SIZE,
          query: agentSearchQuery,
        });

        if (ignore) {
          return;
        }

        setAgents(response.agents);
        setTotalAgents(response.pagination.total);
      } catch (error) {
        if (ignore) {
          return;
        }

        setAgents([]);
        setTotalAgents(0);
        setErrorMessage(isRequestError(error) ? error.message : "Agent列表加载失败");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadAgents();

    return () => {
      ignore = true;
    };
  }, [activePage, agentSearchQuery]);

  async function handleRemoveConfirm() {
    if (!removeTarget) {
      return;
    }

    setRemoving(true);
    setErrorMessage("");

    try {
      await removeAiHostingAgent(removeTarget.id);
      setRemoveTarget(null);
      const response = await listAiHostingAgents({
        page: activePage,
        pageSize: AGENT_PAGE_SIZE,
        query: agentSearchQuery,
      });
      setAgents(response.agents);
      setTotalAgents(response.pagination.total);
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "删除Agent失败");
    } finally {
      setRemoving(false);
    }
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

          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <AgentTable agents={agents} loading={loading} onRemove={setRemoveTarget} />
          <TablePagination
            onPageChange={setCurrentPage}
            page={activePage}
            total={totalAgents}
            totalPages={totalPages}
          />
        </section>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        open={Boolean(removeTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除Agent？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该Agent将不再出现在管理列表中
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={removing} onClick={handleRemoveConfirm}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiHostingLayout>
  );
}

function AgentTable({
  agents,
  loading,
  onRemove,
}: {
  agents: AgentRecord[];
  loading: boolean;
  onRemove: (agent: AgentRecord) => void;
}) {
  return (
    <section>
      <Table aria-label="Agent列表">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-[22%]">Agent名称</TableHead>
            <TableHead className="h-11 w-[18%]">大模型</TableHead>
            <TableHead className="h-11">关联知识库</TableHead>
            <TableHead className="h-11 w-[120px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell className="py-10 text-center" colSpan={4}>
                <div
                  aria-label="正在加载Agent列表"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  <span>正在加载Agent列表</span>
                </div>
              </TableCell>
            </TableRow>
          ) : agents.length === 0 ? (
            <TableRow>
              <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={4}>
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="py-4 font-medium text-foreground">{agent.name}</TableCell>
                <TableCell className="py-4 text-muted-foreground">
                  <AgentModelBadge label={agent.model.label} model={agent.model.model} />
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-muted-foreground">-</span>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                      <Link to={`/chat/ai-hosting/agents/${agent.id}`}>编辑</Link>
                    </Button>
                    <Button
                      className="h-auto p-0 text-primary"
                      onClick={() => onRemove(agent)}
                      type="button"
                      variant="link"
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
