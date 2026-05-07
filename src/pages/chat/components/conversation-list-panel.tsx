import { startTransition, useMemo, useState } from "react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { ChatMode, Conversation } from "@/pages/chat/chat-types";

const CUSTOMER_PREVIEW_LIMIT = 5;
const GROUP_PREVIEW_LIMIT = 10;

type ConversationListPanelProps = {
  activeConversation?: Conversation;
  activeMode: ChatMode;
  conversations: Conversation[];
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onSelectMode: (mode: ChatMode) => void | Promise<void>;
  searchableConversations?: Conversation[];
};

export function ConversationListPanel({
  activeConversation,
  activeMode,
  conversations,
  onSelectConversation,
  onSelectMode,
  searchableConversations = conversations,
}: ConversationListPanelProps) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [expandedSearchSection, setExpandedSearchSection] = useState<ChatMode | null>(
    null,
  );
  const normalizedKeyword = searchKeyword.trim().toLocaleLowerCase();
  const isSearchOpen = normalizedKeyword.length > 0;
  const searchResults = useMemo(() => {
    if (!normalizedKeyword) {
      return { customers: [], groups: [] };
    }

    const matchedConversations = searchableConversations.filter((conversation) =>
      conversation.customerName.toLocaleLowerCase().includes(normalizedKeyword),
    );

    return {
      customers: matchedConversations.filter(
        (conversation) => conversation.mode === "single",
      ),
      groups: matchedConversations.filter((conversation) => conversation.mode === "group"),
    };
  }, [normalizedKeyword, searchableConversations]);

  const handleSearchSelect = (conversation: Conversation) => {
    setSearchKeyword("");
    setExpandedSearchSection(null);
    startTransition(() => {
      void onSelectMode(conversation.mode);
      void onSelectConversation(conversation.id);
    });
  };

  return (
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
              groups={searchResults.groups}
              keyword={searchKeyword.trim()}
              onCollapse={() => setExpandedSearchSection(null)}
              onExpand={setExpandedSearchSection}
              onSelect={handleSearchSelect}
              customers={searchResults.customers}
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
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="single"
              >
                单聊
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="group"
              >
                群聊
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value={activeMode}>
            <ScrollArea className="h-full" data-testid="conversation-list-scroll-area">
              <div className="bg-surface px-2 py-1.5">
                {conversations.length === 0 ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground">
                    当前账号下暂无{activeMode === "single" ? "单聊" : "群聊"}占位数据。
                  </div>
                ) : null}
                {conversations.map((conversation) => (
                  <ConversationCard
                    conversation={conversation}
                    isActive={conversation.id === activeConversation?.id}
                    key={conversation.id}
                    onSelect={() => {
                      startTransition(() => {
                        void onSelectConversation(conversation.id);
                      });
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function SearchResultDropdown({
  customers,
  expandedSection,
  groups,
  keyword,
  onCollapse,
  onExpand,
  onSelect,
}: {
  customers: Conversation[];
  expandedSection: ChatMode | null;
  groups: Conversation[];
  keyword: string;
  onCollapse: () => void;
  onExpand: (section: ChatMode) => void;
  onSelect: (conversation: Conversation) => void;
}) {
  const isShowingCustomers = expandedSection === null || expandedSection === "single";
  const isShowingGroups = expandedSection === null || expandedSection === "group";
  const visibleCustomers =
    expandedSection === "single" ? customers : customers.slice(0, CUSTOMER_PREVIEW_LIMIT);
  const visibleGroups =
    expandedSection === "group" ? groups : groups.slice(0, GROUP_PREVIEW_LIMIT);

  if (customers.length === 0 && groups.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        没有匹配的客户或群聊。
      </div>
    );
  }

  if (expandedSection) {
    const title = expandedSection === "single" ? "联系人" : "群聊";
    const conversations = expandedSection === "single" ? customers : groups;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 bg-popover px-4 py-2">
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
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <SearchResultItem
                conversation={conversation}
                key={conversation.id}
                keyword={keyword}
                onSelect={() => onSelect(conversation)}
              />
            ))}
          </div>
        </ScrollArea>
        <div className="shrink-0 px-4 py-2">
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
        {isShowingCustomers ? (
          <SearchResultSection
            conversations={visibleCustomers}
            hasMore={expandedSection === null && customers.length > CUSTOMER_PREVIEW_LIMIT}
            keyword={keyword}
            onExpand={() => onExpand("single")}
            onSelect={onSelect}
            title="联系人"
          />
        ) : null}
        {isShowingCustomers && isShowingGroups && customers.length > 0 && groups.length > 0 ? (
          <div className="border-t border-divider" />
        ) : null}
        {isShowingGroups ? (
          <SearchResultSection
            conversations={visibleGroups}
            hasMore={expandedSection === null && groups.length > GROUP_PREVIEW_LIMIT}
            keyword={keyword}
            onExpand={() => onExpand("group")}
            onSelect={onSelect}
            title="群聊"
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}

function SearchResultSection({
  conversations,
  hasMore,
  keyword,
  onExpand,
  onSelect,
  title,
}: {
  conversations: Conversation[];
  hasMore: boolean;
  keyword: string;
  onExpand: () => void;
  onSelect: (conversation: Conversation) => void;
  title: string;
}) {
  if (conversations.length === 0) {
    return null;
  }

  return (
    <section className="py-3">
      <h2 className="mb-2 px-4 text-[12px] font-semibold text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-1">
        {conversations.map((conversation) => (
          <SearchResultItem
            conversation={conversation}
            key={conversation.id}
            keyword={keyword}
            onSelect={() => onSelect(conversation)}
          />
        ))}
      </div>
      {hasMore ? (
        <Button
          className="mx-4 mt-3 h-auto rounded-none p-0 text-[12px] font-medium text-primary hover:bg-transparent hover:text-primary/85"
          onClick={onExpand}
          type="button"
          variant="ghost"
        >
          查看全部
        </Button>
      ) : null}
    </section>
  );
}

function SearchResultItem({
  conversation,
  keyword,
  onSelect,
}: {
  conversation: Conversation;
  keyword: string;
  onSelect: () => void;
}) {
  return (
    <Button
      className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-center justify-normal gap-2 rounded-none px-4 py-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/20"
      onClick={onSelect}
      type="button"
      variant="ghost"
    >
      <Avatar className="size-10 rounded-[8px]">
        <AvatarImage
          alt={conversation.customerName}
          src={conversation.customerAvatarUrl}
        />
        <AvatarFallback className="rounded-[8px]">
          {conversation.customerName.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 self-center">
        <p className="truncate text-[14px] font-normal text-foreground">
          <HighlightedText text={conversation.customerName} keyword={keyword} />
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
      <span className={cn("px-0 text-success")}>{match}</span>
      {after}
    </>
  );
}
