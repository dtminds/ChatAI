import type {
  AgentUserMemoryCategory,
  AgentUserMemoryCustomerDetailResponse,
  AgentUserMemoryEvidenceResponse,
  AgentUserMemoryItem,
} from "@chatai/contracts";
import {
  Brain02Icon,
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RequestNormalizedError } from "@/lib/request";
import { cn } from "@/lib/utils";
import {
  createUserMemoryItem,
  deleteUserMemoryItem,
  getUserMemoryCustomer,
  getUserMemoryEvidence,
  updateUserMemoryItem,
} from "@/pages/chat/ai-hosting/api/user-memory-service";
import { canMaintainUserMemory } from "@/pages/chat/ai-hosting/agent-permissions";
import {
  USER_MEMORY_CATEGORIES,
  UserMemoryEditorDialog,
} from "@/pages/chat/ai-hosting/user-memory-editor-dialog";
import type { Conversation } from "@/pages/chat/chat-types";
import { useAuthStore } from "@/store/auth-store";

export const CHAT_USER_MEMORY_POPOVER_WIDTH = 360;
export const CHAT_USER_MEMORY_COLLISION_PADDING = 8;
export const CHAT_USER_MEMORY_RESERVED_WIDTH =
  CHAT_USER_MEMORY_POPOVER_WIDTH + CHAT_USER_MEMORY_COLLISION_PADDING;

type EditorState = {
  item?: AgentUserMemoryItem;
};

type EvidenceState = {
  itemId: number;
  loading: boolean;
  response?: AgentUserMemoryEvidenceResponse;
};

