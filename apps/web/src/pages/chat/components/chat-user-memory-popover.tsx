import type {
  AgentUserMemoryCategory,
  AgentUserMemoryCustomerDetailResponse,
  AgentUserMemoryEvidenceResponse,
  AgentUserMemoryItem,
} from "@chatai/contracts";
import {
  AlertCircleIcon,
  ArtificialIntelligence08Icon,
  Brain02Icon,
  CustomerService02Icon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

type CustomerRequestScope = {
  customerKey: string;
  requestId: number;
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
  const customerKey = `${conversation.id}:${externalId}`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [detail, setDetail] =
    useState<AgentUserMemoryCustomerDetailResponse>();
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [deleting, setDeleting] = useState<AgentUserMemoryItem>();
  const [evidence, setEvidence] = useState<EvidenceState>();
  const latestCustomerKeyRef = useRef(customerKey);
  const requestScopeRef = useRef<CustomerRequestScope | undefined>(undefined);
  const requestSequenceRef = useRef(0);
  latestCustomerKeyRef.current = customerKey;
  const sortedItems = detail
    ? [...detail.items].sort((left, right) => right.id - left.id)
    : [];

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  function isRequestScopeActive(
    scope?: CustomerRequestScope,
  ): scope is CustomerRequestScope {
    return Boolean(
      scope &&
        requestScopeRef.current === scope &&
        latestCustomerKeyRef.current === scope.customerKey,
    );
  }

  async function loadCustomer(): Promise<"loaded" | "failed" | "stale"> {
    if (!externalId || latestCustomerKeyRef.current !== customerKey) {
      return "stale";
    }
    const requestScope = {
      customerKey,
      requestId: ++requestSequenceRef.current,
    };
    requestScopeRef.current = requestScope;
    setSaving(false);
    setDetail(undefined);
    setLoadError(false);
    setEditor(undefined);
    setDeleting(undefined);
    setEvidence(undefined);
    try {
      const next = await getUserMemoryCustomer(externalId);
      if (!isRequestScopeActive(requestScope)) return "stale";
      setDetail(next);
      return "loaded";
    } catch {
      if (!isRequestScopeActive(requestScope)) return "stale";
      setLoadError(true);
      return "failed";
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadCustomer();
    return () => {
      if (requestScopeRef.current?.customerKey === customerKey) {
        requestScopeRef.current = undefined;
      }
    };
  }, [conversation.id, externalId, open]);

  async function handleVersionConflict(
    error: unknown,
    fallback: string,
    requestScope: CustomerRequestScope,
  ) {
    if (!isRequestScopeActive(requestScope)) return;
    if (
      error instanceof RequestNormalizedError &&
      error.code === "AGENT_USER_MEMORY_VERSION_CONFLICT"
    ) {
      const result = await loadCustomer();
      if (result === "loaded") {
        toast.error("记忆已更新，请基于最新版本重试");
      } else if (result === "failed") {
        toast.error("记忆已更新，但最新数据加载失败");
      }
      return;
    }
    if (isRequestScopeActive(requestScope)) {
      toast.error(error instanceof Error ? error.message : fallback);
    }
  }

  async function saveMemory(input: {
    category: AgentUserMemoryCategory;
    content: string;
    expiresAt: number | null;
  }) {
    const requestScope = requestScopeRef.current;
    if (!detail || !editor || !isRequestScopeActive(requestScope)) return;
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
      if (!isRequestScopeActive(requestScope)) return;
      setDetail(next);
      setEditor(undefined);
      toast.success("已保存");
    } catch (error) {
      await handleVersionConflict(error, "保存失败", requestScope);
    } finally {
      if (isRequestScopeActive(requestScope)) {
        setSaving(false);
      }
    }
  }

  async function removeMemory() {
    const requestScope = requestScopeRef.current;
    if (!detail || !deleting || !isRequestScopeActive(requestScope)) return;
    setSaving(true);
    try {
      const next = await deleteUserMemoryItem(externalId, deleting.id, {
        expectedVersion: detail.version,
      });
      if (!isRequestScopeActive(requestScope)) return;
      setDetail(next);
      setDeleting(undefined);
      if (evidence?.itemId === deleting.id) {
        setEvidence(undefined);
      }
      toast.success("已删除");
    } catch (error) {
      await handleVersionConflict(error, "删除失败", requestScope);
    } finally {
      if (isRequestScopeActive(requestScope)) {
        setSaving(false);
      }
    }
  }

  async function toggleEvidence(item: AgentUserMemoryItem) {
    if (evidence?.itemId === item.id) {
      setEvidence(undefined);
      return;
    }
    const requestScope = requestScopeRef.current;
    if (!isRequestScopeActive(requestScope)) return;
    setEvidence({ itemId: item.id, loading: true });
    try {
      const response = await getUserMemoryEvidence(externalId, item.id);
      if (!isRequestScopeActive(requestScope)) return;
      setEvidence({ itemId: item.id, loading: false, response });
    } catch {
      if (!isRequestScopeActive(requestScope)) return;
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
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <h3 className="flex min-w-0 items-center text-sm font-semibold">
              <span className="truncate">{conversation.customerName}</span>
              <span className="shrink-0"> 的记忆</span>
            </h3>
            {canMaintain && detail ? (
              <Button
                aria-label="新增"
                className="w-8 px-0"
                disabled={detail.items.length >= 20 || saving}
                onClick={() => setEditor({})}
                size="sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={PlusSignIcon}
                  size={15}
                />
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
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
              <div>
                {detail.items.length === 0 && !editor ? (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">暂无记忆</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedItems.map((item) => (
                      <MemoryItem
                        canMaintain={canMaintain}
                        evidence={
                          evidence?.itemId === item.id ? evidence : undefined
                        }
                        item={item}
                        key={item.id}
                        onDelete={() => setDeleting(item)}
                        onEdit={() => setEditor({ item })}
                        onToggleEvidence={() => void toggleEvidence(item)}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-3 text-right text-xs text-muted-foreground">
                  {detail.items.length} / 20
                </p>
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
  const category =
    USER_MEMORY_CATEGORIES.find((option) => option.value === item.category) ??
    USER_MEMORY_CATEGORIES[0];
  const [hoverOpen, setHoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuCloseTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (menuCloseTimerRef.current !== undefined) {
        window.clearTimeout(menuCloseTimerRef.current);
      }
    },
    [],
  );

  function keepMenuOpen() {
    if (menuCloseTimerRef.current !== undefined) {
      window.clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = undefined;
    }
  }

  function scheduleMenuClose() {
    keepMenuOpen();
    menuCloseTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      menuCloseTimerRef.current = undefined;
    }, 150);
  }

  return (
    <HoverCard
      closeDelay={150}
      onOpenChange={setHoverOpen}
      open={hoverOpen || menuOpen}
      openDelay={180}
    >
      <HoverCardTrigger asChild>
        <div
          className="flex min-w-0 items-center gap-2.5 rounded-[10px] bg-surface-muted px-3 py-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
          data-testid="user-memory-row"
          tabIndex={0}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-background text-muted-foreground">
            <HugeiconsIcon
              aria-hidden="true"
              icon={category.icon}
              size={15}
              strokeWidth={1.8}
            />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px]">{item.content}</p>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[320px] rounded-[10px] p-4"
        data-testid={`user-memory-detail-card-${item.id}`}
        side="left"
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              className="h-5 shrink-0 gap-1 rounded-[6px] bg-muted px-1.5 py-0 text-[11px] leading-none text-muted-foreground"
              variant="secondary"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={category.icon}
                size={12}
                strokeWidth={1.8}
              />
              {category.label}
            </Badge>
            <Badge
              className={cn(
                "h-5 shrink-0 gap-1 rounded-[6px] bg-muted px-1.5 py-0 text-[11px] leading-none",
                item.source === "ai"
                  ? "text-success"
                  : "text-muted-foreground",
              )}
              variant="secondary"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={
                  item.source === "manual"
                    ? CustomerService02Icon
                    : ArtificialIntelligence08Icon
                }
                size={12}
                strokeWidth={1.8}
              />
              {item.source === "manual" ? "手动创建" : "AI 提炼"}
            </Badge>
          </div>
          {canMaintain || item.source === "ai" ? (
            <DropdownMenu
              modal={false}
              onOpenChange={setMenuOpen}
              open={menuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="记忆操作"
                  className="size-7 rounded-[8px] p-0"
                  onPointerEnter={() => {
                    keepMenuOpen();
                    setMenuOpen(true);
                  }}
                  onPointerLeave={scheduleMenuClose}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={MoreHorizontalIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onPointerEnter={keepMenuOpen}
                onPointerLeave={scheduleMenuClose}
              >
                {item.source === "ai" ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      onToggleEvidence();
                    }}
                  >
                    <HugeiconsIcon icon={ViewIcon} />
                    查看证据
                  </DropdownMenuItem>
                ) : null}
                {item.source === "ai" && canMaintain ? (
                  <DropdownMenuSeparator />
                ) : null}
                {canMaintain ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setMenuOpen(false);
                        onEdit();
                      }}
                    >
                      <HugeiconsIcon icon={Edit02Icon} />
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                      删除
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {item.expiresAt ? (
          <Alert className="mt-3 px-[8px] py-[4px] text-xs" variant="warning">
            <HugeiconsIcon
              aria-hidden="true"
              icon={AlertCircleIcon}
              size={15}
              strokeWidth={1.8}
            />
            <AlertDescription className="text-xs leading-5">
              {formatExpiryStatus(item.expiresAt)}
            </AlertDescription>
          </Alert>
        ) : null}
        <p className="mt-3 break-words text-sm font-medium leading-6">{item.content}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>更新于 {formatTimestamp(item.updatedAt)}</span>
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
      </HoverCardContent>
    </HoverCard>
  );
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(timestamp);
}

function formatExpiryStatus(expiresAt: number) {
  return `短期记忆：${expiresAt > Date.now() ? "将于" : "已于"} ${formatDate(expiresAt)} 到期`;
}
