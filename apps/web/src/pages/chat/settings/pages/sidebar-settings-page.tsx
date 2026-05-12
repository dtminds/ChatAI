import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Edit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  SettingsSidebarItem,
  SettingsSidebarItemCreateRequest,
  SettingsSidebarItemUpdateRequest,
} from "@chatai/contracts";
import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createSidebarItem,
  deleteSidebarItem,
  listSidebarItems,
  updateSidebarItem,
  updateSidebarItemsSort,
  updateSidebarItemStatus,
} from "@/pages/chat/settings/settings-service";
import { Field, PageHeader, StatusText } from "@/pages/chat/settings/shared";

type DialogState =
  | {
      mode: "create";
    }
  | {
      item: SettingsSidebarItem;
      mode: "edit";
    };

type PendingAction =
  | "create"
  | "sort"
  | `delete:${string}`
  | `edit:${string}`
  | `status:${string}`;

const emptyItems: SettingsSidebarItem[] = [];

export function SidebarSettingsPage() {
  const [items, setItems] = useState<SettingsSidebarItem[]>(emptyItems);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SettingsSidebarItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await listSidebarItems();

        if (!ignore) {
          setItems(sortSidebarItems(response.items));
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return items;
    }

    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.url.toLowerCase().includes(normalizedQuery),
    );
  }, [items, query]);

  async function handleSubmit(
    state: DialogState,
    payload: SettingsSidebarItemCreateRequest | SettingsSidebarItemUpdateRequest,
  ) {
    const pendingKey: PendingAction =
      state.mode === "create" ? "create" : `edit:${state.item.id}`;

    setPendingAction(pendingKey);

    try {
      const nextItem =
        state.mode === "create"
          ? await createSidebarItem(payload)
          : await updateSidebarItem(state.item.id, payload);

      setItems((current) =>
        sortSidebarItems(
          state.mode === "create"
            ? [...current, nextItem]
            : current.map((item) => (item.id === nextItem.id ? nextItem : item)),
        ),
      );
      setDialogState(null);
      toast.success(state.mode === "create" ? "侧边栏页面已新增" : "侧边栏页面已更新");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggleStatus(item: SettingsSidebarItem) {
    setPendingAction(`status:${item.id}`);

    try {
      const nextItem = await updateSidebarItemStatus(
        item.id,
        item.status === "active" ? "disabled" : "active",
      );

      setItems((current) =>
        sortSidebarItems(current.map((currentItem) =>
          currentItem.id === nextItem.id ? nextItem : currentItem,
        )),
      );
      toast.success(nextItem.status === "active" ? "侧边栏页面已启用" : "侧边栏页面已停用");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleMove(item: SettingsSidebarItem, direction: -1 | 1) {
    const currentIndex = items.findIndex((currentItem) => currentItem.id === item.id);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(currentIndex, 1);
    nextItems.splice(nextIndex, 0, movedItem);
    const optimisticItems = nextItems.map((nextItem, index) => ({
      ...nextItem,
      sort: index + 1,
    }));

    setPendingAction("sort");
    setItems(optimisticItems);

    try {
      const response = await updateSidebarItemsSort(optimisticItems.map((nextItem) => nextItem.id));

      setItems(sortSidebarItems(response.items));
      toast.success("侧边栏排序已更新");
    } catch (error) {
      setItems(items);
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setPendingAction(`delete:${deleteTarget.id}`);

    try {
      await deleteSidebarItem(deleteTarget.id);
      setItems((current) =>
        sortSidebarItems(current.filter((item) => item.id !== deleteTarget.id)),
      );
      setDeleteTarget(null);
      toast.success("侧边栏页面已删除");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <PageHeader
        description="配置会话窗口右侧工具栏中的页面入口，控制展示状态和排序"
        eyebrow="SETTINGS / SIDEBAR"
        title="侧边栏"
      />

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-8">
        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-[280px]">
              <HugeiconsIcon
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                color="currentColor"
                icon={Search01Icon}
                size={17}
                strokeWidth={1.8}
              />
              <Input
                aria-label="搜索侧边栏页面"
                className="h-10 rounded-[8px] pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索页面"
                value={query}
              />
            </div>

            <Button
              className="h-10 px-4"
              onClick={() => setDialogState({ mode: "create" })}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={Add01Icon}
                size={17}
                strokeWidth={1.8}
              />
              <span>新增页面</span>
            </Button>
          </div>

          {errorMessage ? (
            <section className="mt-6 rounded-[10px] border border-destructive/30 bg-destructive-muted p-5 text-sm text-destructive">
              {errorMessage}
            </section>
          ) : (
            <section className="mt-6 overflow-hidden rounded-[10px] border border-border">
              <Table aria-label="侧边栏菜单列表">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[34%] px-5 py-4">页面</TableHead>
                    <TableHead className="w-[28%] px-5 py-4">页面地址</TableHead>
                    <TableHead className="w-[14%] px-5 py-4">状态</TableHead>
                    <TableHead className="w-[14%] px-5 py-4">排序</TableHead>
                    <TableHead className="px-5 py-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell className="px-5 py-10" colSpan={5}>
                        <div
                          aria-label="正在加载侧边栏页面"
                          className="flex items-center justify-center gap-3 text-sm text-muted-foreground"
                          role="status"
                        >
                          <DotMatrixLoader
                            ariaLabel="正在加载"
                            className="text-foreground"
                            dotSize={3}
                            size={22}
                          />
                          <span>正在加载侧边栏页面</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const itemIndex = items.findIndex((currentItem) => currentItem.id === item.id);

                      return (
                        <SidebarItemRow
                          isFirst={itemIndex === 0}
                          isLast={itemIndex === items.length - 1}
                          isPending={
                            pendingAction === `delete:${item.id}` ||
                            pendingAction === `edit:${item.id}` ||
                            pendingAction === `status:${item.id}` ||
                            pendingAction === "sort"
                          }
                          item={item}
                          key={item.id}
                          onDelete={() => setDeleteTarget(item)}
                          onEdit={() => setDialogState({ mode: "edit", item })}
                          onMove={(direction) => {
                            void handleMove(item, direction);
                          }}
                          onToggleStatus={() => {
                            void handleToggleStatus(item);
                          }}
                        />
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={5}>
                        暂无侧边栏页面
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>
          )}
        </section>

        <SidebarPreview items={items} />
      </div>

      <SidebarItemDialog
        isSubmitting={
          pendingAction === "create" ||
          (dialogState?.mode === "edit" && pendingAction === `edit:${dialogState.item.id}`)
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
        onSubmit={handleSubmit}
        open={!!dialogState}
        state={dialogState}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除侧边栏页面</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该页面将不再出现在会话窗口右侧工具栏中。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction?.startsWith("delete:")}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingAction?.startsWith("delete:")}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              variant="destructive"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SidebarItemRow({
  isFirst,
  isLast,
  isPending,
  item,
  onDelete,
  onEdit,
  onMove,
  onToggleStatus,
}: {
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  item: SettingsSidebarItem;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleStatus: () => void;
}) {
  const isActive = item.status === "active";

  return (
    <TableRow>
      <TableCell className="px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground">
            <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{item.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">排序 {item.sort}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <p className="max-w-[220px] truncate text-sm text-muted-foreground">{item.url}</p>
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex items-center gap-3">
          <Switch
            aria-label={`${isActive ? "停用" : "启用"} ${item.name}`}
            checked={isActive}
            disabled={isPending}
            onCheckedChange={onToggleStatus}
          />
          <StatusText tone={isActive ? "success" : "muted"}>
            {isActive ? "启用" : "停用"}
          </StatusText>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex items-center gap-1">
          <Button
            aria-label={`移动 ${item.name} 到上方`}
            className="size-8 rounded-[8px]"
            disabled={isFirst || isPending}
            onClick={() => onMove(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label={`移动 ${item.name} 到下方`}
            className="size-8 rounded-[8px]"
            disabled={isLast || isPending}
            onClick={() => onMove(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex items-center gap-1">
          <Button
            aria-label={`编辑 ${item.name}`}
            className="size-8 rounded-[8px]"
            disabled={isPending}
            onClick={onEdit}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label={`删除 ${item.name}`}
            className="size-8 rounded-[8px] text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={onDelete}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SidebarPreview({ items }: { items: SettingsSidebarItem[] }) {
  const activeItems = sortSidebarItems(items).filter((item) => item.status === "active");

  return (
    <aside
      aria-label="聊天工具栏示意图"
      className="sticky top-8 h-fit rounded-[10px] border border-border bg-surface p-4"
    >
      <div className="overflow-hidden rounded-[10px] border border-divider bg-surface">
        <div className="flex h-12 items-center justify-center border-b border-primary/30 bg-primary text-sm font-semibold text-primary-foreground">
          聊天工具栏
        </div>
        <div className="grid grid-cols-2 border-divider bg-surface text-sm text-foreground sm:grid-cols-3">
          {activeItems.map((item) => (
            <div
              className="flex h-14 min-w-0 items-center justify-center border-b border-r border-divider px-2 text-center last:border-r-0"
              key={item.id}
            >
              <span className="truncate">{item.name}</span>
            </div>
          ))}
          {activeItems.length === 0 ? (
            <div className="col-span-3 flex h-28 items-center justify-center text-sm text-muted-foreground">
              暂无启用页面
            </div>
          ) : null}
        </div>
        <div className="h-56 bg-muted/35" />
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        电脑端聊天工具栏为固定宽度，新增页面会按左侧排序依次展示。
      </p>
    </aside>
  );
}

function SidebarItemDialog({
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
  state,
}: {
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    state: DialogState,
    payload: SettingsSidebarItemCreateRequest | SettingsSidebarItemUpdateRequest,
  ) => Promise<void>;
  open: boolean;
  state: DialogState | null;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!state) {
      return;
    }

    setName(state.mode === "edit" ? state.item.name : "");
    setUrl(state.mode === "edit" ? state.item.url : "");
    setErrorMessage("");
  }, [state]);

  async function handleSubmit() {
    if (!state) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedUrl = url.trim();

    if (!normalizedName || !normalizedUrl) {
      setErrorMessage("请完整填写侧边栏页面信息");
      return;
    }

    await onSubmit(state, {
      name: normalizedName,
      url: normalizedUrl,
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit" ? "编辑侧边栏页面" : "新增侧边栏页面"}
          </DialogTitle>
          <DialogDescription>
            配置页面名称和地址，保存后会同步到右侧聊天工具栏。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="页面名称">
            <Input
              aria-label="页面名称"
              className="h-10 rounded-[8px]"
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：企业名片"
              value={name}
            />
          </Field>
          <Field label="页面地址">
            <Input
              aria-label="页面地址"
              className="h-10 rounded-[8px]"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/page"
              value={url}
            />
          </Field>
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={isSubmitting} type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
            type="button"
          >
            确认提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sortSidebarItems(items: SettingsSidebarItem[]) {
  return [...items].sort(
    (left, right) => left.sort - right.sort || Number(left.id) - Number(right.id),
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;

    if (response?.data?.error?.message) {
      return response.data.error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}
