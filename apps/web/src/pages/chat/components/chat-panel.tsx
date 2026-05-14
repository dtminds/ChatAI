import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LexicalEditor } from "lexical";
import { Separator } from "@/components/ui/separator";
import { ChatComposer } from "@/pages/chat/components/chat-composer";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { CustomerSidePanel } from "@/pages/chat/components/customer-side-panel";
import type { InputEnterBehavior } from "@/pages/chat/components/input-enter-behavior";
import type {
  Conversation,
  CustomerProfile,
  FileUploadQueueItem,
  GroupMember,
  Message,
} from "@/pages/chat/chat-types";
import type { SettingsSidebarItem } from "@chatai/contracts";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

type ChatPanelProps = {
  accountName?: string;
  activeConversation?: Conversation;
  activeHistoryStatus: "idle" | "loading" | "error";
  canSendMessage: boolean;
  composerPlaceholder: string;
  customer?: CustomerProfile;
  customerPanelWidth: number;
  draft: string;
  groupMembers: GroupMember[];
  isGroupMembersLoading: boolean;
  inputEnterBehavior: InputEnterBehavior;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isSendingDraft: boolean;
  isResizingCustomerPanel: boolean;
  messages: Message[];
  hasMoreHistory: boolean;
  historyLoadLabel?: string;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onComposerSegmentsChange: (segments: ComposerSegment[]) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onCancelFileUpload: (uploadId: string) => void;
  onFileSelect: (files: FileList | File[] | null) => void;
  onRefreshGroupMembers: () => void;
  onLoadOlderMessages: () => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  onSendDraft: (segments: ComposerSegment[]) => void;
  onDismissScopeTransitionError: () => void;
  scopeTransitionError?: string;
  sidebarItems: SettingsSidebarItem[];
  fileUploadQueue: FileUploadQueueItem[];
  messageViewportRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<LexicalEditor | null>;
  workbenchBodyRef: RefObject<HTMLDivElement | null>;
};

export function ChatPanel({
  accountName,
  activeConversation,
  activeHistoryStatus,
  canSendMessage,
  composerPlaceholder,
  customer,
  customerPanelWidth,
  draft,
  groupMembers,
  isGroupMembersLoading,
  inputEnterBehavior,
  isConversationLoading,
  isEmojiPickerOpen,
  isSendingDraft,
  isResizingCustomerPanel,
  messages,
  hasMoreHistory,
  historyLoadLabel,
  onCustomerPanelResizeStart,
  onComposerSegmentsChange,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onCancelFileUpload,
  onFileSelect,
  onRefreshGroupMembers,
  onLoadOlderMessages,
  onOpenQuotedMessage,
  onMessageViewportScroll,
  onRetryMessage,
  onSendDraft,
  onDismissScopeTransitionError,
  scopeTransitionError,
  sidebarItems,
  fileUploadQueue,
  messageViewportRef,
  composerRef,
  workbenchBodyRef,
}: ChatPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface">
      <ChatHeader
        activeConversation={activeConversation}
      />

      <div className="flex min-h-0 min-w-0 flex-1" ref={workbenchBodyRef}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <ChatMessagePanel
            activeHistoryStatus={activeHistoryStatus}
            hasMoreHistory={hasMoreHistory}
            historyLoadLabel={historyLoadLabel}
            isConversationLoading={isConversationLoading}
            messages={messages}
            messageViewportRef={messageViewportRef}
            onLoadOlderMessages={onLoadOlderMessages}
            onOpenQuotedMessage={onOpenQuotedMessage}
            onMessageViewportScroll={onMessageViewportScroll}
            onRetryMessage={onRetryMessage}
          />

          <Separator className="bg-divider" />

          <div className="relative">
            {scopeTransitionError ? (
              <div
                className="absolute bottom-full left-0 right-0 z-20 mb-0 flex min-h-8 items-center justify-between gap-3 border-t border-destructive/10 bg-destructive/55 px-5 py-1.5 text-xs font-medium leading-5 text-destructive-foreground/90 shadow-[0_-4px_16px_var(--shadow-soft)] backdrop-blur-md"
                data-testid="scope-transition-error"
                role="status"
              >
                <span className="min-w-0 truncate">{scopeTransitionError}</span>
                <button
                  aria-label="关闭错误提示"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] text-destructive-foreground/75 outline-none transition-colors hover:bg-white/10 hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-white/30"
                  onClick={onDismissScopeTransitionError}
                  type="button"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Cancel01Icon}
                    size={14}
                    strokeWidth={2}
                  />
                </button>
              </div>
            ) : null}

            {fileUploadQueue.length > 0 ? (
              <div className="border-t border-divider bg-surface px-4 py-2">
                <div className="space-y-1.5">
                  {fileUploadQueue.map((item) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] bg-muted/55 px-3 py-2"
                      key={item.id}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                            {item.fileName}
                          </span>
                          <span className="shrink-0 text-[12px] text-muted-foreground">
                            {item.status === "sending" ? "正在发送" : "正在上传"}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-200"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                      <button
                        aria-label={`取消上传 ${item.fileName}`}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                        onClick={() => onCancelFileUpload(item.id)}
                        type="button"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Cancel01Icon}
                          size={15}
                          strokeWidth={2}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <ChatComposer
              canSendMessage={canSendMessage}
              draft={draft}
              groupMembers={groupMembers}
              isGroupConversation={activeConversation?.mode === "group"}
              inputEnterBehavior={inputEnterBehavior}
              isEmojiPickerOpen={isEmojiPickerOpen}
              isSending={isSendingDraft}
              onDraftChange={onDraftChange}
              onEmojiPickerOpenChange={onEmojiPickerOpenChange}
              onEnterBehaviorChange={onEnterBehaviorChange}
              onFileSelect={onFileSelect}
              onSegmentsChange={onComposerSegmentsChange}
              onSendDraft={onSendDraft}
              placeholder={composerPlaceholder}
              composerRef={composerRef}
            />
          </div>
        </div>

        <CustomerSidePanel
          accountName={accountName}
          conversationMode={activeConversation?.mode}
          customer={customer}
          groupMembers={groupMembers}
          isGroupMembersLoading={isGroupMembersLoading}
          isResizing={isResizingCustomerPanel}
          onRefreshGroupMembers={onRefreshGroupMembers}
          onResizeStart={onCustomerPanelResizeStart}
          panelWidth={customerPanelWidth}
          sidebarItems={sidebarItems}
        />
      </div>
    </section>
  );
}
