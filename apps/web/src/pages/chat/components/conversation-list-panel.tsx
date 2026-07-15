import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  LicenseNoIcon,
  Male02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useShallow } from "zustand/react/shallow";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyMedia } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import { formatUnreadCount } from "@/pages/chat/components/unread-count-badge";
import type { ChatMode, Conversation } from "@/pages/chat/chat-types";
import { isConversationAIHostingEnabled } from "@/pages/chat/lib/conversation-ai-hosting";
import type { ConversationComposerDraft } from "@/pages/chat/lib/conversation-composer-draft";
import {
  DEFAULT_CONVERSATION_VIEW,
  filterConversationsByView,
  getConversationViewLabel,
  getConversationViewOptions,
  type ConversationView,
} from "@/pages/chat/lib/conversation-view";
import type {
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
} from "@chatai/contracts";
import { useWorkbenchStore } from "@/store/workbench-store";

type SearchResultItem = WorkbenchSearchContactResultDto | WorkbenchSearchGroupResultDto;

const CUSTOMER_PREVIEW_LIMIT = 5;
const GROUP_PREVIEW_LIMIT = 10;
const CHAT_MODES = ["single", "group"] as const satisfies readonly ChatMode[];

type ConversationListPanelProps = {
  activeConversation?: Conversation;
  activeMode: ChatMode;
  activeView?: ConversationView;
  conversationViews?: Record<ChatMode, ConversationView>;
  composerDraftsByConversationId?: Record<string, ConversationComposerDraft>;
  conversations: Conversation[];
  isSeatAIHostingEnabled?: boolean;
  /** 席位群聊是否允许开启 AI 回复；用于群聊列表头像 AI 托管角标 */
  isGroupFullAutoAuth?: boolean;
  isConversationActionDisabled?: boolean;
  isConversationLoading?: boolean;
  onMarkConversationRead?: (conversationId: string) => void | Promise<void>;
  onMarkConversationUnread?: (conversationId: string) => void | Promise<void>;
  onDeleteConversation?: (conversationId: string) => void | Promise<void>;
  onPinConversation?: (conversationId: string) => void | Promise<void>;
  onRefreshUnreadConversations?: (mode: ChatMode) => void | Promise<void>;
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onSelectMode: (mode: ChatMode) => void | Promise<void>;
  onSelectView?: (view: ConversationView) => void | Promise<void>;
  onUnpinConversation?: (conversationId: string) => void | Promise<void>;
  retainedConversationIds?: ReadonlySet<string>;
  searchableConversations?: Conversation[];
  hasMoreUnreadByMode?: Partial<Record<ChatMode, boolean>>;
  unreadCountByMode?: Partial<Record<ChatMode, number>>;
};

