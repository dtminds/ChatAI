import { useEffect, useRef, useState } from "react";
import type { AiHostingAgentListItem } from "@chatai/contracts";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Add01Icon, AiBookIcon, Search01Icon } from "@hugeicons/core-free-icons";
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  listAiHostingAgents,
  removeAiHostingAgent,
} from "./agent-service";
import { AgentModelBadge } from "./agent-model-badge";
import { canManageAiHostingAgents } from "./agent-permissions";
import {
  AiHostingLayout,
  AiHostingPageHeader,
  notifyAiHostingQuotaChanged,
} from "./ai-hosting-layout";
import { AiHostingIntroGuide } from "./ai-hosting-intro-guide";
import { fetchAiHostingQuota } from "./ai-hosting-quota-store";
import {
  AI_HOSTING_AGENT_QUOTA_REACHED_MESSAGE,
  AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE,
  isQuotaReached,
} from "./quota";

type AgentRecord = AiHostingAgentListItem;

const AGENT_PAGE_SIZE = 10;
const MAX_INLINE_KB_COUNT = 2;
const MAX_INLINE_KB_NAME_LENGTH = 10;
const agentKnowledgeBaseChipClassName =
  "inline-flex h-[22px] min-w-0 max-w-full items-center truncate rounded-[6px] bg-primary/10 px-1.5 text-[13px] font-normal leading-[22px] text-primary";
const agentIntroSteps = [
  {
    description: "定义 Agent 在对话中的身份、服务边界和风格",
    imageAlt: "创建 Agent 示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/agent_f1.png",
    step: "第 1 步",
    title: "创建 Agent",
  },
  {
    description: "设定 Agent 在不同业务场景和会话状态下的处理逻辑",
    imageAlt: "训练调优示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/agent_f2.png",
    step: "第 2 步",
    title: "训练调优",
  },
  {
    description: "开启托管账号的话术推荐或自动回复",
    imageAlt: "对话辅助示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/agent_f3.png",
    step: "第 3 步",
    title: "开启辅助",
  },
] as const;

