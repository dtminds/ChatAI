import {
  Add01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  useWorkflowListResource,
} from "./workflow-resources";
import {
  WorkflowDeleteDialog,
  WorkflowListCard,
  type WorkflowLifecycleAction,
  WorkflowListState,
  WorkflowStopDialog,
} from "./workflow-list-components";
import { WorkflowMetadataDialog, type WorkflowMetadata } from "./workflow-metadata-dialog";

export function WorkflowPage({ repository }: { repository?: WorkflowDraftRepository } = {}) {
  return <WorkflowListPage repository={repository} />;
}

type WorkflowStatusFilter = "all" | "active" | "ready" | "draft" | "stopped";

const workflowStatusFilters: Array<{ label: string; value: WorkflowStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "运行中", value: "active" },
  { label: "待启用", value: "ready" },
  { label: "草稿", value: "draft" },
  { label: "已停止", value: "stopped" },
];

export function WorkflowListPage({
  repository = getWorkflowDraftRepository(),
}: {
  repository?: WorkflowDraftRepository;
}) {
  const { items, reload, status } = useWorkflowListResource(repository);
  const navigate = useNavigate();
  const createRequestIdRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const [metadataTarget, setMetadataTarget] = useState<WorkflowListItem | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  const [stopTarget, setStopTarget] = useState<WorkflowListItem | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [lifecyclePendingId, setLifecyclePendingId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => items.filter((workflow) => {
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "draft" && workflow.runtimeStatus === "inactive" && !workflow.activationReady)
      || (statusFilter === "ready" && (
        workflow.runtimeStatus === "paused"
        || (workflow.runtimeStatus === "inactive" && workflow.activationReady)
      ))
      || workflow.runtimeStatus === statusFilter;
    const matchesQuery = !normalizedQuery
      || [workflow.name, workflow.description, workflow.trigger, workflow.owner]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesQuery;
  }), [items, normalizedQuery, statusFilter]);

  const openMetadataDialog = (workflow: WorkflowListItem) => {
    setOperationError(null);
    setMetadataTarget(workflow);
  };

  const createWorkflow = async (metadata: WorkflowMetadata) => {
    if (operationPending) return false;

    setOperationPending(true);
    setOperationError(null);
    createRequestIdRef.current ??= createWorkflowCreateRequestId();

    try {
      const document = await Promise.resolve(repository.createDocument({
        clientRequestId: createRequestIdRef.current,
        ...metadata,
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
      await reload();
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
    if (action === "enable" && !workflow.activationReady) {
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
      toast.error("操作失败，请重试");
      return false;
    }

    setLifecyclePendingId(workflow.id);
    try {
      await Promise.resolve(operation(workflow.id));
      await reload();
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
          actions={(
            <Button
              className="h-9 gap-1.5 rounded-lg px-3 text-sm"
              onClick={() => {
                setOperationError(null);
                setCreateDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
              新建 Workflow
            </Button>
          )}
          description="管理营销旅程"
          title="工作流"
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
          <div className="relative w-full max-w-sm sm:w-72">
            <HugeiconsIcon
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={15}
              strokeWidth={1.8}
            />
            <Input
              aria-label="搜索 Workflow"
              className="h-8 rounded-lg pl-8 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 Workflow"
              value={query}
            />
          </div>
        </div>

        {status === "loading" && items.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner />
            <span>正在加载</span>
          </div>
        ) : null}

        {status === "error" ? (
          <WorkflowListState
            description="工作流列表加载失败"
            onRetry={() => void reload()}
            title="无法加载 Workflow"
          />
        ) : null}

        {status === "ready" && filteredItems.length === 0 ? (
          <WorkflowListState
            description={normalizedQuery || statusFilter !== "all" ? "没有匹配的 Workflow" : "创建第一个营销流程"}
            title={normalizedQuery || statusFilter !== "all" ? "暂无搜索结果" : "暂无 Workflow"}
          />
        ) : null}

        {filteredItems.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((workflow) => (
              <WorkflowListCard
                key={workflow.id}
                onDelete={() => {
                  setOperationError(null);
                  setDeleteTarget(workflow);
                }}
                onLifecycleAction={(action) => {
                  if (action === "stop") {
                    setStopTarget(workflow);
                    return;
                  }
                  void changeWorkflowLifecycle(workflow, action);
                }}
                onRename={() => openMetadataDialog(workflow)}
                operationPending={lifecyclePendingId === workflow.id}
                workflow={workflow}
              />
            ))}
          </div>
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

      <WorkflowMetadataDialog
        error={operationError}
        metadata={{ description: "", name: "" }}
        onOpenChange={(open) => {
          if (!operationPending) {
            setCreateDialogOpen(open);
            if (!open) {
              createRequestIdRef.current = null;
              setOperationError(null);
            }
          }
        }}
        onSave={createWorkflow}
        open={createDialogOpen}
        pending={operationPending}
        submitLabel="创建"
        title="新建 Workflow"
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

  return "操作失败，请重试";
}

function getWorkflowLifecycleSuccessMessage(action: WorkflowLifecycleAction) {
  return {
    enable: "已启用",
    pause: "已暂停",
    resume: "已启用",
    stop: "已停止",
  }[action];
}

function getWorkflowLifecycleErrorMessage(
  action: WorkflowLifecycleAction,
  error: unknown,
) {
  const repositoryError = normalizeWorkflowRepositoryError(error);
  if (action === "enable" && repositoryError.code === "conflict") {
    return "请先在编辑页发布当前草稿";
  }
  if (repositoryError.code === "not-found") return "该 Workflow 已不存在";
  if (repositoryError.code === "forbidden") return "没有操作权限";
  return "操作失败，请重试";
}
