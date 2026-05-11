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
  GroupMember,
  Message,
} from "@/pages/chat/chat-types";
import type { MentionInsertPosition } from "@/pages/chat/components/chat-composer";
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
  inputEnterBehavior: InputEnterBehavior;
  isConversationLoading: boolean;
  isEmojiPickerOpen: boolean;
  isResizingCustomerPanel: boolean;
  mentionInsertPosition: MentionInsertPosition;
  messages: Message[];
  selectedMentionMembers: GroupMember[];
  hasMoreHistory: boolean;
  onCustomerPanelResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onMentionInsertPositionChange: (position: MentionInsertPosition) => void;
  onRemoveMentionMember: (memberId: string) => void;
  onSelectMentionMember: (member: GroupMember, triggerStart: number, triggerEnd: number) => void;
  onLoadOlderMessages: () => void;
  onMessageViewportScroll: () => void;
  onRetryMessage: (messageId: string) => void | Promise<void>;
  onSendDraft: (segments: ComposerSegment[]) => void;
  onDismissScopeTransitionError: () => void;
  scopeTransitionError?: string;
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
  inputEnterBehavior,
  isConversationLoading,
  isEmojiPickerOpen,
  isResizingCustomerPanel,
  mentionInsertPosition,
  messages,
  selectedMentionMembers,
  hasMoreHistory,
  onCustomerPanelResizeStart,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onMentionInsertPositionChange,
  onRemoveMentionMember,
  onSelectMentionMember,
  onLoadOlderMessages,
  onMessageViewportScroll,
  onRetryMessage,
  onSendDraft,
  onDismissScopeTransitionError,
  scopeTransitionError,
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
            isConversationLoading={isConversationLoading}
            messages={messages}
            messageViewportRef={messageViewportRef}
            onLoadOlderMessages={onLoadOlderMessages}
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

            <ChatComposer
              canSendMessage={canSendMessage}
              draft={draft}
              groupMembers={groupMembers}
              isGroupConversation={activeConversation?.mode === "group"}
              inputEnterBehavior={inputEnterBehavior}
              isEmojiPickerOpen={isEmojiPickerOpen}
              mentionInsertPosition={mentionInsertPosition}
              onDraftChange={onDraftChange}
              onEmojiPickerOpenChange={onEmojiPickerOpenChange}
              onEnterBehaviorChange={onEnterBehaviorChange}
              onMentionInsertPositionChange={onMentionInsertPositionChange}
              onRemoveMentionMember={onRemoveMentionMember}
              onSelectMentionMember={onSelectMentionMember}
              onSendDraft={onSendDraft}
              selectedMentionMembers={selectedMentionMembers}
              placeholder={composerPlaceholder}
              composerRef={composerRef}
            />
          </div>
        </div>

        <CustomerSidePanel
          accountName={accountName}
          customer={customer}
          isResizing={isResizingCustomerPanel}
          onResizeStart={onCustomerPanelResizeStart}
          panelWidth={customerPanelWidth}
        />
      </div>
    </section>
  );
}
