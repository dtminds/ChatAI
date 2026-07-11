import {
  Add01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AiHostingLayout } from "../ai-hosting/ai-hosting-layout";
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
  type WorkflowLifecycleAction,
  WorkflowListRow,
  WorkflowListState,
  WorkflowRenameDialog,
} from "./workflow-list-components";

export function WorkflowPage({ repository }: { repository?: WorkflowDraftRepository } = {}) {
  return <WorkflowListPage repository={repository} />;
}

export function WorkflowListPage({
  repository = getWorkflowDraftRepository(),
}: {
  repository?: WorkflowDraftRepository;
}) {
  const { items, reload, status } = useWorkflowListResource(repository);
  const [query, setQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<WorkflowListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const [lifecyclePendingId, setLifecyclePendingId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(
    () => normalizedQuery
      ? items.filter((workflow) => [workflow.name, workflow.trigger, workflow.owner]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
      : items,
    [items, normalizedQuery],
  );

  const openRenameDialog = (workflow: WorkflowListItem) => {
    setOperationError(null);
    setRenameTarget(workflow);
    setRenameValue(workflow.name);
  };

  const renameWorkflow = async () => {
    if (!renameTarget || !renameValue.trim() || operationPending) {
      return;
    }

    setOperationPending(true);
    setOperationError(null);

    try {
      await Promise.resolve(repository.renameDocument(renameTarget.id, renameValue));
      setRenameTarget(null);
      await reload();
    }
    catch (error) {
      setOperationError(getWorkflowOperationErrorMessage(error));
    }
    finally {
      setOperationPending(false);
    }
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
    if (lifecyclePendingId) return;
    if (action === "enable" && !workflow.activationReady) {
      toast.error("请先在编辑页发布当前草稿");
      return;
    }
    const operation = {
      enable: repository.enableDocument,
      pause: repository.pauseDocument,
      resume: repository.resumeDocument,
      stop: repository.stopDocument,
    }[action];

    if (!operation) {
      toast.error("操作失败，请重试");
      return;
    }

    setLifecyclePendingId(workflow.id);
    try {
      await Promise.resolve(operation(workflow.id));
      await reload();
      toast.success(getWorkflowLifecycleSuccessMessage(action));
    }
    catch (error) {
      toast.error(getWorkflowLifecycleErrorMessage(action, error));
    }
    finally {
      setLifecyclePendingId(null);
    }
  };

  return (
    <AiHostingLayout title="Workflow">
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Workflow</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理营销旅程，点击新建或编辑进入全屏画布
            </p>
          </div>
          <Button asChild className="h-9 gap-1.5 rounded-lg px-3 text-sm">
            <Link rel="noopener noreferrer" target="_blank" to="/chat/workflows/new">
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
              新建 Workflow
            </Link>
          </Button>
        </div>

        <div className="rounded-[12px] border bg-background shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="relative w-full max-w-sm">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{items.length} 个流程</Badge>
              <span>自动保存草稿</span>
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
              description={normalizedQuery ? "没有匹配的 Workflow" : "创建第一个营销流程"}
              title={normalizedQuery ? "暂无搜索结果" : "暂无 Workflow"}
            />
          ) : null}

          {filteredItems.length > 0 ? (
            <div className="divide-y">
              {filteredItems.map((workflow) => (
                <WorkflowListRow
                  key={workflow.id}
                  onDelete={() => {
                    setOperationError(null);
                    setDeleteTarget(workflow);
                  }}
                  onLifecycleAction={(action) => void changeWorkflowLifecycle(workflow, action)}
                  onRename={() => openRenameDialog(workflow)}
                  operationPending={lifecyclePendingId === workflow.id}
                  workflow={workflow}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <WorkflowRenameDialog
        error={operationError}
        onCancel={() => setRenameTarget(null)}
        onOpenChange={(open) => {
          if (!open && !operationPending) {
            setRenameTarget(null);
            setOperationError(null);
          }
        }}
        onRename={() => void renameWorkflow()}
        onValueChange={setRenameValue}
        open={Boolean(renameTarget)}
        pending={operationPending}
        value={renameValue}
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
    </AiHostingLayout>
  );
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
    resume: "已恢复",
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
