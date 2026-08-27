import {
  Add01Icon,
  AlertCircleIcon,
  ChartAreaIcon,
  DashboardSpeed02Icon,
  HelpCircleIcon,
  PlayCircle02Icon,
  RefreshIcon,
  Search01Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { WorkflowTenantOverview } from "@chatai/contracts";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useDebouncedValue } from "@/pages/chat/hooks/use-debounced-value";
import {
  AiHostingLayout,
  AiHostingPageHeader,
} from "../ai-hosting/ai-hosting-layout";
import {
  getWorkflowDraftRepository,
} from "./workflow-draft-service";
import type {
  WorkflowDraftRepository,
  WorkflowListItem,
} from "./workflow-draft-service";
import {
  normalizeWorkflowRepositoryError,
  useWorkflowCapacityResource,
  useWorkflowListResource,
  useWorkflowTenantOverviewResource,
} from "./workflow-resources";
import {
  WorkflowDeleteDialog,
  WorkflowListTable,
  type WorkflowLifecycleAction,
  WorkflowListState,
  WorkflowStopDialog,
} from "./workflow-list-components";
import {
  WorkflowCreateDialog,
  type WorkflowCreateInput,
} from "./workflow-create-dialog";
import { getWorkflowLifecycleErrorMessage } from "./workflow-error-messages";
import { WorkflowMetadataDialog, type WorkflowMetadata } from "./workflow-metadata-dialog";

export function WorkflowPage({ repository }: { repository?: WorkflowDraftRepository } = {}) {
  return <WorkflowListPage repository={repository} />;
}

type WorkflowStatusFilter = "all" | "active" | "ready" | "draft" | "stopped";

const workflowStatusFilters: Array<{ label: string; value: WorkflowStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "运行中", value: "active" },
  { label: "未启用", value: "ready" },
  { label: "草稿", value: "draft" },
  { label: "已停止", value: "stopped" },
];

const workflowListPageSize = 10;

type WorkflowListPaginationState = {
  cursors: Array<string | undefined>;
  filterKey: string;
  page: number;
};