export function ChatUserMemoryPopover({
  alignOffset = 0,
  conversation,
  onOpenChange,
  open: controlledOpen,
}: {
  alignOffset?: number;
  conversation: Conversation;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const role = useAuthStore((state) => state.subUser?.role);
  const canMaintain = canMaintainUserMemory(role);
  const externalId = conversation.thirdExternalUserId?.trim() ?? "";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [detail, setDetail] =
    useState<AgentUserMemoryCustomerDetailResponse>();
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [deleting, setDeleting] = useState<AgentUserMemoryItem>();
  const [evidence, setEvidence] = useState<EvidenceState>();
  const requestScopeRef = useRef("");

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  async function loadCustomer() {
    if (!externalId) return;
    const requestScope = `${conversation.id}:${externalId}`;
    requestScopeRef.current = requestScope;
    setDetail(undefined);
    setLoadError(false);
    setEditor(undefined);
    setDeleting(undefined);
    setEvidence(undefined);
    try {
      const next = await getUserMemoryCustomer(externalId);
      if (requestScopeRef.current === requestScope) {
        setDetail(next);
      }
    } catch {
      if (requestScopeRef.current === requestScope) {
        setLoadError(true);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadCustomer();
    return () => {
      requestScopeRef.current = "";
    };
  }, [conversation.id, externalId, open]);

  async function handleVersionConflict(error: unknown, fallback: string) {
    if (
      error instanceof RequestNormalizedError &&
      error.code === "AGENT_USER_MEMORY_VERSION_CONFLICT"
    ) {
      try {
        await loadCustomer();
        toast.error("记忆已更新，请基于最新版本重试");
      } catch {
        toast.error("记忆已更新，但最新数据加载失败");
      }
      return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
  }

  async function saveMemory(input: {
    category: AgentUserMemoryCategory;
    content: string;
    expiresAt: number | null;
  }) {
    if (!detail || !editor) return;
    setSaving(true);
    try {
      const next = editor.item
        ? await updateUserMemoryItem(externalId, editor.item.id, {
            ...input,
            expectedVersion: detail.version,
          })
        : await createUserMemoryItem(externalId, {
            ...input,
            expectedVersion: detail.version,
          });
      setDetail(next);
      setEditor(undefined);
      toast.success("已保存");
    } catch (error) {
      await handleVersionConflict(error, "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeMemory() {
    if (!detail || !deleting) return;
    setSaving(true);
    try {
      const next = await deleteUserMemoryItem(externalId, deleting.id, {
        expectedVersion: detail.version,
      });
      setDetail(next);
      setDeleting(undefined);
      if (evidence?.itemId === deleting.id) {
        setEvidence(undefined);
      }
      toast.success("已删除");
    } catch (error) {
      await handleVersionConflict(error, "删除失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEvidence(item: AgentUserMemoryItem) {
    if (evidence?.itemId === item.id) {
      setEvidence(undefined);
      return;
    }
    setEvidence({ itemId: item.id, loading: true });
    try {
      const response = await getUserMemoryEvidence(externalId, item.id);
      setEvidence({ itemId: item.id, loading: false, response });
    } catch {
      setEvidence(undefined);
      toast.error("证据加载失败");
    }
  }

  return (
    <>
      <Popover modal={false} onOpenChange={setOpen} open={open}>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  aria-label="用户记忆"
                  className={cn(
                    "size-9 shrink-0 rounded-[10px] p-0 text-muted-foreground shadow-none hover:text-foreground",
                    open && "bg-accent text-accent-foreground",
                  )}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Brain02Icon}
                    size={18}
                    strokeWidth={1.8}
                  />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>用户记忆</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PopoverContent
          align="end"
          alignOffset={alignOffset}
          className="flex max-h-[min(680px,calc(100vh-96px))] max-w-[calc(100vw-24px)] flex-col overflow-hidden p-0"
          collisionPadding={CHAT_USER_MEMORY_COLLISION_PADDING}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
          sideOffset={8}
          style={{ width: CHAT_USER_MEMORY_POPOVER_WIDTH }}
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {conversation.customerName}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                用户记忆
                {detail ? ` · ${detail.items.length} / 20` : ""}
              </p>
            </div>
            {canMaintain && detail ? (
              <Button
                disabled={detail.items.length >= 20 || saving}
                onClick={() => setEditor({})}
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={PlusSignIcon}
                  size={15}
                />
                新增
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadError ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3">
                <p className="text-sm text-muted-foreground">加载失败</p>
                <Button onClick={() => void loadCustomer()} variant="outline">
                  重试
                </Button>
              </div>
            ) : !detail ? (
              <div
                className="flex min-h-40 items-center justify-center gap-2"
                role="status"
              >
                <Spinner size={18} />
                <span className="text-sm text-muted-foreground">正在加载</span>
              </div>
            ) : (
              <div className="space-y-4">
                {detail.items.length === 0 && !editor ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">暂无记忆</p>
                    {canMaintain ? (
                      <Button
                        className="mt-3"
                        onClick={() => setEditor({})}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={PlusSignIcon}
                          size={15}
                        />
                        新增记忆
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  USER_MEMORY_CATEGORIES.map((category) => {
                    const items = detail.items.filter(
                      (item) => item.category === category.value,
                    );
                    if (items.length === 0) return null;
                    return (
                      <section key={category.value}>
                        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                          {category.label}
                        </h4>
                        <div className="divide-y rounded-[8px] border">
                          {items.map((item) => (
                            <MemoryItem
                              canMaintain={canMaintain}
                              evidence={
                                evidence?.itemId === item.id
                                  ? evidence
                                  : undefined
                              }
                              item={item}
                              key={item.id}
                              onDelete={() => setDeleting(item)}
                              onEdit={() => setEditor({ item })}
                              onToggleEvidence={() => void toggleEvidence(item)}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <UserMemoryEditorDialog
        item={editor?.item}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) setEditor(undefined);
        }}
        onSave={saveMemory}
        open={Boolean(editor)}
        saving={saving}
      />

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) setDeleting(undefined);
        }}
        open={Boolean(deleting)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除记忆</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将立即从客户当前记忆中移除
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void removeMemory();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MemoryItem({
  canMaintain,
  evidence,
  item,
  onDelete,
  onEdit,
  onToggleEvidence,
}: {
  canMaintain: boolean;
  evidence?: EvidenceState;
  item: AgentUserMemoryItem;
  onDelete: () => void;
  onEdit: () => void;
  onToggleEvidence: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {item.source === "manual" ? "人工" : "AI 提炼"}
            </Badge>
            {item.expiresAt ? (
              <span className="text-xs text-muted-foreground">
                有效至 {formatTimestamp(item.expiresAt)}
              </span>
            ) : null}
          </div>
          <p className="text-sm leading-6">{item.content}</p>
        </div>
        <div className="flex shrink-0">
          {item.source === "ai" ? (
            <Button
              aria-label="查看证据"
              onClick={onToggleEvidence}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={ViewIcon} size={15} />
            </Button>
          ) : null}
          {canMaintain ? (
            <>
              <Button
                aria-label="编辑记忆"
                onClick={onEdit}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Edit02Icon} size={15} />
              </Button>
              <Button
                aria-label="删除记忆"
                onClick={onDelete}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Delete02Icon} size={15} />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {evidence ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          {evidence.loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size={14} />
              正在加载
            </div>
          ) : (
            evidence.response?.messages.map((message) => (
              <div
                className="rounded-[8px] bg-surface-muted px-3 py-2 text-xs leading-5"
                key={message.messageId}
              >
                {message.content}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