export function AgentManagementPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [debouncedAgentSearchQuery, setDebouncedAgentSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAgents, setTotalAgents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [removeErrorMessage, setRemoveErrorMessage] = useState("");
  const [removeTarget, setRemoveTarget] = useState<AgentRecord | null>(null);
  const [removing, setRemoving] = useState(false);
  const [checkingQuota, setCheckingQuota] = useState(false);
  const navigate = useNavigate();
  const canManage = canManageAiHostingAgents(role);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: AGENT_PAGE_SIZE,
    total: totalAgents,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAgentSearchQuery(agentSearchQuery);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [agentSearchQuery]);

  useEffect(() => {
    let ignore = false;

    async function loadAgents() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await listAiHostingAgents({
          page: activePage,
          pageSize: AGENT_PAGE_SIZE,
          query: debouncedAgentSearchQuery,
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
        setErrorMessage(isRequestError(error) ? error.message : "Agent 列表加载失败");
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
  }, [activePage, debouncedAgentSearchQuery]);

  async function handleRemoveConfirm() {
    if (!canManage || !removeTarget) {
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
        query: debouncedAgentSearchQuery,
      });
      setAgents(response.agents);
      setTotalAgents(response.pagination.total);
      notifyAiHostingQuotaChanged();
    } catch (error) {
      setRemoveTarget(null);
      setRemoveErrorMessage(isRequestError(error) ? error.message : "删除 Agent 失败");
    } finally {
      setRemoving(false);
    }
  }

  async function handleAddAgent() {
    if (!canManage || checkingQuota) {
      return;
    }

    setCheckingQuota(true);

    try {
      const quota = await fetchAiHostingQuota({ force: true });

      if (quota && isQuotaReached(quota.agents)) {
        toast.error(AI_HOSTING_AGENT_QUOTA_REACHED_MESSAGE);
        return;
      }

      navigate("/chat/ai-hosting/agents/new");
    } catch {
      toast.error(AI_HOSTING_QUOTA_CHECK_FAILED_MESSAGE);
    } finally {
      setCheckingQuota(false);
    }
  }

  return (
    <AiHostingLayout title="Agent 管理">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="创建和管理负责客户接待的智能体"
          title="Agent 管理"
        />

        <AiHostingIntroGuide ariaLabel="Agent 使用引导" steps={agentIntroSteps} />

        <section aria-label="Agent 列表区块">
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

            <div className="flex flex-wrap items-center justify-end gap-3">
              {canManage ? (
                <Button
                  className="h-10 px-4"
                  disabled={checkingQuota}
                  onClick={() => void handleAddAgent()}
                  type="button"
                >
                  <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
                  <span>添加 Agent</span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            {!canManage ? (
              <p className="mb-3 text-sm text-muted-foreground">
                当前账号仅可查看 Agent，管理操作需管理员权限
              </p>
            ) : null}
            {errorMessage ? (
              <p className="mb-3 text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <AgentTable
              agents={agents}
              canManage={canManage}
              loading={loading}
              onRemove={setRemoveTarget}
            />
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={totalAgents}
              totalPages={totalPages}
            />
          </div>
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
            <AlertDialogTitle>确认删除 Agent？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该 Agent 将不再出现在管理列表中
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={removing} onClick={handleRemoveConfirm} variant="destructive">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemoveErrorMessage("");
          }
        }}
        open={Boolean(removeErrorMessage)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Agent 失败</AlertDialogTitle>
            <AlertDialogDescription>{removeErrorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AiHostingLayout>
  );
}

function AgentTable({
  agents,
  canManage,
  loading,
  onRemove,
}: {
  agents: AgentRecord[];
  canManage: boolean;
  loading: boolean;
  onRemove: (agent: AgentRecord) => void;
}) {
  return (
    <>
      <Table aria-label="Agent 列表">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-[22%]">Agent 名称</TableHead>
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
                  aria-label="正在加载"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Spinner aria-hidden="true" size={14} />
                  <span>正在加载</span>
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
                  <AgentKnowledgeBasePreview agentName={agent.name} kbList={agent.kbList} />
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                      <Link to={`/chat/ai-hosting/agents/${agent.id}`}>
                        {canManage ? "编辑" : "查看"}
                      </Link>
                    </Button>
                    {canManage ? (
                      <Button
                        className="h-auto p-0 text-primary"
                        onClick={() => onRemove(agent)}
                        type="button"
                        variant="link"
                      >
                        删除
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

function AgentKnowledgeBasePreview({
  agentName,
  kbList,
}: {
  agentName: string;
  kbList: AgentRecord["kbList"];
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (kbList.length === 0) {
    return <span className="text-sm text-muted-foreground">未关联</span>;
  }

  const visibleKbList = kbList.slice(0, MAX_INLINE_KB_COUNT);
  const hasOverflow = kbList.length > MAX_INLINE_KB_COUNT;

  function openPopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (hasOverflow) {
      setIsOpen(true);
    }
  }

  function scheduleClosePopover() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  }

  const content = (
    <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1.5">
      {visibleKbList.map((kb) => (
        <AgentKnowledgeBaseChip
          key={kb.id}
          name={formatInlineKnowledgeBaseName(kb.name)}
          to={getKnowledgeBaseDetailPath(kb.id)}
        />
      ))}
      {hasOverflow ? (
        <span className="shrink-0 text-sm text-muted-foreground">
          等 {kbList.length} 个
        </span>
      ) : null}
    </div>
  );

  if (!hasOverflow) {
    return content;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <div
          aria-label={`查看 ${agentName} 的全部关联知识库`}
          className="min-w-0 max-w-full"
          onBlur={scheduleClosePopover}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          role="group"
        >
          {content}
        </div>
      </PopoverAnchor>
      <AgentKnowledgeBasePopoverContent
        kbList={kbList}
        onCloseRequest={scheduleClosePopover}
        onOpenRequest={openPopover}
      />
    </Popover>
  );
}

function AgentKnowledgeBasePopoverContent({
  kbList,
  onCloseRequest,
  onOpenRequest,
}: {
  kbList: AgentRecord["kbList"];
  onCloseRequest: () => void;
  onOpenRequest: () => void;
}) {
  return (
    <PopoverContent
      align="start"
      className="w-[18rem] p-2.5"
      onBlur={onCloseRequest}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onFocus={onOpenRequest}
      onMouseEnter={onOpenRequest}
      onMouseLeave={onCloseRequest}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1.5">
          <p className="text-sm font-medium text-foreground">关联知识库 · {kbList.length}</p>
        </div>
        <ScrollArea
          className="max-h-[12rem]"
          data-testid="agent-kb-popover-scroll"
          viewportProps={{
            className: "[&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full",
          }}
        >
          <div className="w-full min-w-0 space-y-1 pr-1">
            {kbList.map((kb, index) => (
              <AgentKnowledgeBasePopoverItem
                dataTestId={`agent-kb-popover-item-${index + 1}`}
                key={kb.id}
                name={kb.name}
                to={getKnowledgeBaseDetailPath(kb.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </PopoverContent>
  );
}

function AgentKnowledgeBasePopoverItem({
  dataTestId,
  name,
  to,
}: {
  dataTestId?: string;
  name: string;
  to: string;
}) {
  return (
    <Link
      className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[8px] px-2 text-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/30"
      data-testid={dataTestId}
      title={name}
      to={to}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary"
        title="知识库图标"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={AiBookIcon}
          size={13}
          strokeWidth={1.8}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </Link>
  );
}

function AgentKnowledgeBaseChip({
  className,
  dataTestId,
  name,
  title,
  to,
}: {
  className?: string;
  dataTestId?: string;
  name: string;
  title?: string;
  to?: string;
}) {
  const content = (
    <span className="min-w-0 flex-1 truncate" title={title}>
      {name}
    </span>
  );

  if (to) {
    return (
      <Link
        className={cn(agentKnowledgeBaseChipClassName, className)}
        data-testid={dataTestId}
        to={to}
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={cn(agentKnowledgeBaseChipClassName, className)} data-testid={dataTestId}>
      {content}
    </span>
  );
}

function formatInlineKnowledgeBaseName(name: string) {
  return name.length > MAX_INLINE_KB_NAME_LENGTH
    ? `${name.slice(0, MAX_INLINE_KB_NAME_LENGTH)}..`
    : name;
}

function getKnowledgeBaseDetailPath(kbId: string) {
  return `/chat/ai-hosting/kb/${kbId}`;
}