export function WorkflowListPage({
  repository = getWorkflowDraftRepository(),
}: {
  repository?: WorkflowDraftRepository;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const listFilterKey = JSON.stringify([debouncedQuery, statusFilter]);
  const [pagination, setPagination] = useState<WorkflowListPaginationState>({
    cursors: [undefined],
    filterKey: listFilterKey,
    page: 1,
  });
  const paginationMatchesFilter = pagination.filterKey === listFilterKey;
  const page = paginationMatchesFilter ? pagination.page : 1;
  const cursor = paginationMatchesFilter ? pagination.cursors[page - 1] : undefined;
  const listInput = useMemo(() => ({
    cursor,
    limit: workflowListPageSize,
    query: debouncedQuery || undefined,
    status: statusFilter,
  }), [cursor, debouncedQuery, statusFilter]);
  const { items, nextCursor, reload, status } = useWorkflowListResource(repository, listInput);
  const capacity = useWorkflowCapacityResource(repository);
  const tenantOverview = useWorkflowTenantOverviewResource(repository);
  const navigate = useNavigate();
  const createRequestIdRef = useRef<string | null>(null);
  const [metadataTarget, setMetadataTarget] = useState<WorkflowListItem | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  const [stopTarget, setStopTarget] = useState<WorkflowListItem | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [lifecyclePendingId, setLifecyclePendingId] = useState<string | null>(null);
  useEffect(() => {
    setPagination(current => current.filterKey === listFilterKey
      ? current
      : { cursors: [undefined], filterKey: listFilterKey, page: 1 });
  }, [listFilterKey]);

  const openMetadataDialog = (workflow: WorkflowListItem) => {
    setOperationError(null);
    setMetadataTarget(workflow);
  };

  const createWorkflow = async (input: WorkflowCreateInput) => {
    if (operationPending) return false;

    setOperationPending(true);
    setOperationError(null);
    createRequestIdRef.current ??= createWorkflowCreateRequestId();

    try {
      const document = await Promise.resolve(repository.createDocument({
        clientRequestId: createRequestIdRef.current,
        ...input,
      }));
      setCreateDialogOpen(false);
      createRequestIdRef.current = null;
      navigate(`/chat/workflows/${document.id}`);
      return true;
    }
    catch (error) {
      setOperationError(getWorkflowOperationErrorMessage(error));
    }
    finally {
      setOperationPending(false);
    }
    return false;
  };

  const updateWorkflowMetadata = async (metadata: WorkflowMetadata) => {
    if (!metadataTarget || operationPending) return false;

    setOperationPending(true);
    setOperationError(null);

    try {
      await Promise.resolve(repository.updateDocumentMetadata(metadataTarget.id, metadata));
      setMetadataTarget(null);
      await reload();
      return true;
    }
    catch (error) {
      setOperationError(getWorkflowOperationErrorMessage(error));
    }
    finally {
      setOperationPending(false);
    }
    return false;
  };

  const deleteWorkflow = async () => {
    if (!deleteTarget || operationPending) {
      return;
    }

    setOperationPending(true);
    setOperationError(null);

    try {
      await Promise.resolve(repository.deleteDocument(deleteTarget.id));
      setDeleteTarget(null);
      if (page > 1 && items.length === 1) {
        setPagination(current => ({
          cursors: current.filterKey === listFilterKey ? current.cursors : [undefined],
          filterKey: listFilterKey,
          page: page - 1,
        }));
      } else {
        await reload();
      }
      await tenantOverview.reload();
    }
    catch (error) {
      setOperationError(getWorkflowOperationErrorMessage(error));
    }
    finally {
      setOperationPending(false);
    }
  };

  const changeWorkflowLifecycle = async (
    workflow: WorkflowListItem,
    action: WorkflowLifecycleAction,
  ) => {
    if (lifecyclePendingId) return false;
    if (action === "enable" && workflow.publishedRevision === null) {
      toast.error("请先在编辑页发布当前草稿");
      return false;
    }
    const operation = {
      enable: repository.enableDocument,
      pause: repository.pauseDocument,
      resume: repository.resumeDocument,
      stop: repository.stopDocument,
    }[action];

    if (!operation) {
      toast.error("操作失败，请稍后重试");
      return false;
    }

    setLifecyclePendingId(workflow.id);
    try {
      await Promise.resolve(operation(workflow.id));
      await Promise.all([reload(), tenantOverview.reload()]);
      toast.success(getWorkflowLifecycleSuccessMessage(action));
      return true;
    }
    catch (error) {
      toast.error(getWorkflowLifecycleErrorMessage(action, error));
      return false;
    }
    finally {
      setLifecyclePendingId(null);
    }
  };

  return (
    <AiHostingLayout title="Workflow">
      <section className="space-y-5">
        <AiHostingPageHeader
          description="管理营销旅程"
          title="工作流"
        />

        <WorkflowTenantDataSection
          capacity={capacity}
          overview={tenantOverview.overview}
          overviewStatus={tenantOverview.status}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            className="w-auto"
            onValueChange={(value) => setStatusFilter(value as WorkflowStatusFilter)}
            value={statusFilter}
          >
            <TabsList className="h-10 rounded-[8px] bg-muted p-1">
              {workflowStatusFilters.map(filter => (
                <TabsTrigger
                  className="h-8 min-w-24 rounded-[6px] px-4 py-0 text-sm"
                  key={filter.value}
                  value={filter.value}
                >
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-[280px] max-w-full">
            <HugeiconsIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={17}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索 Workflow"
              className="h-10 rounded-[8px] pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 Workflow"
              value={query}
            />
          </div>
          <Button
            className="h-10 px-4"
            onClick={() => {
              setOperationError(null);
              setCreateDialogOpen(true);
            }}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={17} strokeWidth={1.8} />
            新建 Workflow
          </Button>
        </div>

        {status === "error" ? (
          <WorkflowListState
            onRetry={() => void reload()}
            title="工作流列表加载失败"
          />
        ) : null}

        {status !== "error" ? (
          <WorkflowListTable
            loading={status === "loading" && items.length === 0}
            onDelete={(workflow) => {
              setOperationError(null);
              setDeleteTarget(workflow);
            }}
            onLifecycleAction={(workflow, action) => {
              if (action === "stop") {
                setStopTarget(workflow);
                return;
              }
              void changeWorkflowLifecycle(workflow, action);
            }}
            onRename={openMetadataDialog}
            operationPendingId={lifecyclePendingId}
            workflows={items}
          />
        ) : null}

        {status === "ready" && (page > 1 || nextCursor) ? (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (page <= 1) return;
                    setPagination(current => ({
                      cursors: current.filterKey === listFilterKey ? current.cursors : [undefined],
                      filterKey: listFilterKey,
                      page: page - 1,
                    }));
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive onClick={event => event.preventDefault()}>
                  {page}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  aria-disabled={!nextCursor}
                  className={!nextCursor ? "pointer-events-none opacity-50" : undefined}
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (!nextCursor) return;
                    setPagination(current => {
                      const cursors = current.filterKey === listFilterKey
                        ? [...current.cursors]
                        : [undefined];
                      cursors[page] = nextCursor;
                      return {
                        cursors,
                        filterKey: listFilterKey,
                        page: page + 1,
                      };
                    });
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </section>

      <WorkflowMetadataDialog
        error={operationError}
        metadata={{
          description: metadataTarget?.description ?? "",
          name: metadataTarget?.name ?? "",
        }}
        onOpenChange={(open) => {
          if (!open && !operationPending) {
            setMetadataTarget(null);
            setOperationError(null);
          }
        }}
        onSave={updateWorkflowMetadata}
        open={Boolean(metadataTarget)}
        pending={operationPending}
      />

      <WorkflowCreateDialog
        error={operationError}
        onCreate={createWorkflow}
        onOpenChange={(open) => {
          if (!operationPending) {
            setCreateDialogOpen(open);
            if (!open) {
              createRequestIdRef.current = null;
              setOperationError(null);
            }
          }
        }}
        onWorkflowTypeChange={() => {
          createRequestIdRef.current = null;
        }}
        open={createDialogOpen}
        pending={operationPending}
      />

      <WorkflowDeleteDialog
        error={operationError}
        onDelete={() => void deleteWorkflow()}
        onOpenChange={(open) => {
          if (!open && !operationPending) {
            setDeleteTarget(null);
            setOperationError(null);
          }
        }}
        open={Boolean(deleteTarget)}
        pending={operationPending}
      />

      <WorkflowStopDialog
        onOpenChange={(open) => {
          if (!open && !lifecyclePendingId) setStopTarget(null);
        }}
        onStop={() => {
          if (!stopTarget) return;
          void changeWorkflowLifecycle(stopTarget, "stop").then((stopped) => {
            if (stopped) setStopTarget(null);
          });
        }}
        open={Boolean(stopTarget)}
        pending={Boolean(stopTarget && lifecyclePendingId === stopTarget.id)}
      />
    </AiHostingLayout>
  );
}

const workflowCapacitySegmentCount = 12;

function WorkflowTenantDataSection({
  capacity,
  overview,
  overviewStatus,
}: {
  capacity: ReturnType<typeof useWorkflowCapacityResource>;
  overview: WorkflowTenantOverview | null;
  overviewStatus: ReturnType<typeof useWorkflowTenantOverviewResource>["status"];
}) {
  return (
    <div className="overflow-x-auto">
      <section
        aria-label="Workflow 数据概览"
        className="grid min-w-[960px] grid-cols-4 gap-3"
      >
        <WorkflowOverviewMetricCard
          icon={ChartAreaIcon}
          iconClassName="text-foreground"
          loading={overviewStatus === "loading" && !overview}
          secondary={overview ? formatTodayRunComparison(overview.todayRunCountChangePercent) : null}
          title="今日运行数"
          value={overview ? overview.todayRunCount.toLocaleString("zh-CN") : null}
        />
        <WorkflowOverviewMetricCard
          icon={PlayCircle02Icon}
          iconClassName="text-foreground"
          loading={overviewStatus === "loading" && !overview}
          secondary={overview ? `共 ${overview.totalWorkflowCount.toLocaleString("zh-CN")} 个` : null}
          title="已启用工作流"
          value={overview ? overview.activeWorkflowCount.toLocaleString("zh-CN") : null}
        />
        <WorkflowOverviewMetricCard
          icon={SecurityCheckIcon}
          iconClassName="text-foreground"
          loading={overviewStatus === "loading" && !overview}
          secondary={overview ? `失败 ${overview.recentFailedRunCount.toLocaleString("zh-CN")} 次` : null}
          title="近 7 日成功率"
          value={overview
            ? overview.recentSuccessRatePercent === null ? "-" : `${overview.recentSuccessRatePercent}%`
            : null}
        />
        <WorkflowCapacityIndicator
          onRetry={() => void capacity.reload()}
          overview={capacity.overview}
          status={capacity.status}
        />
      </section>
    </div>
  );
}

function WorkflowOverviewMetricCard({
  icon,
  iconClassName,
  loading,
  secondary,
  title,
  value,
}: {
  icon: typeof ChartAreaIcon;
  iconClassName: string;
  loading: boolean;
  secondary: ReactNode;
  title: string;
  value: string | null;
}) {
  return (
    <article className="flex min-h-[132px] flex-col rounded-[10px] border border-border/70 bg-surface p-4">
      <WorkflowOverviewLabel icon={icon} iconClassName={iconClassName} title={title} />
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-muted-foreground" role="status">
          <Spinner size={16} />
          <span className="text-sm">正在加载</span>
        </div>
      ) : (
        <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value ?? "-"}</div>
      )}
      {!loading && secondary ? (
        <div className="mt-auto pt-3 text-xs text-muted-foreground">{secondary}</div>
      ) : null}
    </article>
  );
}

function formatTodayRunComparison(changePercent: number | null) {
  if (changePercent === null) return "昨日暂无可比数据";
  if (changePercent === 0) return "与昨日持平";
  return `${changePercent > 0 ? "↑" : "↓"} ${Math.abs(changePercent)}% 较昨日`;
}

function WorkflowCapacityIndicator({
  onRetry,
  overview,
  status,
}: {
  onRetry(): void;
  overview: ReturnType<typeof useWorkflowCapacityResource>["overview"];
  status: ReturnType<typeof useWorkflowCapacityResource>["status"];
}) {
  const shellClassName = "flex min-h-[132px] flex-col rounded-[10px] border border-border/70 bg-surface p-4";

  if (status === "loading" && !overview) {
    return (
      <section aria-label="SOP 客户容量" className={shellClassName}>
        <WorkflowCapacityLabel className="text-muted-foreground" iconClassName="text-foreground" />
        <div className="mt-5 flex items-center gap-3">
          <div className="flex min-w-[115px] shrink-0 items-center gap-[5px]" aria-hidden="true">
            {Array.from({ length: workflowCapacitySegmentCount }, (_, index) => (
              <span className="h-5 w-[5px] shrink-0 rounded-full bg-muted-foreground/20" key={index} />
            ))}
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground" role="status">正在加载</span>
        </div>
      </section>
    );
  }
  if (status === "error" || !overview) {
    return (
      <section aria-label="SOP 客户容量" className={shellClassName}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HugeiconsIcon icon={AlertCircleIcon} size={17} strokeWidth={1.8} />
            <span className="whitespace-nowrap">容量暂不可用</span>
          </div>
          <Button
            aria-label="重新加载容量"
            className="size-7"
            onClick={onRetry}
            size="icon"
            title="重新加载容量"
            variant="ghost"
          >
            <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.8} />
          </Button>
        </div>
      </section>
    );
  }

  const usagePercent = Math.min(Math.max(overview.usagePercent, 0), 100);
  const availablePercent = 100 - usagePercent;
  const filledSegments = usagePercent === 0
    ? 0
    : Math.ceil(usagePercent / 100 * workflowCapacitySegmentCount);
  const capacityTone = getWorkflowCapacityTone(usagePercent);

  return (
    <section
      aria-label="SOP 客户容量"
      className={shellClassName}
    >
      <WorkflowCapacityLabel iconClassName="text-foreground" />
      <div className="mt-5 flex items-center gap-3">
        <div
          aria-label="SOP 客户容量使用进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={usagePercent}
          className="flex min-w-[115px] shrink-0 items-center gap-[5px]"
          role="progressbar"
        >
          {Array.from({ length: workflowCapacitySegmentCount }, (_, index) => (
            <span
              aria-hidden="true"
              className={cn(
                "h-5 w-[5px] shrink-0 rounded-full",
                index < filledSegments ? capacityTone.segmentClassName : "bg-muted-foreground/20",
              )}
              key={index}
            />
          ))}
        </div>
        <span className={cn("whitespace-nowrap text-xs font-medium", capacityTone.textClassName)}>
          {availablePercent}%
        </span>
      </div>
      <p className="mt-auto pt-3 text-xs text-muted-foreground">
        今日因容量不足未进入 {overview.capacityRejectedCountToday.toLocaleString("zh-CN")} 次
      </p>
    </section>
  );
}

function WorkflowCapacityLabel({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <WorkflowOverviewLabel
      className={className}
      icon={DashboardSpeed02Icon}
      iconClassName={iconClassName}
      title="剩余用量"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="查看剩余用量说明"
              className="size-5 shrink-0 rounded-full p-0 text-muted-foreground"
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-80" side="bottom" sideOffset={6}>
            <strong>工作流并发运行容量：</strong>
            包含所有正处于执行或等待节点的客户流程。容量耗尽期间，新触发的客户将无法进入流程，建议及时结束不必要的长周期流程或联系顾问扩容
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </WorkflowOverviewLabel>
  );
}

function WorkflowOverviewLabel({
  children,
  className,
  icon,
  iconClassName,
  title,
}: {
  children?: ReactNode;
  className?: string;
  icon: typeof ChartAreaIcon;
  iconClassName?: string;
  title: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)}>
      <HugeiconsIcon
        aria-hidden="true"
        className={iconClassName}
        icon={icon}
        size={17}
        strokeWidth={1.8}
      />
      <h2 className="truncate font-medium">{title}</h2>
      {children}
    </div>
  );
}

function getWorkflowCapacityTone(usagePercent: number) {
  if (usagePercent >= 100) {
    return { segmentClassName: "bg-destructive", textClassName: "text-destructive" };
  }
  if (usagePercent >= 80) {
    return { segmentClassName: "bg-destructive", textClassName: "text-destructive" };
  }
  if (usagePercent >= 50) {
    return { segmentClassName: "bg-warning", textClassName: "text-warning" };
  }
  return { segmentClassName: "bg-success", textClassName: "text-success" };
}

function createWorkflowCreateRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getWorkflowOperationErrorMessage(error: unknown) {
  const repositoryError = normalizeWorkflowRepositoryError(error);

  if (repositoryError.code === "validation") {
    return "名称不能为空";
  }

  if (repositoryError.code === "not-found") {
    return "该 Workflow 已不存在";
  }

  return "操作失败，请稍后重试";
}

function getWorkflowLifecycleSuccessMessage(action: WorkflowLifecycleAction) {
  return {
    enable: "已启用",
    pause: "已暂停",
    resume: "已启用",
    stop: "已停止",
  }[action];
}
