import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CopyPlusIcon,
  Delete01Icon,
  DragDropVerticalIcon,
  Edit03Icon,
  Knowledge02Icon,
  MoreVerticalIcon,
  Move02Icon,
  MoveToIcon,
  Search01Icon,
  SortByDown01Icon,
  SortByUp01Icon,
  Sorting05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@/components/ui/sortable";
import { cn } from "@/lib/utils";
import {
  QuickReplyImportDialog,
  type QuickReplyImportDialogProps,
} from "@/pages/chat/components/quick-reply/quick-reply-import-dialog";
import { getQuickReplyTitleColor } from "@/pages/chat/components/quick-reply/quick-reply-title-palette";

const CONTEXT_MENU_VIEWPORT_PADDING = 8;

type QuickReplySortMode = "category" | "reply" | null;

type QuickReplyMoveTarget = {
  id: string;
  title: string;
};

type QuickReplyPanelProps = {
  activeCategoryId: string | 0 | null;
  activeScopeType: QuickReplyScopeType;
  activeTopCategoryId: string | null;
  categories: WorkbenchQuickReplyCategoryDto[];
  isLoading: boolean;
  isMutating?: boolean;
  keyword: string;
  quickReplies: WorkbenchQuickReplyDto[];
  quickRepliesByCategoryId?: Record<string, WorkbenchQuickReplyDto[]>;
  onBottomCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onBottomQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onCategoryChange: (categoryId: string | 0 | null) => void;
  onCreateCategory: (parentId: string | 0) => void;
  onCreateQuickReply: (categoryId: string) => void;
  onCopyQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onDeleteQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onImportQuickReplies: QuickReplyImportDialogProps["onImport"];
  onKeywordChange: (keyword: string) => void;
  onMoveCategory: (
    category: WorkbenchQuickReplyCategoryDto,
    parentId: string,
  ) => void;
  onMoveQuickReply: (
    quickReply: WorkbenchQuickReplyDto,
    categoryId: string,
  ) => void;
  onScopeTypeChange: (scopeType: QuickReplyScopeType) => void;
  onSelectQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onSortCategories: (input: {
    categoryIds: string[];
    parentId: string;
  }) => Promise<void> | void;
  onSortQuickReplies: (input: {
    categoryId: string;
    quickReplyIds: string[];
  }) => Promise<void> | void;
  onTopCategoryChange: (categoryId: string | null) => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onTopQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
};

