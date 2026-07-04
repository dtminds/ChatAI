import { useEffect, useMemo, useState } from "react";
import { Cancel01Icon, Male02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import type {
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
} from "@chatai/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatMode, Conversation } from "@/pages/chat/chat-types";
import { MessageForwardPreviewContent } from "@/pages/chat/components/message-forward/message-forward-preview-content";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  buildMessageForwardRecipientId,
  buildRecentForwardSearchResults,
  getMessageForwardPreview,
  MESSAGE_FORWARD_MAX_RECIPIENTS,
  MESSAGE_FORWARD_SEND_HINT,
  type MessageForwardMode,
  type MessageForwardRecipient,
} from "@/pages/chat/lib/message-forward";

const CUSTOMER_PREVIEW_LIMIT = 5;
const GROUP_PREVIEW_LIMIT = 10;
const FORWARD_RECIPIENT_MODES: ChatMode[] = ["single", "group"];

const forwardRecipientModeTabClassName =
  "rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

type MessageForwardRecipientDialogProps = {
  excludeConversationId?: string;
  isSending?: boolean;
  messages: ChatMessage[];
  mode: MessageForwardMode;
  onOpenChange: (open: boolean) => void;
  onOpenSelectedMessages?: () => void;
  onSend: (input: {
    comment?: string;
    recipients: MessageForwardRecipient[];
  }) => void;
  open: boolean;
  recentConversations?: Conversation[];
  seatId?: string;
};

