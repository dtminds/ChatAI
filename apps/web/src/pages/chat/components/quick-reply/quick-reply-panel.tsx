import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CopyPlusIcon,
  Delete01Icon,
  Edit03Icon,
  Search01Icon,
  SortByDown01Icon,
  SortByUp01Icon,
  Sorting05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getQuickReplyTitleColor } from "@/pages/chat/components/quick-reply/quick-reply-title-palette";

const CONTEXT_MENU_VIEWPORT_PADDING = 8;

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
  onKeywordChange: (keyword: string) => void;
  onScopeTypeChange: (scopeType: QuickReplyScopeType) => void;
  onSelectQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
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
  onKeywordChange,
  onScopeTypeChange,
  onSelectQuickReply,
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
  useEffect(() => {
    if (!activeTopCategory || childCategories.length === 0) {
      setManualExpandedCategoryIds(new Set());
      return;
    }

    setManualExpandedCategoryIds(new Set(childCategories.map((category) => category.id)));
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-divider px-2.5 py-2.5">
        <div className="grid grid-cols-2 items-center gap-2">
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
              icon={Search01Icon}
              size={15}
              strokeWidth={1.8}
            />
            <Input
              className="h-8 pl-8 text-[13px]"
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="搜索话术"
              value={keyword}
            />
          </div>
        </div>
      </div>

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
                  disabled={isMutating}
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
          >
            <div className="w-full max-w-full overflow-hidden">
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
                  请先新建一级分类
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
                    暂无二级分类
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
                    新建二级分类
                  </Button>
                </div>
              ) : (
                visibleChildCategories.map((category) => (
                  <SecondaryCategorySection
                    active={expandedCategoryIds.has(category.id)}
                    categories={categories}
                    category={category}
                    isLoading={isLoading}
                    key={category.id}
                    quickReplies={filteredQuickRepliesByCategoryId[category.id] ?? []}
                    onCategoryEnsureOpen={handleEnsureChildCategoryOpen}
                    onCategoryToggle={handleToggleChildCategory}
                    onBottomCategory={onBottomCategory}
                    onBottomQuickReply={onBottomQuickReply}
                    onCopyQuickReply={onCopyQuickReply}
                    onDeleteCategory={onDeleteCategory}
                    onDeleteQuickReply={onDeleteQuickReply}
                    onEditCategory={onEditCategory}
                    onEditQuickReply={onEditQuickReply}
                    onCreateQuickReply={onCreateQuickReply}
                    onSelectQuickReply={onSelectQuickReply}
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
  onBottomCategory,
  onCreateCategory,
  onDeleteCategory,
  onEditCategory,
  onSelect,
  onTopCategory,
}: {
  active: boolean;
  category: WorkbenchQuickReplyCategoryDto;
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
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
          });
        }}
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
  onBottomCategory,
  onBottomQuickReply,
  onCopyQuickReply,
  onCreateQuickReply,
  onDeleteCategory,
  onDeleteQuickReply,
  onEditCategory,
  onEditQuickReply,
  onSelectQuickReply,
  onTopCategory,
  onTopQuickReply,
}: {
  active: boolean;
  categories: WorkbenchQuickReplyCategoryDto[];
  category: WorkbenchQuickReplyCategoryDto;
  isLoading: boolean;
  quickReplies: WorkbenchQuickReplyDto[];
  onCategoryEnsureOpen: (categoryId: string) => void;
  onCategoryToggle: (categoryId: string) => void;
  onBottomCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onBottomQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onCopyQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onCreateQuickReply: (categoryId: string) => void;
  onDeleteCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onDeleteQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onEditCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onEditQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onSelectQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  onTopQuickReply: (quickReply: WorkbenchQuickReplyDto) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div
        aria-label={`${category.title}分类行`}
        className={cn(
          "group flex h-9 items-center gap-2 border-b border-background px-2.5 transition-colors hover:bg-primary/10",
          active ? "bg-primary/10" : "bg-primary/8",
        )}
        role="group"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onCategoryToggle(category.id)}
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-primary"
            icon={active ? ArrowDown01Icon : ArrowRight01Icon}
            size={13}
            strokeWidth={1.8}
          />
          <span className="min-w-0 truncate text-[13px] font-medium leading-none text-foreground">
            {category.title}
          </span>
        </button>
      </div>
      {active && quickReplies.length > 0 ? (
        <div className="w-full max-w-full space-y-0.5 overflow-hidden border-t border-divider py-1">
          {quickReplies.map((quickReply, index) => (
            <QuickReplyRow
              index={index}
              key={quickReply.id}
              quickReply={quickReply}
              onCopy={onCopyQuickReply}
              onDelete={onDeleteQuickReply}
              onEdit={onEditQuickReply}
              onSelect={onSelectQuickReply}
              onBottom={onBottomQuickReply}
              onTop={onTopQuickReply}
            />
          ))}
        </div>
      ) : null}
      <CategoryContextMenu
        category={category}
        onClose={() => setContextMenu(null)}
        onCreateQuickReply={(categoryId) => {
          onCategoryEnsureOpen(categoryId);
          onCreateQuickReply(categoryId);
        }}
        onDeleteCategory={onDeleteCategory}
        onEditCategory={onEditCategory}
        onBottomCategory={onBottomCategory}
        onTopCategory={onTopCategory}
        position={contextMenu}
      />
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
  onTopCategory: (category: WorkbenchQuickReplyCategoryDto) => void;
  position: { x: number; y: number } | null;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPosition = useClampedMenuPosition(position, menuRef);
  const [openSubmenu, setOpenSubmenu] = useState<"sort" | null>(null);

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
          新建子分类
        </button>
      ) : null}
      <SortSubmenu
        isOpen={openSubmenu === "sort"}
        onBottom={() => onBottomCategory(category)}
        onClose={onClose}
        onOpen={() => setOpenSubmenu("sort")}
        onTop={() => onTopCategory(category)}
      />
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
        <HugeiconsIcon icon={Sorting05Icon} size={16} strokeWidth={1.8} />
        <span className="min-w-0 flex-1">排序</span>
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
        </div>
      ) : null}
    </div>
  );
}

