import {
  Add01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Edit02Icon,
  MoreHorizontalIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/ui/sortable";
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
import { cn } from "@/lib/utils";
import { Field, PageHeader } from "@/pages/chat/settings/shared";

type DragOverlaySize = {
  height: number;
  width: number;
};

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
const maxSidebarItems = 10;
const maxSidebarItemNameWeight = 8;

export function SidebarSettingsPage() {
  const [items, setItems] = useState<SettingsSidebarItem[]>(emptyItems);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SettingsSidebarItem | null>(null);
  const [dragOverlaySize, setDragOverlaySize] = useState<DragOverlaySize | null>(null);
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
  const isSearching = query.trim().length > 0;

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

  async function handleSortChange(nextItems: SettingsSidebarItem[]) {
    const currentItemIds = items.map((item) => item.id).join(",");
    const nextItemIds = nextItems.map((item) => item.id).join(",");

    if (currentItemIds === nextItemIds) {
      return;
    }

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
              disabled={items.length >= maxSidebarItems}
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
          ) : !isLoading && filteredItems.length > 0 && !isSearching ? (
            <Sortable
              getItemValue={(item) => item.id}
              onDragCancel={() => {
                setDragOverlaySize(null);
              }}
              onDragEnd={() => {
                setDragOverlaySize(null);
              }}
              onDragStart={(event) => {
                const rect = event.active.rect.current.initial;

                setDragOverlaySize(
                  rect
                    ? {
                        height: rect.height,
                        width: rect.width,
                      }
                    : null,
                );
              }}
              onValueChange={(nextItems) => {
                void handleSortChange(nextItems);
              }}
              value={items}
            >
              <SidebarItemsTable
                items={filteredItems}
                renderRow={(item) => (
                  <SidebarItemRow
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
                    onToggleStatus={() => {
                      void handleToggleStatus(item);
                    }}
                  />
                )}
                sortable
              />
              <SortableOverlay>
                {({ value }) => {
                  const activeItem = items.find((item) => item.id === String(value));

                  return activeItem ? (
                    <SidebarItemDragOverlay item={activeItem} size={dragOverlaySize} />
                  ) : null;
                }}
              </SortableOverlay>
            </Sortable>
          ) : (
            <SidebarItemsTable
              items={filteredItems}
              renderRow={(item) => (
                <SidebarItemRow
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
                  onToggleStatus={() => {
                    void handleToggleStatus(item);
                  }}
                  sortable={false}
                />
              )}
              showLoading={isLoading}
            />
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

function SidebarItemsTable({
  items,
  renderRow,
  showLoading = false,
  sortable = false,
}: {
  items: SettingsSidebarItem[];
  renderRow: (item: SettingsSidebarItem) => React.ReactNode;
  showLoading?: boolean;
  sortable?: boolean;
}) {
  const body = showLoading ? (
    <TableBody>
      <TableRow>
        <TableCell className="px-5 py-10" colSpan={3}>
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
    </TableBody>
  ) : sortable ? (
    <SortableContent asChild>
      <TableBody>{items.map(renderRow)}</TableBody>
    </SortableContent>
  ) : (
    <TableBody>
      {items.length > 0 ? (
        items.map(renderRow)
      ) : (
        <TableRow>
          <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={3}>
            暂无侧边栏页面
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );

  return (
    <section className="mt-6 overflow-hidden rounded-[10px] border border-border">
      <Table aria-label="侧边栏菜单列表">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[70%] px-5 py-4">页面</TableHead>
            <TableHead className="w-[15%] px-5 py-4">显示</TableHead>
            <TableHead className="px-5 py-4">操作</TableHead>
          </TableRow>
        </TableHeader>
        {body}
      </Table>
    </section>
  );
}

function SidebarItemRow({
  isPending,
  item,
  onDelete,
  onEdit,
  onToggleStatus,
  sortable = true,
}: {
  isPending: boolean;
  item: SettingsSidebarItem;
  onDelete: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  sortable?: boolean;
}) {
  const isActive = item.status === "active";
  const rowContent = (
    <>
      <TableCell className="px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          {sortable ? (
            <SortableItemHandle asChild>
              <button
                aria-label={`拖动 ${item.name} 调整排序`}
                className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPending}
                type="button"
              >
                <HugeiconsIcon icon={DragDropVerticalIcon} size={18} />
              </button>
            </SortableItemHandle>
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground/60">
              <HugeiconsIcon icon={DragDropVerticalIcon} size={18} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{item.name}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <div className="flex items-center">
          <Switch
            aria-label={`${isActive ? "停用" : "启用"} ${item.name}`}
            checked={isActive}
            disabled={isPending}
            onCheckedChange={onToggleStatus}
          />
        </div>
      </TableCell>
      <TableCell className="px-5 py-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`打开 ${item.name} 操作菜单`}
              className="size-8 rounded-[8px]"
              disabled={isPending}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.8} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[116px]">
            <DropdownMenuItem onSelect={() => onEdit()}>
              <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
              编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive data-[highlighted]:text-destructive"
              onSelect={() => onDelete()}
            >
              <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </>
  );

  if (!sortable) {
    return <TableRow>{rowContent}</TableRow>;
  }

  return (
    <SortableItem asChild disabled={isPending} value={item.id}>
      <TableRow className="data-dragging:bg-muted/55 data-dragging:text-muted-foreground data-dragging:opacity-60">
        {rowContent}
      </TableRow>
    </SortableItem>
  );
}

function SidebarItemDragOverlay({
  item,
  size,
}: {
  item: SettingsSidebarItem;
  size: DragOverlaySize | null;
}) {
  return (
    <div
      className="grid grid-cols-[70%_15%_15%] items-center rounded-[8px] border border-border/80 bg-popover/85 text-sm text-popover-foreground shadow-lg"
      style={{
        height: size?.height,
        minHeight: 72,
        width: size?.width,
      }}
    >
      <div className="flex min-w-0 items-center gap-3 px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground">
          <HugeiconsIcon icon={DragDropVerticalIcon} size={18} />
        </span>
        <span className="truncate font-medium">{item.name}</span>
      </div>
      <div aria-hidden="true" />
      <div aria-hidden="true" />
    </div>
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
        <div className="border-b border-divider px-4 py-2">
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-sm">
            {activeItems.map((item, index) => (
              <div
                className={cn(
                  "flex h-10 min-w-0 items-center justify-center px-0 py-2 text-muted-foreground",
                  index === 0 && "font-semibold text-foreground",
                )}
                key={item.id}
              >
                <span className="truncate">{item.name}</span>
              </div>
            ))}
            {activeItems.length === 0 ? (
              <div className="col-span-4 flex h-10 items-center justify-center text-sm text-muted-foreground">
                暂无启用页面
              </div>
            ) : null}
          </div>
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

    if (getSidebarItemNameWeight(normalizedName) > maxSidebarItemNameWeight) {
      setErrorMessage("页面名称最多 8 个字符");
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

function getSidebarItemNameWeight(name: string) {
  return Array.from(name).reduce((total, char) => total + (isCjkChar(char) ? 2 : 1), 0);
}

function isCjkChar(char: string) {
  return /\p{Script=Han}/u.test(char);
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