export function QuickReplyPanel({
  activeCategoryId,
  activeScopeType,
  activeTopCategoryId,
  categories,
  isLoading,
  isMutating = false,
  keyword,
  quickReplies,
  quickRepliesByCategoryId,
  onBottomCategory,
  onBottomQuickReply,
  onCategoryChange,
  onCreateCategory,
  onCreateQuickReply,
  onCopyQuickReply,
  onDeleteCategory,
  onDeleteQuickReply,
  onEditCategory,
  onEditQuickReply,
  onImportQuickReplies,
  onKeywordChange,
  onMoveCategory,
  onMoveQuickReply,
  onScopeTypeChange,
  onSelectQuickReply,
  onSortCategories,
  onSortQuickReplies,
  onTopCategoryChange,
  onTopCategory,
  onTopQuickReply,
}: QuickReplyPanelProps) {
  const topCategories = useMemo(
    () => categories.filter((category) => category.parentId === 0),
    [categories],
  );
  const activeTopCategory = useMemo(
    () =>
      topCategories.find((category) => category.id === activeTopCategoryId) ??
      topCategories[0] ??
      null,
    [activeTopCategoryId, topCategories],
  );
  const [manualExpandedCategoryIds, setManualExpandedCategoryIds] = useState<
    Set<string>
  >(
    () =>
      typeof activeCategoryId === "string"
        ? new Set([activeCategoryId])
        : new Set(),
  );
  const previousTopCategoryIdRef = useRef<string | null>(null);
  const previousChildCategoryIdsRef = useRef<Set<string>>(new Set());
  const quickReplyViewportRef = useRef<HTMLDivElement | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sortMode, setSortMode] = useState<QuickReplySortMode>(null);
  const [sortCategoryOrder, setSortCategoryOrder] = useState<
    WorkbenchQuickReplyCategoryDto[]
  >([]);
  const [sortQuickRepliesByCategoryId, setSortQuickRepliesByCategoryId] =
    useState<Record<string, WorkbenchQuickReplyDto[]>>({});
  const [isSortSaving, setIsSortSaving] = useState(false);
  const childCategories = useMemo(
    () =>
      activeTopCategory
        ? categories.filter((category) => category.parentId === activeTopCategory.id)
        : [],
    [activeTopCategory, categories],
  );
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredQuickRepliesByCategoryId = useMemo(() => {
    if (!normalizedKeyword) {
      return quickRepliesByCategoryId ?? {};
    }

    const next: Record<string, WorkbenchQuickReplyDto[]> = {};

    for (const category of childCategories) {
      const matches = (quickRepliesByCategoryId?.[category.id] ?? []).filter(
        (quickReply) => quickReplyMatchesKeyword(quickReply, normalizedKeyword),
      );

      if (matches.length > 0) {
        next[category.id] = matches;
      }
    }

    return next;
  }, [childCategories, normalizedKeyword, quickRepliesByCategoryId]);
  const visibleChildCategories = normalizedKeyword
    ? childCategories.filter(
        (category) =>
          (filteredQuickRepliesByCategoryId[category.id]?.length ?? 0) > 0,
      )
    : childCategories;
  const expandedCategoryIds = normalizedKeyword
    ? new Set(visibleChildCategories.map((category) => category.id))
    : manualExpandedCategoryIds;
  const displayChildCategories =
    sortMode === "category"
      ? sortCategoryOrder
      : sortMode === "reply"
        ? childCategories
        : visibleChildCategories;
  const displayExpandedCategoryIds =
    sortMode === "reply"
      ? new Set(displayChildCategories.map((category) => category.id))
      : sortMode === "category"
        ? new Set<string>()
        : expandedCategoryIds;
  const displayQuickRepliesByCategoryId =
    sortMode === "reply"
      ? sortQuickRepliesByCategoryId
      : filteredQuickRepliesByCategoryId;
  useEffect(() => {
    const activeTopCategoryId = activeTopCategory?.id ?? null;
    const previousTopCategoryId = previousTopCategoryIdRef.current;
    const previousChildCategoryIds = previousChildCategoryIdsRef.current;
    const childCategoryIds = new Set(childCategories.map((category) => category.id));
    const topCategoryChanged = activeTopCategoryId !== previousTopCategoryId;

    previousTopCategoryIdRef.current = activeTopCategoryId;
    previousChildCategoryIdsRef.current = childCategoryIds;

    setManualExpandedCategoryIds((current) => {
      if (!activeTopCategoryId || childCategoryIds.size === 0) {
        return current.size === 0 ? current : new Set();
      }

      if (topCategoryChanged) {
        return childCategoryIds;
      }

      const next = new Set<string>();

      for (const categoryId of current) {
        if (childCategoryIds.has(categoryId)) {
          next.add(categoryId);
        }
      }

      for (const categoryId of childCategoryIds) {
        if (!previousChildCategoryIds.has(categoryId)) {
          next.add(categoryId);
        }
      }

      if (
        next.size === current.size &&
        [...next].every((categoryId) => current.has(categoryId))
      ) {
        return current;
      }

      return next;
    });
  }, [activeTopCategory?.id, childCategories]);

  const handleSelectTopCategory = (category: WorkbenchQuickReplyCategoryDto) => {
    onTopCategoryChange(category.id);
  };
  const handleToggleChildCategory = (categoryId: string) => {
    setManualExpandedCategoryIds((current) => {
      const next = new Set(current);

      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }

      return next;
    });
  };
  const handleEnsureChildCategoryOpen = (categoryId: string) => {
    setManualExpandedCategoryIds((current) => {
      if (current.has(categoryId)) {
        return current;
      }

      return new Set([...current, categoryId]);
    });
  };
  const handleEnterSortMode = (mode: Exclude<QuickReplySortMode, null>) => {
    if (keyword.trim()) {
      onKeywordChange("");
    }

    setSortMode(mode);
    setSortCategoryOrder(childCategories);
    setSortQuickRepliesByCategoryId(
      Object.fromEntries(
        childCategories.map((category) => [
          category.id,
          [...(quickRepliesByCategoryId?.[category.id] ?? [])],
        ]),
      ),
    );
  };
  const handleCancelSortMode = () => {
    setSortMode(null);
    setSortCategoryOrder([]);
    setSortQuickRepliesByCategoryId({});
  };
  const handleSaveSortMode = async () => {
    if (!sortMode || !activeTopCategory) {
      return;
    }

    setIsSortSaving(true);

    try {
      if (sortMode === "category") {
        const currentIds = childCategories.map((category) => category.id);
        const nextIds = sortCategoryOrder.map((category) => category.id);

        if (currentIds.join("\u0000") !== nextIds.join("\u0000")) {
          await onSortCategories({
            categoryIds: nextIds,
            parentId: activeTopCategory.id,
          });
        }
      } else {
        const changedCategoryIds = childCategories
          .map((category) => category.id)
          .filter((categoryId) => {
            const currentIds = (quickRepliesByCategoryId?.[categoryId] ?? []).map(
              (reply) => reply.id,
            );
            const nextIds = (sortQuickRepliesByCategoryId[categoryId] ?? [])
              .map((reply) => reply.id);

            return currentIds.join("\u0000") !== nextIds.join("\u0000");
          });

        for (const categoryId of changedCategoryIds) {
          await onSortQuickReplies({
            categoryId,
            quickReplyIds:
              sortQuickRepliesByCategoryId[categoryId]?.map((reply) => reply.id) ?? [],
          });
        }
      }

      handleCancelSortMode();
    } finally {
      setIsSortSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-divider px-2.5 py-2.5">
        {sortMode ? (
          <div className="flex h-9 items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {sortMode === "category"
                ? "已进入话术分组排序模式"
                : "已进入话术排序模式"}
            </div>
            <Button
              className="h-8 px-3"
              disabled={isSortSaving}
              onClick={handleCancelSortMode}
              size="sm"
              type="button"
              variant="ghost"
            >
              取消
            </Button>
            <Button
              className="h-8 w-14 px-0"
              disabled={isSortSaving}
              onClick={() => void handleSaveSortMode()}
              size="sm"
              type="button"
            >
              {isSortSaving ? (
                <Spinner
                  aria-label="保存中"
                  className="text-primary-foreground"
                  size={14}
                />
              ) : (
                "保存"
              )}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <div className="grid min-w-0 grid-cols-2 rounded-[8px] bg-secondary p-0.5">
              <ScopeButton
                active={activeScopeType === QUICK_REPLY_SCOPE_TYPE.ENTERPRISE}
                onClick={() => onScopeTypeChange(QUICK_REPLY_SCOPE_TYPE.ENTERPRISE)}
              >
                企业
              </ScopeButton>
              <ScopeButton
                active={activeScopeType === QUICK_REPLY_SCOPE_TYPE.PERSONAL}
                onClick={() => onScopeTypeChange(QUICK_REPLY_SCOPE_TYPE.PERSONAL)}
              >
                个人
              </ScopeButton>
            </div>
            <div className="relative min-w-0">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                color="currentColor"
                icon={Search01Icon}
                size={16}
                strokeWidth={1.8}
              />
              <Input
                className="h-9 rounded-xl border border-transparent bg-surface-muted pl-10 pr-9 text-sm shadow-none transition-colors focus-visible:border-input focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/12"
                onChange={(event) => onKeywordChange(event.target.value)}
                placeholder="搜索话术"
                value={keyword}
              />
              {keyword ? (
                <Button
                  aria-label="清空搜索"
                  className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md p-0 text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                  onClick={() => onKeywordChange("")}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Cancel01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              ) : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="更多操作"
                  className="size-8 shrink-0 rounded-[6px] p-0"
                  disabled={isMutating}
                  size="icon"
                  title="更多操作"
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={MoreVerticalIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[136px]">
                <DropdownMenuItem onSelect={() => setImportDialogOpen(true)}>
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Knowledge02Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  导入话术
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={Move02Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    拖拽排序
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[136px]">
                    <DropdownMenuItem
                      disabled={!activeTopCategory || childCategories.length === 0}
                      onSelect={() => handleEnterSortMode("category")}
                    >
                      话术分组排序
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!activeTopCategory || childCategories.length === 0}
                      onSelect={() => handleEnterSortMode("reply")}
                    >
                      话术排序
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <QuickReplyImportDialog
        onImport={onImportQuickReplies}
        onOpenChange={setImportDialogOpen}
        open={importDialogOpen}
        scopeType={activeScopeType}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {!(isLoading && topCategories.length === 0) ? (
          <div className="border-b border-divider px-2.5 py-2">
            <div className="flex flex-wrap gap-1.5">
              {topCategories.length === 0 ? (
                <Button
                  className="h-7 rounded-[3px] bg-primary/55 px-2 text-[13px] text-primary-foreground shadow-none hover:bg-primary/65"
                  disabled={isMutating}
                  onClick={() => onCreateCategory(0)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Add01Icon}
                    size={15}
                    strokeWidth={1.8}
                  />
                  添加分类
                </Button>
              ) : (
                topCategories.map((category) => (
                  <TopCategoryTab
                    active={activeTopCategory?.id === category.id}
                    category={category}
                    disabled={sortMode !== null}
                    key={category.id}
                    onBottomCategory={onBottomCategory}
                    onCreateCategory={onCreateCategory}
                    onDeleteCategory={onDeleteCategory}
                    onEditCategory={onEditCategory}
                    onSelect={() => handleSelectTopCategory(category)}
                    onTopCategory={onTopCategory}
                  />
                ))
              )}
              {topCategories.length > 0 ? (
                <Button
                  aria-label="新增一级分类"
                  className="size-7 shrink-0 rounded-[3px] bg-primary/55 p-0 text-primary-foreground shadow-none hover:bg-primary/65"
                  disabled={isMutating || sortMode !== null}
                  onClick={() => onCreateCategory(0)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Add01Icon}
                    size={15}
                    strokeWidth={1.8}
                  />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col">
          <ScrollArea
            className="min-h-0 flex-1"
            viewportProps={{ className: "max-w-full overflow-x-hidden" }}
            viewportRef={quickReplyViewportRef}
          >
            <div className="w-full max-w-full">
              {isLoading && topCategories.length === 0 ? (
                <div
                  aria-label="正在加载话术"
                  className="flex h-full min-h-[240px] items-center justify-center"
                  role="status"
                >
                  <Spinner aria-hidden="true" size={20} />
                </div>
              ) : !activeTopCategory ? (
                <div className="py-10 text-center text-[13px] text-muted-foreground">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="h-48 w-48 mx-auto opacity-45"
                    src="https://b5.bokr.com.cn/dist/reply-empty.png!w480.webp"
                  />
                  添加分类，如售前、售后、物流等
                </div>
              ) : isLoading && childCategories.length === 0 ? (
                <div
                  aria-label="正在加载话术"
                  className="flex min-h-32 items-center justify-center"
                  role="status"
                >
                  <Spinner aria-hidden="true" size={20} />
                </div>
              ) : childCategories.length === 0 ? (
                <div className="space-y-3 rounded-[8px] bg-muted/40 px-4 py-8 text-center">
                  <div className="text-[13px] text-muted-foreground">
                    <img
                      alt=""
                      aria-hidden="true"
                      className="h-48 w-48 mx-auto opacity-45"
                      src="https://b5.bokr.com.cn/dist/reply-empty.png!w480.webp"
                    />
                    添加一个话术分组，即可开始创建话术
                  </div>
                  <Button
                    disabled={isMutating}
                    onClick={() => onCreateCategory(activeTopCategory.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={Add01Icon}
                      size={14}
                      strokeWidth={1.8}
                    />
                    创建话术分组
                  </Button>
                </div>
              ) : sortMode === "category" ? (
                <Sortable
                  flatCursor
                  getItemValue={(category) => category.id}
                  onValueChange={setSortCategoryOrder}
                  value={sortCategoryOrder}
                >
                  <SortableContent className="w-full max-w-full">
                    {sortCategoryOrder.map((category) => (
                      <SortableItem key={category.id} value={category.id}>
                        <SecondaryCategorySection
                          active={false}
                          categories={categories}
                          category={category}
                          isLoading={isLoading}
                          quickReplies={[]}
                          scrollViewportRef={quickReplyViewportRef}
                          sortMode="category"
                          onBottomCategory={onBottomCategory}
                          onBottomQuickReply={onBottomQuickReply}
                          onCategoryEnsureOpen={handleEnsureChildCategoryOpen}
                          onCategoryToggle={handleToggleChildCategory}
                          onCopyQuickReply={onCopyQuickReply}
                          onCreateQuickReply={onCreateQuickReply}
                          onDeleteCategory={onDeleteCategory}
                          onDeleteQuickReply={onDeleteQuickReply}
                          onEditCategory={onEditCategory}
                          onEditQuickReply={onEditQuickReply}
                          onMoveCategory={onMoveCategory}
                          onMoveQuickReply={onMoveQuickReply}
                          onSelectQuickReply={onSelectQuickReply}
                          onTopCategory={onTopCategory}
                          onTopQuickReply={onTopQuickReply}
                        />
                      </SortableItem>
                    ))}
                  </SortableContent>
                </Sortable>
              ) : (
                displayChildCategories.map((category) => (
                  <SecondaryCategorySection
                    active={displayExpandedCategoryIds.has(category.id)}
                    categories={categories}
                    category={category}
                    isLoading={isLoading}
                    key={category.id}
                    quickReplies={displayQuickRepliesByCategoryId[category.id] ?? []}
                    sortMode={sortMode}
                    onCategoryEnsureOpen={handleEnsureChildCategoryOpen}
                    onCategoryToggle={handleToggleChildCategory}
                    scrollViewportRef={quickReplyViewportRef}
                    onBottomCategory={onBottomCategory}
                    onBottomQuickReply={onBottomQuickReply}
                    onCopyQuickReply={onCopyQuickReply}
                    onDeleteCategory={onDeleteCategory}
                    onDeleteQuickReply={onDeleteQuickReply}
                    onEditCategory={onEditCategory}
                    onEditQuickReply={onEditQuickReply}
                    onMoveCategory={onMoveCategory}
                    onMoveQuickReply={onMoveQuickReply}
                    onCreateQuickReply={onCreateQuickReply}
                    onSelectQuickReply={onSelectQuickReply}
                    onSortQuickRepliesChange={(items) =>
                      setSortQuickRepliesByCategoryId((current) => ({
                        ...current,
                        [category.id]: items,
                      }))
                    }
                    onTopCategory={onTopCategory}
                    onTopQuickReply={onTopQuickReply}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}

function TopCategoryTab({
  active,
  category,
  disabled = false,
  onBottomCategory,
  onCreateCategory,
  onDeleteCategory,
  onEditCategory,
  onSelect,
  onTopCategory,
}: {
  active: boolean;
  category: WorkbenchQuickReplyCategoryDto;
  disabled?: boolean;
  onBottomCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onCreateCategory: (parentId: string | 0) => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onSelect: () => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  return (
    <>
      <button
        className={cn(
          "h-7 max-w-28 shrink-0 truncate rounded-[3px] px-2 text-left text-[13px] font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-primary/55 text-primary-foreground/95 hover:bg-primary/65 hover:text-primary-foreground",
        )}
        onClick={onSelect}
        onContextMenu={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
          });
        }}
        disabled={disabled}
        type="button"
      >
        {category.title}
      </button>
      <CategoryContextMenu
        category={category}
        onClose={() => setContextMenu(null)}
        onCreateCategory={onCreateCategory}
        onDeleteCategory={onDeleteCategory}
        onEditCategory={onEditCategory}
        onBottomCategory={onBottomCategory}
        onTopCategory={onTopCategory}
        position={contextMenu}
      />
    </>
  );
}

function SecondaryCategorySection({
  active,
  categories,
  category,
  isLoading,
  quickReplies,
  onCategoryEnsureOpen,
  onCategoryToggle,
  scrollViewportRef,
  onBottomCategory,
  onBottomQuickReply,
  onCopyQuickReply,
  onCreateQuickReply,
  onDeleteCategory,
  onDeleteQuickReply,
  onEditCategory,
  onEditQuickReply,
  onMoveCategory,
  onMoveQuickReply,
  onSelectQuickReply,
  onSortQuickRepliesChange,
  onTopCategory,
  onTopQuickReply,
  sortMode,
}: {
  active: boolean;
  categories: WorkbenchQuickReplyCategoryDto[];
  category: WorkbenchQuickReplyCategoryDto;
  isLoading: boolean;
  quickReplies: WorkbenchQuickReplyDto[];
  onCategoryEnsureOpen: (categoryId: string) => void;
  onCategoryToggle: (categoryId: string) => void;
  scrollViewportRef: RefObject<HTMLDivElement | null>;
  onBottomCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onBottomQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onCopyQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onCreateQuickReply: (categoryId: string) => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onDeleteQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onMoveCategory: (
    category: WorkbenchQuickReplyCategoryDto,
    parentId: string,
  ) => void;
  onMoveQuickReply: (
    quickReply: WorkbenchQuickReplyDto,
    categoryId: string,
  ) => void;
  onSelectQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onSortQuickRepliesChange?: (quickReplies: WorkbenchQuickReplyDto[]) => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onTopQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  sortMode?: QuickReplySortMode;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    const header = headerRef.current;

    if (!viewport || !header) {
      return;
    }

    const updateStuckState = () => {
      const viewportTop = viewport.getBoundingClientRect().top;
      const headerTop = header.getBoundingClientRect().top;

      setIsStuck(viewport.scrollTop > 0 && headerTop <= viewportTop);
    };

    updateStuckState();
    viewport.addEventListener("scroll", updateStuckState, { passive: true });
    window.addEventListener("resize", updateStuckState);

    return () => {
      viewport.removeEventListener("scroll", updateStuckState);
      window.removeEventListener("resize", updateStuckState);
    };
  }, [scrollViewportRef]);

  const isSortMode = sortMode !== null && sortMode !== undefined;
  const isCategorySortMode = sortMode === "category";
  const isReplySortMode = sortMode === "reply";

  return (
    <div className="w-full max-w-full">
      <div
        aria-label={`${category.title}分类行`}
        className={cn(
          "group z-10 flex h-9 items-center gap-2 px-2.5",
          isStuck
            ? "bg-primary text-primary-foreground"
            : active
              ? "bg-primary/10 text-foreground"
              : "bg-primary/8 text-foreground",
        )}
        data-stuck={isStuck}
        ref={headerRef}
        role="group"
        style={{
          position: "sticky",
          top: 0,
        }}
        onContextMenu={
          isSortMode
            ? undefined
            : (event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                });
              }
        }
      >
        {isCategorySortMode ? (
          <SortableItemHandle
            aria-label={`拖拽${category.title}`}
            className="flex size-7 shrink-0 cursor-move items-center justify-center rounded-[6px] text-primary hover:cursor-move data-dragging:cursor-move"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={DragDropVerticalIcon}
              size={15}
              strokeWidth={1.8}
            />
          </SortableItemHandle>
        ) : null}
        <button
          aria-disabled={isSortMode}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => {
            if (isSortMode) {
              return;
            }
            onCategoryToggle(category.id);
          }}
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            className={cn(
              "shrink-0",
              isStuck ? "text-primary-foreground" : "text-primary",
            )}
            icon={active ? ArrowDown01Icon : ArrowRight01Icon}
            size={13}
            strokeWidth={1.8}
          />
          <span className="min-w-0 truncate text-[13px] font-medium leading-none">
            {category.title}
          </span>
        </button>
      </div>
      {active && quickReplies.length > 0 ? (
        <div className="w-full max-w-full space-y-0.5 border-t border-divider py-1">
          {isReplySortMode ? (
            <Sortable
              flatCursor
              getItemValue={(quickReply) => quickReply.id}
              onValueChange={(items) => onSortQuickRepliesChange?.(items)}
              value={quickReplies}
            >
              <SortableContent className="w-full max-w-full space-y-0.5">
                {quickReplies.map((quickReply, index) => (
                  <SortableItem key={quickReply.id} value={quickReply.id}>
                    <QuickReplyRow
                      categories={categories}
                      category={category}
                      index={index}
                      quickReply={quickReply}
                      sortMode="reply"
                      onBottom={onBottomQuickReply}
                      onCopy={onCopyQuickReply}
                      onDelete={onDeleteQuickReply}
                      onEdit={onEditQuickReply}
                      onMove={onMoveQuickReply}
                      onSelect={onSelectQuickReply}
                      onTop={onTopQuickReply}
                    />
                  </SortableItem>
                ))}
              </SortableContent>
            </Sortable>
          ) : (
            quickReplies.map((quickReply, index) => (
              <QuickReplyRow
                index={index}
                key={quickReply.id}
                quickReply={quickReply}
                category={category}
                categories={categories}
                onCopy={onCopyQuickReply}
                onDelete={onDeleteQuickReply}
                onEdit={onEditQuickReply}
                onMove={onMoveQuickReply}
                onSelect={onSelectQuickReply}
                onBottom={onBottomQuickReply}
                onTop={onTopQuickReply}
              />
            ))
          )}
        </div>
      ) : null}
      {!isSortMode ? (
        <CategoryContextMenu
          category={category}
          onClose={() => setContextMenu(null)}
          onCreateQuickReply={(categoryId) => {
            onCategoryEnsureOpen(categoryId);
            onCreateQuickReply(categoryId);
          }}
          onDeleteCategory={onDeleteCategory}
          onEditCategory={onEditCategory}
          moveTargets={getCategoryMoveTargets(category, categories)}
          onMoveCategory={onMoveCategory}
          onBottomCategory={onBottomCategory}
          onTopCategory={onTopCategory}
          position={contextMenu}
        />
      ) : null}
    </div>
  );
}

function ScopeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-7 rounded-[7px] text-[13px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function CategoryContextMenu({
  category,
  onClose,
  onBottomCategory,
  onCreateCategory,
  onCreateQuickReply,
  onDeleteCategory,
  onEditCategory,
  moveTargets,
  onMoveCategory,
  onTopCategory,
  position,
}: {
  category: WorkbenchQuickReplyCategoryDto;
  onClose: () => void;
  onBottomCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onCreateCategory?: (parentId: string | 0) => void;
  onCreateQuickReply?: (categoryId: string) => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  moveTargets?: QuickReplyMoveTarget[];
  onMoveCategory?: (
    category: WorkbenchQuickReplyCategoryDto,
    parentId: string,
  ) => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  position: { x: number; y: number } | null;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPosition = useClampedMenuPosition(position, menuRef);
  const [openSubmenu, setOpenSubmenu] = useState<"move" | "sort" | null>(null);

  useEffect(() => {
    if (!position) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, position]);

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50 min-w-[8.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]"
      ref={menuRef}
      role="menu"
      style={{
        left: menuPosition.x,
        top: menuPosition.y,
        visibility: menuPosition.isMeasured ? "visible" : "hidden",
      }}
    >
      {onCreateQuickReply ? (
        <button
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onFocus={() => setOpenSubmenu(null)}
          onMouseEnter={() => setOpenSubmenu(null)}
          onClick={() => {
            onCreateQuickReply(category.id);
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          新建话术
        </button>
      ) : null}
      {onCreateCategory ? (
        <button
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onFocus={() => setOpenSubmenu(null)}
          onMouseEnter={() => setOpenSubmenu(null)}
          onClick={() => {
            onCreateCategory(category.id);
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          添加话术分组
        </button>
      ) : null}
      <SortSubmenu
        isOpen={openSubmenu === "sort"}
        onBottom={() => onBottomCategory(category)}
        onClose={onClose}
        onOpen={() => setOpenSubmenu("sort")}
        onTop={() => onTopCategory(category)}
      />
      {onMoveCategory && moveTargets && moveTargets.length > 0 ? (
        <MoveSubmenu
          ariaLabel="移动分类"
          isOpen={openSubmenu === "move"}
          onClose={onClose}
          onOpen={() => setOpenSubmenu("move")}
          onSelect={(targetId) => onMoveCategory(category, targetId)}
          targets={moveTargets}
        />
      ) : null}
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onFocus={() => setOpenSubmenu(null)}
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onEditCategory(category);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={Edit03Icon} size={16} strokeWidth={1.8} />
        重命名
      </button>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
        onFocus={() => setOpenSubmenu(null)}
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onDeleteCategory(category);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.8} />
        删除
      </button>
    </div>,
    document.body,
  );
}

function SortSubmenu({
  isOpen,
  onBottom,
  onClose,
  onOpen,
  onTop,
}: {
  isOpen: boolean;
  onBottom: () => void;
  onClose: () => void;
  onOpen: () => void;
  onTop: () => void;
}) {
  return (
    <NestedSubmenuShell
      icon={Sorting05Icon}
      isOpen={isOpen}
      label="排序"
      onOpen={onOpen}
    >
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onClick={() => {
          onTop();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={SortByUp01Icon} size={16} strokeWidth={1.8} />
        移到最前
      </button>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onClick={() => {
          onBottom();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={SortByDown01Icon} size={16} strokeWidth={1.8} />
        移到最后
      </button>
    </NestedSubmenuShell>
  );
}

function MoveSubmenu({
  ariaLabel,
  isOpen,
  onClose,
  onOpen,
  onSelect,
  targets,
}: {
  ariaLabel: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onSelect: (targetId: string) => void;
  targets: QuickReplyMoveTarget[];
}) {
  return (
    <NestedSubmenuShell
      ariaLabel={ariaLabel}
      icon={MoveToIcon}
      isOpen={isOpen}
      label="移动"
      onOpen={onOpen}
      scrollable
    >
      {targets.map((target) => (
        <button
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          key={target.id}
          onClick={() => {
            onSelect(target.id);
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          <span className="block min-w-0 flex-1 truncate">{target.title}</span>
        </button>
      ))}
    </NestedSubmenuShell>
  );
}

function NestedSubmenuShell({
  ariaLabel,
  children,
  icon,
  isOpen,
  label,
  onOpen,
  scrollable = false,
}: {
  ariaLabel?: string;
  children: ReactNode;
  icon: typeof Sorting05Icon;
  isOpen: boolean;
  label: string;
  onOpen: () => void;
  scrollable?: boolean;
}) {
  const [side, setSide] = useState<"left" | "right">("right");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const triggerElement = triggerRef.current;
    const submenuElement = submenuRef.current;

    if (!triggerElement || !submenuElement) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const submenuRect = submenuElement.getBoundingClientRect();
    const nextSide =
      triggerRect.right +
        submenuRect.width +
        CONTEXT_MENU_VIEWPORT_PADDING >
      window.innerWidth
        ? "left"
        : "right";

    setSide(nextSide);
  }, [isOpen]);

  return (
    <div className="relative" onMouseEnter={onOpen}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onFocus={onOpen}
        ref={triggerRef}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} />
        <span className="min-w-0 flex-1">{label}</span>
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
      </button>
      {isOpen ? (
        <div
          className={cn(
            "absolute top-0 z-50 min-w-[8.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]",
            side === "left"
              ? "right-[calc(100%+4px)]"
              : "left-[calc(100%+4px)]",
          )}
          data-side={side}
          ref={submenuRef}
          role="menu"
          aria-label={ariaLabel}
          style={
            scrollable
              ? {
                  maxHeight: "240px",
                  overflowY: "auto",
                }
              : undefined
          }
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function QuickReplyRow({
  category,
  categories,
  index,
  quickReply,
  sortMode,
  onBottom,
  onCopy,
  onDelete,
  onEdit,
  onMove,
  onSelect,
  onTop,
}: {
  category: WorkbenchQuickReplyCategoryDto;
  categories: WorkbenchQuickReplyCategoryDto[];
  index: number;
  quickReply: WorkbenchQuickReplyDto;
  sortMode?: QuickReplySortMode;
  onBottom: (quickReply: WorkbenchQuickReplyDto) => void;
  onCopy: (quickReply: WorkbenchQuickReplyDto) => void;
  onDelete: (quickReply: WorkbenchQuickReplyDto) => void;
  onEdit: (quickReply: WorkbenchQuickReplyDto) => void;
  onMove: (quickReply: WorkbenchQuickReplyDto, categoryId: string) => void;
  onSelect: (quickReply: WorkbenchQuickReplyDto) => void;
  onTop: (quickReply: WorkbenchQuickReplyDto) => void;
}) {
  const summary = getQuickReplySummary(quickReply);
  const moveTargets = getQuickReplyMoveTargets(quickReply, category, categories);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const isSortMode = sortMode !== null && sortMode !== undefined;

  return (
    <>
      <div
        className="group flex h-[26px] w-full max-w-full items-center gap-1 overflow-hidden px-1.5 transition-colors hover:bg-accent/45"
        onContextMenu={
          isSortMode
            ? undefined
            : (event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                });
              }
        }
      >
        {isSortMode ? (
          <SortableItemHandle
            aria-label={`拖拽话术${index + 1}`}
            className="flex size-6 shrink-0 cursor-move items-center justify-center rounded-[6px] text-muted-foreground hover:cursor-move data-dragging:cursor-move"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={DragDropVerticalIcon}
              size={14}
              strokeWidth={1.8}
            />
          </SortableItemHandle>
        ) : null}
        <button
          aria-disabled={isSortMode}
          className="flex w-0 min-w-0 flex-1 items-center gap-1 overflow-hidden text-left"
          onClick={() => {
            if (isSortMode) {
              return;
            }
            onSelect(quickReply);
          }}
          type="button"
        >
          <span className="shrink-0 tabular-nums text-[13px] leading-none text-foreground">
            {String(index + 1).padStart(2, "0")}.
          </span>
          {quickReply.labelText ? (
            <QuickReplyTitleBadge
              color={quickReply.labelColor}
              text={quickReply.labelText}
            />
          ) : null}
          <span
            className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-none text-foreground"
            title={summary}
          >
            {summary}
          </span>
        </button>
        {!isSortMode ? (
          <QuickReplyContextMenu
            onClose={() => setContextMenu(null)}
            onDelete={() => setDeleteConfirmOpen(true)}
            onEdit={() => onEdit(quickReply)}
            onCopy={() => onCopy(quickReply)}
            onBottom={() => onBottom(quickReply)}
            onMove={(categoryId) => onMove(quickReply, categoryId)}
            onTop={() => onTop(quickReply)}
            moveTargets={moveTargets}
            position={contextMenu}
          />
        ) : null}
      </div>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除话术</AlertDialogTitle>
            <AlertDialogDescription>
              该话术会从当前分组移除，删除后不可恢复
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(quickReply)}
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

function QuickReplyContextMenu({
  onClose,
  onBottom,
  onCopy,
  onDelete,
  onEdit,
  onMove,
  onTop,
  moveTargets,
  position,
}: {
  onClose: () => void;
  onBottom: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (categoryId: string) => void;
  onTop: () => void;
  moveTargets: QuickReplyMoveTarget[];
  position: { x: number; y: number } | null;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPosition = useClampedMenuPosition(position, menuRef);
  const [openSubmenu, setOpenSubmenu] = useState<"move" | "sort" | null>(null);

  useEffect(() => {
    if (!position) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, position]);

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50 min-w-[8.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)]"
      ref={menuRef}
      role="menu"
      style={{
        left: menuPosition.x,
        top: menuPosition.y,
        visibility: menuPosition.isMeasured ? "visible" : "hidden",
      }}
    >
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onFocus={() => setOpenSubmenu(null)}
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onEdit();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={Edit03Icon} size={16} strokeWidth={1.8} />
        编辑
      </button>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onFocus={() => setOpenSubmenu(null)}
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onCopy();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={CopyPlusIcon} size={16} strokeWidth={1.8} />
        复制话术
      </button>
      <SortSubmenu
        isOpen={openSubmenu === "sort"}
        onBottom={onBottom}
        onClose={onClose}
        onOpen={() => setOpenSubmenu("sort")}
        onTop={onTop}
      />
      {moveTargets.length > 0 ? (
        <MoveSubmenu
          ariaLabel="移动话术"
          isOpen={openSubmenu === "move"}
          onClose={onClose}
          onOpen={() => setOpenSubmenu("move")}
          onSelect={onMove}
          targets={moveTargets}
        />
      ) : null}
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
        onFocus={() => setOpenSubmenu(null)}
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onDelete();
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.8} />
        删除
      </button>
    </div>,
    document.body,
  );
}

function useClampedMenuPosition(
  position: { x: number; y: number } | null,
  menuRef: RefObject<HTMLDivElement | null>,
) {
  const [menuPosition, setMenuPosition] = useState({
    isMeasured: false,
    x: position?.x ?? 0,
    y: position?.y ?? 0,
  });

  useEffect(() => {
    if (!position) {
      return;
    }

    setMenuPosition({
      isMeasured: false,
      x: position.x,
      y: position.y,
    });
  }, [position]);

  useEffect(() => {
    if (!position) {
      return;
    }

    const menuElement = menuRef.current;

    if (!menuElement) {
      return;
    }

    const rect = menuElement.getBoundingClientRect();
    const maxX = Math.max(
      CONTEXT_MENU_VIEWPORT_PADDING,
      window.innerWidth - rect.width - CONTEXT_MENU_VIEWPORT_PADDING,
    );
    const maxY = Math.max(
      CONTEXT_MENU_VIEWPORT_PADDING,
      window.innerHeight - rect.height - CONTEXT_MENU_VIEWPORT_PADDING,
    );

    setMenuPosition({
      isMeasured: true,
      x: Math.min(Math.max(position.x, CONTEXT_MENU_VIEWPORT_PADDING), maxX),
      y: Math.min(Math.max(position.y, CONTEXT_MENU_VIEWPORT_PADDING), maxY),
    });
  }, [menuRef, position]);

  return menuPosition;
}

function getQuickReplySummary(quickReply: WorkbenchQuickReplyDto) {
  const contentText = quickReply.contentText.trim();

  if (contentText) {
    return contentText;
  }

  const firstAttachment = quickReply.attachments[0];

  if (firstAttachment) {
    return getQuickReplyAttachmentFallbackText(firstAttachment.type);
  }

  return "空话术";
}

function quickReplyMatchesKeyword(
  quickReply: WorkbenchQuickReplyDto,
  keyword: string,
) {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return true;
  }

  const haystacks = [
    quickReply.contentText,
    quickReply.labelText,
    ...quickReply.attachments.flatMap((attachment) => {
      const content = attachment.content;

      return [
        readQuickReplyContentString(content.title),
        readQuickReplyContentString(content.description),
        readQuickReplyContentString(content.desc),
        readQuickReplyContentString(content.fileName),
      ];
    }),
  ];

  return haystacks.some((value) => value.toLowerCase().includes(normalizedKeyword));
}

function getCategoryMoveTargets(
  category: WorkbenchQuickReplyCategoryDto,
  categories: WorkbenchQuickReplyCategoryDto[],
): QuickReplyMoveTarget[] {
  if (category.parentId === 0) {
    return [];
  }

  return categories
    .filter(
      (target) =>
        target.scopeType === category.scopeType &&
        target.parentId === 0 &&
        target.id !== category.parentId,
    )
    .map((target) => ({
      id: target.id,
      title: target.title,
    }));
}

function getQuickReplyMoveTargets(
  quickReply: WorkbenchQuickReplyDto,
  category: WorkbenchQuickReplyCategoryDto,
  categories: WorkbenchQuickReplyCategoryDto[],
): QuickReplyMoveTarget[] {
  if (category.parentId === 0 || quickReply.categoryId !== category.id) {
    return [];
  }

  return categories
    .filter(
      (target) =>
        target.scopeType === quickReply.scopeType &&
        target.parentId === category.parentId &&
        target.id !== category.id,
    )
    .map((target) => ({
      id: target.id,
      title: target.title,
    }));
}

function readQuickReplyContentString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getQuickReplyAttachmentFallbackText(
  type: WorkbenchQuickReplyDto["attachments"][number]["type"],
) {
  switch (type) {
    case "image":
      return "图片";
    case "file":
      return "文件";
    case "h5":
      return "H5";
    case "weapp":
      return "小程序";
    case "sphfeed":
      return "视频号";
    default:
      return "附件";
  }
}

function QuickReplyTitleBadge({
  color,
  text,
}: {
  color: string;
  text: string;
}) {
  const paletteColor = getQuickReplyTitleColor(color);

  return (
    <span
      className="inline-flex h-5 shrink-0 items-center truncate rounded-[2px] border px-1 text-[12px] font-medium leading-none"
      style={{
        backgroundColor: paletteColor.backgroundColor,
        borderColor: paletteColor.borderColor,
        color: paletteColor.foregroundColor,
      }}
    >
      {text}
    </span>
  );
}