export function MessageForwardRecipientDialog({
  excludeConversationId,
  isSending = false,
  messages,
  mode,
  onOpenChange,
  onOpenSelectedMessages,
  onSend,
  open,
  recentConversations = [],
  seatId,
}: MessageForwardRecipientDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<{
    contacts: WorkbenchSearchContactResultDto[];
    groups: WorkbenchSearchGroupResultDto[];
  } | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<MessageForwardRecipient[]>(
    [],
  );
  const [comment, setComment] = useState("");
  const [activeMode, setActiveMode] = useState<ChatMode>("single");
  const [expandedListSection, setExpandedListSection] = useState<ChatMode | null>(null);
  const normalizedKeyword = keyword.trim();
  const recentResults = useMemo(
    () =>
      buildRecentForwardSearchResults(recentConversations, {
        excludeConversationId,
      }),
    [excludeConversationId, recentConversations],
  );
  const isSearching = normalizedKeyword.length > 0;
  const selectedRecipientIds = useMemo(
    () => new Set(selectedRecipients.map((recipient) => recipient.id)),
    [selectedRecipients],
  );

  useEffect(() => {
    if (!open) {
      setKeyword("");
      setSearchResults(null);
      setSelectedRecipients([]);
      setComment("");
      setIsSearchLoading(false);
      setActiveMode("single");
      setExpandedListSection(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !seatId || normalizedKeyword.length === 0) {
      setSearchResults(null);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;
    setIsSearchLoading(true);

    const timer = window.setTimeout(() => {
      void getWorkbenchService()
        .search(seatId, normalizedKeyword)
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
            setIsSearchLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults({ contacts: [], groups: [] });
            setIsSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedKeyword, open, seatId]);

  const previewLabel = useMemo(() => {
    if (mode === "batch") {
      return `[逐条转发] 聊天记录`;
    }

    if (messages.length === 1) {
      return getMessageForwardPreview(messages[0]);
    }

    return `[逐条转发] 聊天记录`;
  }, [messages, mode]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSending) {
      return;
    }

    onOpenChange(nextOpen);
  };

  const toggleContactSelection = (contact: WorkbenchSearchContactResultDto) => {
    const recipient = buildContactRecipient(contact);

    setSelectedRecipients((currentRecipients) =>
      toggleForwardRecipientSelection(currentRecipients, recipient),
    );
  };

  const toggleGroupSelection = (group: WorkbenchSearchGroupResultDto) => {
    const recipient = buildGroupRecipient(group);

    setSelectedRecipients((currentRecipients) =>
      toggleForwardRecipientSelection(currentRecipients, recipient),
    );
  };

  const handleRemoveRecipient = (recipientId: string) => {
    setSelectedRecipients((currentRecipients) =>
      currentRecipients.filter((item) => item.id !== recipientId),
    );
  };

  const canSend =
    selectedRecipients.length > 0 &&
    selectedRecipients.length <= MESSAGE_FORWARD_MAX_RECIPIENTS &&
    messages.length > 0 &&
    !isSending;
  const hasReachedRecipientLimit = selectedRecipients.length >= MESSAGE_FORWARD_MAX_RECIPIENTS;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="flex h-[min(34rem,calc(100vh-3rem))] max-h-[calc(100vh-3rem)] max-w-[min(56rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
        closeButtonDisabled={isSending}
      >
        <DialogTitle className="border-b border-divider px-5 py-4 text-base font-semibold">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span>转发</span>
            <span className="text-[13px] font-normal text-muted-foreground">
              {MESSAGE_FORWARD_SEND_HINT}
            </span>
          </span>
        </DialogTitle>
        <DialogDescription className="sr-only">
          选择转发对象并发送消息
        </DialogDescription>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
          <section className="flex min-h-0 flex-col border-r border-divider">
            <div className="border-b border-divider px-4 py-3">
              <div className="relative">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={2}
                />
                <Input
                  aria-label="搜索联系人或群聊"
                  className="h-9 pl-9 pr-9"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setExpandedListSection(null);
                  }}
                  placeholder="搜索客户、群名称"
                  value={keyword}
                />
                {keyword ? (
                  <Button
                    aria-label="清空搜索"
                    className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md p-0 text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
                    onClick={() => {
                      setKeyword("");
                      setExpandedListSection(null);
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
            </div>

            {isSearching ? (
              <ForwardRecipientSearchPanel
                contacts={searchResults?.contacts ?? []}
                disabled={isSending}
                expandedSection={expandedListSection}
                isLoading={isSearchLoading || searchResults === null}
                keyword={normalizedKeyword}
                onCollapse={() => setExpandedListSection(null)}
                onExpand={setExpandedListSection}
                onToggleContact={toggleContactSelection}
                onToggleGroup={toggleGroupSelection}
                recipientLimitReached={hasReachedRecipientLimit}
                groups={searchResults?.groups ?? []}
                selectedRecipientIds={selectedRecipientIds}
              />
            ) : (
              <Tabs
                className="flex min-h-0 flex-1 flex-col"
                onValueChange={(value) => {
                  setActiveMode(value as ChatMode);
                }}
                value={activeMode}
              >
                <div className="border-b border-divider px-4">
                  <TabsList className="h-auto w-full justify-start gap-5 rounded-none bg-transparent p-0">
                    {FORWARD_RECIPIENT_MODES.map((mode) => (
                      <TabsTrigger
                        className={forwardRecipientModeTabClassName}
                        key={mode}
                        value={mode}
                      >
                        {getForwardRecipientModeLabel(mode)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {FORWARD_RECIPIENT_MODES.map((mode) => {
                  const items =
                    mode === "single" ? recentResults.contacts : recentResults.groups;

                  return (
                    <TabsContent
                      className={cn(
                        "mt-0 flex min-h-0 flex-1 flex-col overflow-hidden",
                        mode !== activeMode && "hidden",
                      )}
                      key={mode}
                      value={mode}
                    >
                      <ForwardRecipientRecentPanel
                        disabled={isSending}
                        items={items}
                        mode={mode}
                        onToggleContact={toggleContactSelection}
                        onToggleGroup={toggleGroupSelection}
                        recipientLimitReached={hasReachedRecipientLimit}
                        selectedRecipientIds={selectedRecipientIds}
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {selectedRecipients.length > 0
                    ? `已选择 ${selectedRecipients.length}/${MESSAGE_FORWARD_MAX_RECIPIENTS} 个聊天`
                    : "已选对象"}
                </p>
              </div>

              <ScrollArea
                aria-label="已选转发对象"
                className="min-h-0 flex-1"
                role="region"
              >
                {selectedRecipients.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-muted-foreground">
                    暂未选择转发对象
                  </div>
                ) : (
                  <div className="space-y-1 pb-2">
                    {selectedRecipients.map((recipient) => (
                      <SelectedRecipientItem
                        disabled={isSending}
                        key={recipient.id}
                        recipient={recipient}
                        onRemove={() => handleRemoveRecipient(recipient.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="shrink-0 space-y-2 border-t border-divider px-4 py-2.5">
              {mode === "batch" || messages.length > 1 ? (
                <button
                  className="flex w-full min-w-0 items-center gap-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  disabled={isSending}
                  onClick={onOpenSelectedMessages}
                  type="button"
                >
                  <span className="truncate">{previewLabel}</span>
                  <span className="shrink-0">· {messages.length} 条</span>
                </button>
              ) : (
                <MessageForwardSinglePreview
                  message={messages[0]}
                  previewLabel={previewLabel}
                />
              )}

              <Input
                aria-label="留言"
                className="h-8 border-0 bg-surface-muted px-2.5 text-[13px] shadow-none focus-visible:ring-1"
                disabled={isSending}
                id="message-forward-comment"
                onChange={(event) => setComment(event.target.value)}
                placeholder="留言"
                value={comment}
              />
            </div>

            <div className="flex shrink-0 justify-end gap-2 px-4 py-3">
              <Button
                disabled={isSending}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={!canSend}
                onClick={() =>
                  onSend({
                    comment: comment.trim() || undefined,
                    recipients: selectedRecipients,
                  })
                }
                type="button"
              >
                {isSending ? "正在发送" : "发送"}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageForwardSinglePreview({
  message,
  previewLabel,
}: {
  message: ChatMessage;
  previewLabel: string;
}) {
  return (
    <HoverCard closeDelay={100} openDelay={200}>
      <HoverCardTrigger asChild>
        <p className="cursor-default truncate text-[13px] text-muted-foreground">
          {previewLabel}
        </p>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="z-[100] w-fit max-w-[min(20rem,calc(100vw-4rem))] p-2"
        side="top"
      >
        <div className="max-h-[min(16rem,calc(100vh-12rem))] overflow-y-auto">
          <MessageForwardPreviewContent message={message} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function toggleForwardRecipientSelection(
  currentRecipients: MessageForwardRecipient[],
  recipient: MessageForwardRecipient,
) {
  if (currentRecipients.some((item) => item.id === recipient.id)) {
    return currentRecipients.filter((item) => item.id !== recipient.id);
  }

  if (currentRecipients.length >= MESSAGE_FORWARD_MAX_RECIPIENTS) {
    toast.warning(`最多选择 ${MESSAGE_FORWARD_MAX_RECIPIENTS} 个聊天`);
    return currentRecipients;
  }

  return [...currentRecipients, recipient];
}

function getForwardRecipientModeLabel(mode: ChatMode) {
  return mode === "single" ? "单聊" : "群聊";
}

function ForwardRecipientSearchPanel({
  contacts,
  disabled = false,
  expandedSection,
  groups,
  isLoading,
  keyword,
  onCollapse,
  onExpand,
  onToggleContact,
  onToggleGroup,
  recipientLimitReached = false,
  selectedRecipientIds,
}: {
  contacts: WorkbenchSearchContactResultDto[];
  disabled?: boolean;
  expandedSection: ChatMode | null;
  groups: WorkbenchSearchGroupResultDto[];
  isLoading: boolean;
  keyword: string;
  onCollapse: () => void;
  onExpand: (section: ChatMode) => void;
  onToggleContact: (contact: WorkbenchSearchContactResultDto) => void;
  onToggleGroup: (group: WorkbenchSearchGroupResultDto) => void;
  recipientLimitReached?: boolean;
  selectedRecipientIds: Set<string>;
}) {
  const isShowingCustomers = expandedSection === null || expandedSection === "single";
  const isShowingGroups = expandedSection === null || expandedSection === "group";
  const visibleCustomers =
    expandedSection === "single" ? contacts : contacts.slice(0, CUSTOMER_PREVIEW_LIMIT);
  const visibleGroups =
    expandedSection === "group" ? groups : groups.slice(0, GROUP_PREVIEW_LIMIT);

  if (isLoading) {
    return (
      <div
        className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner size={18} variant="classic" />
        <span>正在搜索中...</span>
      </div>
    );
  }

  if (contacts.length === 0 && groups.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        没有匹配的联系人或群聊。
      </div>
    );
  }

  if (expandedSection) {
    const title = expandedSection === "single" ? "联系人" : "群聊";

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-divider px-4 py-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        </div>
        <ScrollArea
          aria-label={`${title}搜索结果`}
          className="min-h-0 flex-1"
          role="region"
        >
          <div className="space-y-1 py-2">
            {expandedSection === "single"
              ? contacts.map((contact) => (
                  <ForwardRecipientContactItem
                    contact={contact}
                    disabled={disabled}
                    isSelected={selectedRecipientIds.has(
                      buildMessageForwardRecipientId({
                        mode: "single",
                        thirdExternalUserId: contact.thirdExternalUserId,
                      }),
                    )}
                    key={contact.thirdExternalUserId}
                    keyword={keyword}
                    onToggle={() => onToggleContact(contact)}
                    recipientLimitReached={recipientLimitReached}
                  />
                ))
              : groups.map((group) => (
                  <ForwardRecipientGroupItem
                    disabled={disabled}
                    group={group}
                    isSelected={selectedRecipientIds.has(
                      buildMessageForwardRecipientId({
                        mode: "group",
                        thirdGroupId: group.thirdGroupId,
                      }),
                    )}
                    key={group.thirdGroupId}
                    keyword={keyword}
                    onToggle={() => onToggleGroup(group)}
                    recipientLimitReached={recipientLimitReached}
                  />
                ))}
          </div>
        </ScrollArea>
        <div className="shrink-0 border-t border-divider px-4 py-2">
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
    <ScrollArea aria-label="搜索结果" className="h-full min-h-0 flex-1" role="region">
      <div>
        {isShowingCustomers && contacts.length > 0 ? (
          <section className="py-3">
            <h2 className="mb-2 px-4 text-[12px] font-semibold text-muted-foreground">
              联系人
            </h2>
            <div className="space-y-1">
              {visibleCustomers.map((contact) => (
                <ForwardRecipientContactItem
                  contact={contact}
                  disabled={disabled}
                  isSelected={selectedRecipientIds.has(
                    buildMessageForwardRecipientId({
                      mode: "single",
                      thirdExternalUserId: contact.thirdExternalUserId,
                    }),
                  )}
                  key={contact.thirdExternalUserId}
                  keyword={keyword}
                  onToggle={() => onToggleContact(contact)}
                  recipientLimitReached={recipientLimitReached}
                />
              ))}
            </div>
            {contacts.length > CUSTOMER_PREVIEW_LIMIT ? (
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
        {isShowingCustomers && isShowingGroups && contacts.length > 0 && groups.length > 0 ? (
          <div className="border-t border-divider" />
        ) : null}
        {isShowingGroups && groups.length > 0 ? (
          <section className="py-3">
            <h2 className="mb-2 px-4 text-[12px] font-semibold text-muted-foreground">
              群聊
            </h2>
            <div className="space-y-1">
              {visibleGroups.map((group) => (
                <ForwardRecipientGroupItem
                  disabled={disabled}
                  group={group}
                  isSelected={selectedRecipientIds.has(
                    buildMessageForwardRecipientId({
                      mode: "group",
                      thirdGroupId: group.thirdGroupId,
                    }),
                  )}
                  key={group.thirdGroupId}
                  keyword={keyword}
                  onToggle={() => onToggleGroup(group)}
                  recipientLimitReached={recipientLimitReached}
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

function ForwardRecipientRecentPanel({
  disabled = false,
  items,
  mode,
  onToggleContact,
  onToggleGroup,
  recipientLimitReached = false,
  selectedRecipientIds,
}: {
  disabled?: boolean;
  items: WorkbenchSearchContactResultDto[] | WorkbenchSearchGroupResultDto[];
  mode: ChatMode;
  onToggleContact: (contact: WorkbenchSearchContactResultDto) => void;
  onToggleGroup: (group: WorkbenchSearchGroupResultDto) => void;
  recipientLimitReached?: boolean;
  selectedRecipientIds: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">暂无最近聊天</div>
    );
  }

  return (
    <ScrollArea
      aria-label={`最近${getForwardRecipientModeLabel(mode)}`}
      className="h-full min-h-0 flex-1"
      role="region"
    >
      <div className="space-y-1 py-2">
        {mode === "single"
          ? (items as WorkbenchSearchContactResultDto[]).map((contact) => (
              <ForwardRecipientContactItem
                contact={contact}
                disabled={disabled}
                isSelected={selectedRecipientIds.has(
                  buildMessageForwardRecipientId({
                    mode: "single",
                    thirdExternalUserId: contact.thirdExternalUserId,
                  }),
                )}
                key={contact.thirdExternalUserId}
                keyword=""
                onToggle={() => onToggleContact(contact)}
                recipientLimitReached={recipientLimitReached}
              />
            ))
          : (items as WorkbenchSearchGroupResultDto[]).map((group) => (
              <ForwardRecipientGroupItem
                disabled={disabled}
                group={group}
                isSelected={selectedRecipientIds.has(
                  buildMessageForwardRecipientId({
                    mode: "group",
                    thirdGroupId: group.thirdGroupId,
                  }),
                )}
                key={group.thirdGroupId}
                keyword=""
                onToggle={() => onToggleGroup(group)}
                recipientLimitReached={recipientLimitReached}
              />
            ))}
      </div>
    </ScrollArea>
  );
}

function ForwardRecipientContactItem({
  contact,
  disabled = false,
  isSelected,
  keyword,
  onToggle,
  recipientLimitReached = false,
}: {
  contact: WorkbenchSearchContactResultDto;
  disabled?: boolean;
  isSelected: boolean;
  keyword: string;
  onToggle: () => void;
  recipientLimitReached?: boolean;
}) {
  return (
    <ForwardRecipientPickerItem
      avatar={contact.avatar}
      disabled={disabled}
      isSelected={isSelected}
      keyword={keyword}
      label={formatContactDisplayName(contact)}
      onToggle={onToggle}
      selectionDisabled={!isSelected && recipientLimitReached}
    />
  );
}

function ForwardRecipientGroupItem({
  disabled = false,
  group,
  isSelected,
  keyword,
  onToggle,
  recipientLimitReached = false,
}: {
  disabled?: boolean;
  group: WorkbenchSearchGroupResultDto;
  isSelected: boolean;
  keyword: string;
  onToggle: () => void;
  recipientLimitReached?: boolean;
}) {
  return (
    <ForwardRecipientPickerItem
      avatar={group.avatar}
      disabled={disabled}
      isSelected={isSelected}
      keyword={keyword}
      label={formatGroupDisplayName(group)}
      onToggle={onToggle}
      selectionDisabled={!isSelected && recipientLimitReached}
    />
  );
}

function SelectedRecipientItem({
  disabled = false,
  onRemove,
  recipient,
}: {
  disabled?: boolean;
  onRemove: () => void;
  recipient: MessageForwardRecipient;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2">
      <Avatar className="size-10 rounded-[8px]">
        <AvatarImage alt={recipient.name} src={recipient.avatar} />
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
      <div className="min-w-0">
        <p className="truncate text-[14px] text-foreground">{recipient.name}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          {recipient.mode === "group" ? "群聊" : "单聊"}
        </p>
      </div>
      <Button
        aria-label={`移除${recipient.name}`}
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Cancel01Icon}
          size={16}
          strokeWidth={2}
        />
      </Button>
    </div>
  );
}

function ForwardRecipientPickerItem({
  avatar,
  disabled = false,
  isSelected,
  keyword,
  label,
  onToggle,
  selectionDisabled = false,
}: {
  avatar: string;
  disabled?: boolean;
  isSelected: boolean;
  keyword: string;
  label: string;
  onToggle: () => void;
  selectionDisabled?: boolean;
}) {
  const isInteractionDisabled = disabled || selectionDisabled;

  return (
    <Button
      aria-pressed={isSelected}
      className={cn(
        "grid h-auto w-full grid-cols-[auto_auto_minmax(0,1fr)] items-center justify-normal gap-3 rounded-none px-4 py-1.5 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/20",
        isSelected && "bg-surface-muted hover:bg-surface-muted",
        selectionDisabled && "opacity-50",
      )}
      disabled={isInteractionDisabled}
      onClick={onToggle}
      type="button"
      variant="ghost"
    >
      <Checkbox
        aria-hidden="true"
        checked={isSelected}
        className="pointer-events-none"
        tabIndex={-1}
      />
      <Avatar className="size-8 rounded-[7px]">
        <AvatarImage alt={label} src={avatar} />
        <AvatarFallback className="rounded-[7px]">
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={Male02Icon}
            size={16}
            strokeWidth={1.8}
          />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 self-center">
        <p className="truncate text-[14px] font-normal text-foreground">
          <HighlightedText keyword={keyword} text={label} />
        </p>
      </div>
    </Button>
  );
}

function buildContactRecipient(
  contact: WorkbenchSearchContactResultDto,
): MessageForwardRecipient {
  return {
    avatar: contact.avatar,
    conversationId: contact.conversationId,
    id: buildMessageForwardRecipientId({
      mode: "single",
      thirdExternalUserId: contact.thirdExternalUserId,
    }),
    mode: "single",
    name: formatContactDisplayName(contact),
    thirdExternalUserId: contact.thirdExternalUserId,
  };
}

function buildGroupRecipient(group: WorkbenchSearchGroupResultDto): MessageForwardRecipient {
  return {
    avatar: group.avatar,
    conversationId: group.conversationId,
    id: buildMessageForwardRecipientId({
      mode: "group",
      thirdGroupId: group.thirdGroupId,
    }),
    mode: "group",
    name: formatGroupDisplayName(group),
    thirdGroupId: group.thirdGroupId,
  };
}

function formatContactDisplayName(item: WorkbenchSearchContactResultDto) {
  const name = item.name?.trim() || "未知客户";
  const remark = item.remark?.trim();

  if (remark && remark !== name) {
    return `${remark}（${name}）`;
  }

  return name;
}

function formatGroupDisplayName(item: WorkbenchSearchGroupResultDto) {
  return item.remark?.trim() || item.name?.trim() || "未知群聊";
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