export function ConversationListPanel({
  activeConversation,
  activeMode,
  activeView = DEFAULT_CONVERSATION_VIEW,
  conversationViews,
  composerDraftsByConversationId = {},
  conversations,
  isSeatAIHostingEnabled = false,
  isGroupFullAutoAuth = false,
  isConversationActionDisabled = false,
  isConversationLoading = false,
  onMarkConversationRead,
  onMarkConversationUnread,
  onDeleteConversation,
  onPinConversation,
  onRefreshUnreadConversations,
  onSelectConversation,
  onSelectMode,
  onSelectView,
  onUnpinConversation,
  retainedConversationIds,
  searchableConversations = conversations,
  hasMoreUnreadByMode,
  unreadCountByMode: unreadCountByModeProp,
}: ConversationListPanelProps) {
  const {
    searchKeyword,
    searchResults,
    isSearchLoading,
    setSearchKeyword,
    selectOrCreateAndSelectConversation,
    conversationOpenError,
    dismissConversationOpenError,
  } = useWorkbenchStore(
    useShallow((state) => ({
      conversationOpenError: state.conversationOpenError,
      dismissConversationOpenError: state.dismissConversationOpenError,
      isSearchLoading: state.isSearchLoading,
      searchKeyword: state.searchKeyword,
      searchResults: state.searchResults,
      selectOrCreateAndSelectConversation:
        state.selectOrCreateAndSelectConversation,
      setSearchKeyword: state.setSearchKeyword,
    })),
  );
  const [expandedSearchSection, setExpandedSearchSection] = useState<ChatMode | null>(
    null,
  );
  const normalizedKeyword = searchKeyword.trim().toLocaleLowerCase();
  const isSearchOpen = normalizedKeyword.length > 0;
  const [mountedModes, setMountedModes] = useState<ReadonlySet<ChatMode>>(
    () => new Set([activeMode]),
  );
  const viewsByMode = useMemo(
    () => conversationViews ?? {
      group: activeView,
      single: activeView,
    },
    [activeView, conversationViews],
  );
  const conversationsByMode = useMemo(
    () => ({
      group: filterConversationsByView(
        conversations,
        "group",
        viewsByMode.group,
        false,
        activeMode === "group" ? retainedConversationIds : undefined,
      ),
      single: filterConversationsByView(
        conversations,
        "single",
        viewsByMode.single,
        isSeatAIHostingEnabled,
        activeMode === "single" ? retainedConversationIds : undefined,
      ),
    }),
    [
      activeMode,
      conversations,
      isSeatAIHostingEnabled,
      retainedConversationIds,
      viewsByMode.group,
      viewsByMode.single,
    ],
  );
  const loadedUnreadCountByMode = useMemo(
    () => ({
      group: getUnreadCountByMode(conversations, "group"),
      single: getUnreadCountByMode(conversations, "single"),
    }),
    [conversations],
  );
  const unreadCountByMode = {
    group: unreadCountByModeProp?.group ?? loadedUnreadCountByMode.group,
    single: unreadCountByModeProp?.single ?? loadedUnreadCountByMode.single,
  };

  useEffect(() => {
    setMountedModes((currentModes) => {
      if (currentModes.has(activeMode)) {
        return currentModes;
      }

      return new Set([...currentModes, activeMode]);
    });
  }, [activeMode]);

  const handleSearchSelect = (item: SearchResultItem) => {
    setExpandedSearchSection(null);
    void selectOrCreateAndSelectConversation(item);
  };

  return (
    <>
      <AlertDialog
        open={!!conversationOpenError}
        onOpenChange={(open) => {
          if (!open) dismissConversationOpenError();
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>开启会话失败</AlertDialogTitle>
            <AlertDialogDescription>
              {conversationOpenError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={dismissConversationOpenError}>
              我知道了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="flex min-h-0 min-w-0 flex-col border-r border-divider bg-surface">
      <div className="border-b border-divider px-4 py-4">
        <Popover
          modal={false}
          onOpenChange={(open) => {
            if (!open) {
              setSearchKeyword("");
              setExpandedSearchSection(null);
            }
          }}
          open={isSearchOpen}
        >
          <PopoverAnchor asChild>
            <div className="relative">
              <HugeiconsIcon
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                color="currentColor"
                icon={Search01Icon}
                size={16}
                strokeWidth={1.8}
              />
              <Input
                className="h-9 rounded-xl border border-transparent bg-surface-muted pl-10 pr-9 text-sm shadow-none transition-colors focus-visible:border-input focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/12"
                onChange={(event) => {
                  setSearchKeyword(event.target.value);
                  setExpandedSearchSection(null);
                }}
                placeholder="搜索客户、群名称"
                value={searchKeyword}
              />
              {searchKeyword ? (
                <Button
                  aria-label="清空搜索"
                  className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md p-0 text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                  onClick={() => {
                    setSearchKeyword("");
                    setExpandedSearchSection(null);
                  }}
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
          </PopoverAnchor>
          <PopoverContent
            align="start"
            aria-label="搜索结果"
            className={cn(
              "w-[26rem] rounded-lg border-border bg-popover p-0 text-popover-foreground shadow-[0_12px_32px_var(--shadow-medium)]",
              expandedSearchSection
                ? "h-[min(34rem,calc(100vh-7rem))] overflow-hidden"
                : "h-[min(34rem,calc(100vh-7rem))] overflow-hidden",
            )}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
            }}
            sideOffset={4}
          >
            <SearchResultDropdown
              expandedSection={expandedSearchSection}
              groups={searchResults?.groups ?? []}
              keyword={searchKeyword.trim()}
              onCollapse={() => setExpandedSearchSection(null)}
              onExpand={setExpandedSearchSection}
              onSelect={handleSearchSelect}
              customers={searchResults?.contacts ?? []}
              isLoading={isSearchLoading}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-h-0 flex-1">
        <Tabs
          className="flex h-full min-h-0 flex-col"
          onValueChange={(value) => {
            startTransition(() => {
              void onSelectMode(value as ChatMode);
            });
          }}
          value={activeMode}
        >
          <div className="border-b border-divider px-4">
            <TabsList className="h-auto w-full justify-center gap-5 rounded-none bg-transparent p-0">
              {CHAT_MODES.map((mode) => (
                <ConversationModeTab
                  isActive={activeMode === mode}
                  isSeatAIHostingEnabled={isSeatAIHostingEnabled}
                  key={mode}
                  mode={mode}
                  onSelectView={onSelectView}
                  unreadCount={unreadCountByMode[mode]}
                  view={activeView}
                />
              ))}
            </TabsList>
          </div>

          {CHAT_MODES.map((mode) => {
            const modeConversations = conversationsByMode[mode];

            return (
              <TabsContent
                className={cn(
                  "mt-0 min-h-0 flex-1",
                  mode !== activeMode && "hidden",
                )}
                forceMount={mountedModes.has(mode) ? true : undefined}
                hidden={mode !== activeMode}
                key={mode}
                value={mode}
              >
                {mountedModes.has(mode) ? (
                  <ScrollArea
                    className="h-full"
                    data-testid={
                      mode === activeMode ? "conversation-list-scroll-area" : undefined
                    }
                  >
                    <div className="bg-surface px-2 py-1.5">
                      {modeConversations.length === 0 && isConversationLoading ? (
                        <div className="flex min-h-40 items-center justify-center gap-2 px-2 py-6 text-[13px] text-muted-foreground">
                          <DotMatrixLoader
                            ariaLabel="正在加载会话"
                            className="text-foreground"
                            dotSize={3}
                            size={22}
                          />
                          <span>正在加载会话</span>
                        </div>
                      ) : null}
                      {modeConversations.length === 0 && !isConversationLoading ? (
                        <Empty
                          aria-label="暂无数据"
                          className="min-h-40 gap-0 px-2 py-6 text-[13px] text-muted-foreground/40"
                          role="status"
                        >
                          <EmptyMedia
                            className="bg-background text-muted-foreground opacity-20"
                            variant="icon"
                          >
                            <HugeiconsIcon
                              color="currentColor"
                              icon={LicenseNoIcon}
                              size={22}
                            />
                          </EmptyMedia>
                          <span>暂无数据</span>
                        </Empty>
                      ) : null}
                      {modeConversations.map((conversation) => (
                        <ConversationCard
                          composerDraft={
                            conversation.id === activeConversation?.id
                              ? undefined
                              : composerDraftsByConversationId[conversation.id]
                          }
                          conversation={conversation}
                          isActionDisabled={isConversationActionDisabled}
                          isActive={conversation.id === activeConversation?.id}
                          isAIHostingEnabled={isConversationAIHostingEnabled(
                            conversation,
                            isSeatAIHostingEnabled,
                            isGroupFullAutoAuth,
                          )}
                          key={conversation.id}
                          onDelete={() => {
                            void onDeleteConversation?.(conversation.id);
                          }}
                          onMarkRead={() => {
                            void onMarkConversationRead?.(conversation.id);
                          }}
                          onMarkUnread={() => {
                            void onMarkConversationUnread?.(conversation.id);
                          }}
                          onPin={() => {
                            void onPinConversation?.(conversation.id);
                          }}
                          onSelect={() => {
                            startTransition(() => {
                              void onSelectConversation(conversation.id);
                            });
                          }}
                          onUnpin={() => {
                            void onUnpinConversation?.(conversation.id);
                          }}
                        />
                      ))}
                      {viewsByMode[mode] === "unread" && hasMoreUnreadByMode?.[mode] ? (
                        <div className="px-2 py-3">
                          <Button
                            className="h-8 w-full text-xs"
                            onClick={() => {
                              void onRefreshUnreadConversations?.(mode);
                            }}
                            type="button"
                            variant="outline"
                          >
                            刷新未读列表
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                ) : null}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </section>
    </>
  );
}

const conversationModeTabClassName =
  "relative rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

function ConversationModeTab({
  isActive,
  isSeatAIHostingEnabled,
  mode,
  onSelectView,
  unreadCount,
  view,
}: {
  isActive: boolean;
  isSeatAIHostingEnabled: boolean;
  mode: ChatMode;
  onSelectView?: (view: ConversationView) => void | Promise<void>;
  unreadCount: number;
  view: ConversationView;
}) {
  if (!isActive) {
    return (
      <TabsTrigger className={conversationModeTabClassName} value={mode}>
        {getConversationModeLabel(mode)}
        {unreadCount > 0 ? (
          <ConversationModeUnreadDot
            className="-right-1 top-2"
            mode={mode}
          />
        ) : null}
      </TabsTrigger>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TabsTrigger
          aria-label={`${getConversationModeLabel(mode)}视图`}
          className={cn(
            conversationModeTabClassName,
            "border-primary bg-transparent text-foreground shadow-none",
          )}
          value={mode}
        >
          <ConversationModeTabLabel
            isSeatAIHostingEnabled={isSeatAIHostingEnabled}
            mode={mode}
            unreadCount={unreadCount}
            view={view}
          />
        </TabsTrigger>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-28">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            void onSelectView?.(value as ConversationView);
          }}
          value={resolveActiveConversationView(mode, view, isSeatAIHostingEnabled)}
        >
          {getConversationViewOptions(mode, isSeatAIHostingEnabled).map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span
                className="w-16 shrink-0"
                data-testid={`conversation-view-label-${mode}-${option.value}`}
              >
                {option.label}
              </span>
              {option.value === "unread" && unreadCount > 0 ? (
                <ConversationViewUnreadBadge mode={mode} unreadCount={unreadCount} />
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConversationViewUnreadBadge({
  mode,
  unreadCount,
}: {
  mode: ChatMode;
  unreadCount: number;
}) {
  return (
    <span
      className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums"
      data-testid={`conversation-view-unread-count-${mode}`}
    >
      {formatUnreadCount(unreadCount)}
    </span>
  );
}

function ConversationModeTabLabel({
  isSeatAIHostingEnabled,
  mode,
  unreadCount,
  view,
}: {
  isSeatAIHostingEnabled: boolean;
  mode: ChatMode;
  unreadCount: number;
  view: ConversationView;
}) {
  const modeLabel = getConversationModeLabel(mode);
  const selectedView = resolveActiveConversationView(mode, view, isSeatAIHostingEnabled);
  const viewLabel = selectedView === "all"
    ? ""
    : ` · ${getConversationViewLabel(selectedView)}`;

  return (
    <>
      <span>{modeLabel}{viewLabel}</span>
      <span
        className="relative inline-flex"
        data-testid={`conversation-mode-dropdown-icon-${mode}`}
      >
        <HugeiconsIcon
          color="currentColor"
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.8}
        />
        {unreadCount > 0 ? (
          <ConversationModeUnreadDot
            className="-right-1 -top-0.5"
            mode={mode}
          />
        ) : null}
      </span>
    </>
  );
}

function ConversationModeUnreadDot({
  className,
  mode,
}: {
  className?: string;
  mode: ChatMode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute size-1.5 rounded-full bg-destructive", className)}
      data-testid={`conversation-mode-unread-dot-${mode}`}
    />
  );
}

function getUnreadCountByMode(conversations: Conversation[], mode: ChatMode) {
  return conversations.reduce(
    (total, conversation) =>
      conversation.mode === mode ? total + Math.max(0, conversation.unread) : total,
    0,
  );
}

function getConversationModeLabel(mode: ChatMode) {
  return mode === "single" ? "单聊" : "群聊";
}

function resolveActiveConversationView(
  mode: ChatMode,
  view: ConversationView,
  isSeatAIHostingEnabled: boolean,
) {
  const options = getConversationViewOptions(mode, isSeatAIHostingEnabled);
  return options.some((option) => option.value === view)
    ? view
    : DEFAULT_CONVERSATION_VIEW;
}

function SearchResultDropdown({
  customers,
  expandedSection,
  groups,
  keyword,
  onCollapse,
  onExpand,
  onSelect,
  isLoading,
}: {
  customers: WorkbenchSearchContactResultDto[];
  expandedSection: ChatMode | null;
  groups: WorkbenchSearchGroupResultDto[];
  keyword: string;
  onCollapse: () => void;
  onExpand: (section: ChatMode) => void;
  onSelect: (item: SearchResultItem) => void;
  isLoading: boolean;
}) {
  const isShowingCustomers = expandedSection === null || expandedSection === "single";
  const isShowingGroups = expandedSection === null || expandedSection === "group";
  const visibleCustomers =
    expandedSection === "single" ? customers : customers.slice(0, CUSTOMER_PREVIEW_LIMIT);
  const visibleGroups =
    expandedSection === "group" ? groups : groups.slice(0, GROUP_PREVIEW_LIMIT);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner variant="classic" size={18} />
        <span>正在搜索中...</span>
      </div>
    );
  }

  if (customers.length === 0 && groups.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        没有匹配的联系人或群聊。
      </div>
    );
  }

  if (expandedSection) {
    const title = expandedSection === "single" ? "联系人" : "群聊";
    const contactsList = expandedSection === "single" ? customers : [];
    const groupsList = expandedSection === "group" ? groups : [];

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-popover px-4 py-2 border-b border-divider">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        </div>
        <ScrollArea
          className="min-h-0 flex-1"
          data-testid="conversation-search-expanded-scroll-area"
          viewportProps={{
            "aria-label": `${title}搜索结果`,
            className: "py-0",
            role: "list",
          }}
        >
          <div className="space-y-1 py-2">
            {expandedSection === "single"
              ? contactsList.map((contact) => (
                  <SearchContactResultItem
                    item={contact}
                    key={contact.thirdExternalUserId}
                    keyword={keyword}
                    onSelect={() => onSelect(contact)}
                  />
                ))
              : groupsList.map((group) => (
                  <SearchGroupResultItem
                    item={group}
                    key={group.thirdGroupId}
                    keyword={keyword}
                    onSelect={() => onSelect(group)}
                  />
                ))}
          </div>
        </ScrollArea>
        <div className="shrink-0 px-4 py-2 border-t border-divider">
          <Button
            className="h-auto rounded-none p-0 text-[13px] font-medium text-primary hover:bg-transparent hover:text-primary/85"
            onClick={onCollapse}
            type="button"
            variant="ghost"
          >
            收起
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea
      className="h-full"
      data-testid="conversation-search-results-scroll-area"
    >
      <div>
        {isShowingCustomers && customers.length > 0 ? (
          <section className="py-3">
            <h2 className="mb-2 px-4 text-[12px] font-semibold text-muted-foreground">
              联系人
            </h2>
            <div className="space-y-1">
              {visibleCustomers.map((contact) => (
                <SearchContactResultItem
                  item={contact}
                  key={contact.thirdExternalUserId}
                  keyword={keyword}
                  onSelect={() => onSelect(contact)}
                />
              ))}
            </div>
            {customers.length > CUSTOMER_PREVIEW_LIMIT ? (
              <Button
                className="mx-4 mt-3 h-auto rounded-none p-0 text-[12px] font-medium text-primary hover:bg-transparent hover:text-primary/85"
                onClick={() => onExpand("single")}
                type="button"
                variant="ghost"
              >
                查看全部
              </Button>
            ) : null}
          </section>
        ) : null}
        {isShowingCustomers && isShowingGroups && customers.length > 0 && groups.length > 0 ? (
          <div className="border-t border-divider" />
        ) : null}
        {isShowingGroups && groups.length > 0 ? (
          <section className="py-3">
            <h2 className="mb-2 px-4 text-[12px] font-semibold text-muted-foreground">
              群聊
            </h2>
            <div className="space-y-1">
              {visibleGroups.map((group) => (
                <SearchGroupResultItem
                  item={group}
                  key={group.thirdGroupId}
                  keyword={keyword}
                  onSelect={() => onSelect(group)}
                />
              ))}
            </div>
            {groups.length > GROUP_PREVIEW_LIMIT ? (
              <Button
                className="mx-4 mt-3 h-auto rounded-none p-0 text-[12px] font-medium text-primary hover:bg-transparent hover:text-primary/85"
                onClick={() => onExpand("group")}
                type="button"
                variant="ghost"
              >
                查看全部
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function SearchContactResultItem({
  item,
  keyword,
  onSelect,
}: {
  item: WorkbenchSearchContactResultDto;
  keyword: string;
  onSelect: () => void;
}) {
  const displayName = formatContactDisplayName(item);
  return (
    <Button
      className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-center justify-normal gap-2 rounded-none px-4 py-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/20"
      onClick={onSelect}
      type="button"
      variant="ghost"
    >
      <Avatar className="size-10 rounded-[8px]">
        <AvatarImage
          alt={displayName}
          src={item.avatar}
        />
        <AvatarFallback className="rounded-[8px]">
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={Male02Icon}
            size={18}
            strokeWidth={1.8}
          />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 self-center">
        <p className="truncate text-[14px] font-normal text-foreground">
          <HighlightedText text={displayName} keyword={keyword} />
        </p>
      </div>
    </Button>
  );
}

function formatContactDisplayName(item: WorkbenchSearchContactResultDto) {
  const name = item.name?.trim() || "未知客户";
  const remark = item.remark?.trim();

  if (remark && remark !== name) {
    return `${remark}（${name}）`;
  }

  return name;
}

function SearchGroupResultItem({
  item,
  keyword,
  onSelect,
}: {
  item: WorkbenchSearchGroupResultDto;
  keyword: string;
  onSelect: () => void;
}) {
  const groupName = item.remark || item.name || "未知群聊";
  return (
    <Button
      className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-center justify-normal gap-2 rounded-none px-4 py-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/20"
      onClick={onSelect}
      type="button"
      variant="ghost"
    >
      <Avatar className="size-10 rounded-[8px]">
        <AvatarImage
          alt={groupName}
          src={item.avatar}
        />
        <AvatarFallback className="rounded-[8px]">
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={Male02Icon}
            size={18}
            strokeWidth={1.8}
          />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 self-center">
        <p className="truncate text-[14px] font-normal text-foreground">
          <HighlightedText text={groupName} keyword={keyword} />
        </p>
      </div>
    </Button>
  );
}

function HighlightedText({ keyword, text }: { keyword: string; text: string }) {
  if (!keyword) {
    return text;
  }

  const matchIndex = text.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());

  if (matchIndex < 0) {
    return text;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + keyword.length);
  const after = text.slice(matchIndex + keyword.length);

  return (
    <>
      {before}
      <span className={cn("px-0 text-primary")}>{match}</span>
      {after}
    </>
  );
}