function QuickReplyRow({
  index,
  quickReply,
  onBottom,
  onCopy,
  onDelete,
  onEdit,
  onSelect,
  onTop,
}: {
  index: number;
  quickReply: WorkbenchQuickReplyDto;
  onBottom: (quickReply: WorkbenchQuickReplyDto) => void;
  onCopy: (quickReply: WorkbenchQuickReplyDto) => void;
  onDelete: (quickReply: WorkbenchQuickReplyDto) => void;
  onEdit: (quickReply: WorkbenchQuickReplyDto) => void;
  onSelect: (quickReply: WorkbenchQuickReplyDto) => void;
  onTop: (quickReply: WorkbenchQuickReplyDto) => void;
}) {
  const summary = getQuickReplySummary(quickReply);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  return (
    <div
      className="group flex h-[26px] w-full max-w-full items-center gap-1 overflow-hidden px-1.5 transition-colors hover:bg-accent/45"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <button
        className="flex w-0 min-w-0 flex-1 items-center gap-1 overflow-hidden text-left"
        onClick={() => onSelect(quickReply)}
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
      <QuickReplyContextMenu
        onClose={() => setContextMenu(null)}
        onDelete={() => onDelete(quickReply)}
        onEdit={() => onEdit(quickReply)}
        onCopy={() => onCopy(quickReply)}
        onBottom={() => onBottom(quickReply)}
        onTop={() => onTop(quickReply)}
        position={contextMenu}
      />
    </div>
  );
}

function QuickReplyContextMenu({
  onClose,
  onBottom,
  onCopy,
  onDelete,
  onEdit,
  onTop,
  position,
}: {
  onClose: () => void;
  onBottom: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onTop: () => void;
  position: { x: number; y: number } | null;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPosition = useClampedMenuPosition(position, menuRef);
  const [openSubmenu, setOpenSubmenu] = useState<"sort" | null>(null);

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
      className="inline-flex h-5 max-w-20 shrink-0 items-center truncate rounded-[2px] border px-1 text-[12px] font-medium leading-none"
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
