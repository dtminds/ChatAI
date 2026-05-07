import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AiChat02Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Image01Icon,
  SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type InputEnterBehavior,
  INPUT_ENTER_BEHAVIOR_DESCRIPTIONS,
  INPUT_ENTER_BEHAVIOR_LABELS,
} from "@/pages/chat/components/input-enter-behavior";
import { WechatEmojiPicker } from "@/pages/chat/components/wechat-emoji-picker";
import type { WechatEmojiName } from "@/pages/chat/wechat-emoji";
import type { GroupMember } from "@/pages/chat/chat-types";

export type MentionInsertPosition = "start" | "end";

type ChatComposerProps = {
  canSendMessage: boolean;
  composerHint?: string;
  draft: string;
  groupMembers: GroupMember[];
  inputEnterBehavior: InputEnterBehavior;
  isGroupConversation: boolean;
  isEmojiPickerOpen: boolean;
  mentionInsertPosition: MentionInsertPosition;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEmojiSelect: (name: WechatEmojiName) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onMentionInsertPositionChange: (position: MentionInsertPosition) => void;
  onRemoveMentionMember: (memberId: string) => void;
  onSelectMentionMember: (member: GroupMember, triggerStart: number, triggerEnd: number) => void;
  onSendDraft: () => void;
  selectedMentionMembers: GroupMember[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function ChatComposer({
  canSendMessage,
  composerHint,
  draft,
  groupMembers,
  inputEnterBehavior,
  isGroupConversation,
  isEmojiPickerOpen,
  mentionInsertPosition,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEmojiSelect,
  onEnterBehaviorChange,
  onMentionInsertPositionChange,
  onRemoveMentionMember,
  onSelectMentionMember,
  onSendDraft,
  selectedMentionMembers,
  textareaRef,
}: ChatComposerProps) {
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const mentionCloseTimerRef = useRef<number | null>(null);
  const [hoveredMentionMemberId, setHoveredMentionMemberId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(draft.length);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [isMentionPickerDismissed, setIsMentionPickerDismissed] = useState(false);
  const mentionTrigger = useMemo(
    () => getMentionTrigger(draft, cursorPosition),
    [cursorPosition, draft],
  );
  const selectedMentionMemberIds = useMemo(
    () => new Set(selectedMentionMembers.map((member) => member.id)),
    [selectedMentionMembers],
  );
  const filteredMentionMembers = useMemo(() => {
    if (!mentionTrigger || !isGroupConversation) {
      return [];
    }

    const normalizedQuery = mentionTrigger.query.trim().toLocaleLowerCase();

    return groupMembers.filter((member) => {
      if (selectedMentionMemberIds.has(member.id)) {
        return false;
      }

      return member.displayName.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [groupMembers, isGroupConversation, mentionTrigger, selectedMentionMemberIds]);
  const isMentionPickerOpen =
    canSendMessage &&
    isGroupConversation &&
    !!mentionTrigger &&
    !isMentionPickerDismissed &&
    filteredMentionMembers.length > 0;
  const canSubmitDraft =
    canSendMessage && (!!draft.trim() || selectedMentionMembers.length > 0);

  useEffect(() => {
    setActiveMentionIndex(0);
    setIsMentionPickerDismissed(false);
  }, [mentionTrigger?.query]);

  useEffect(() => {
    return () => {
      if (mentionCloseTimerRef.current) {
        window.clearTimeout(mentionCloseTimerRef.current);
      }
    };
  }, []);

  const showMentionRemovePopover = (memberId: string) => {
    if (mentionCloseTimerRef.current) {
      window.clearTimeout(mentionCloseTimerRef.current);
      mentionCloseTimerRef.current = null;
    }

    setHoveredMentionMemberId(memberId);
  };

  const scheduleMentionRemovePopoverClose = (memberId: string) => {
    if (mentionCloseTimerRef.current) {
      window.clearTimeout(mentionCloseTimerRef.current);
    }

    mentionCloseTimerRef.current = window.setTimeout(() => {
      setHoveredMentionMemberId((currentMemberId) =>
        currentMemberId === memberId ? null : currentMemberId,
      );
      mentionCloseTimerRef.current = null;
    }, 120);
  };

  const handleRemoveMentionMember = (memberId: string) => {
    if (mentionCloseTimerRef.current) {
      window.clearTimeout(mentionCloseTimerRef.current);
      mentionCloseTimerRef.current = null;
    }

    setHoveredMentionMemberId(null);
    onRemoveMentionMember(memberId);
  };

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target || emojiPickerRef.current?.contains(target)) {
        return;
      }

      onEmojiPickerOpenChange(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEmojiPickerOpenChange(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isEmojiPickerOpen, onEmojiPickerOpenChange]);

  const handleDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionPickerOpen && mentionTrigger) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMentionPickerDismissed(true);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveMentionIndex((currentIndex) =>
          Math.min(currentIndex + 1, filteredMentionMembers.length - 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveMentionIndex((currentIndex) => Math.max(currentIndex - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selectedMember = filteredMentionMembers[activeMentionIndex];

        if (selectedMember) {
          onSelectMentionMember(
            selectedMember,
            mentionTrigger.start,
            mentionTrigger.end,
          );
        }

        return;
      }
    }

    if (event.key !== "Enter") {
      return;
    }

    const shouldSend =
      inputEnterBehavior === "newline" ? event.shiftKey : !event.shiftKey;

    if (shouldSend) {
      event.preventDefault();
      onSendDraft();
    }
  };

  const handleDraftChange = (nextDraft: string, nextCursorPosition: number | null) => {
    onDraftChange(nextDraft);
    setCursorPosition(nextCursorPosition ?? nextDraft.length);
  };

  return (
    <div className="space-y-1.5 bg-surface px-5 py-3">
      <div className="ml-[-6px] flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="relative" ref={emojiPickerRef}>
            <button
              aria-label="微信表情"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-hover hover:text-foreground",
                isEmojiPickerOpen && "bg-info-muted text-primary",
              )}
              onClick={() => onEmojiPickerOpenChange(!isEmojiPickerOpen)}
              type="button"
            >
              <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={1.8} />
            </button>

            {isEmojiPickerOpen ? (
              <div className="absolute bottom-full left-[-24px] z-30 mb-3">
                <WechatEmojiPicker onSelect={onEmojiSelect} />
              </div>
            ) : null}
          </div>
          <button
            aria-label="发送图片"
            className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-hover hover:text-foreground"
            type="button"
          >
            <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
          </button>
          <button
            aria-label="AI 助手"
            className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-hover hover:text-foreground"
            type="button"
          >
            <HugeiconsIcon icon={AiChat02Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Select
            onValueChange={(value) => onEnterBehaviorChange(value as InputEnterBehavior)}
            value={inputEnterBehavior}
          >
            <SelectTrigger
              aria-label="选择 Enter 键行为"
              className="h-7 min-w-0 border-0 bg-transparent px-1.5 text-muted-foreground focus:ring-0"
            >
              <span>{INPUT_ENTER_BEHAVIOR_LABELS[inputEnterBehavior]}</span>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="send">
                {INPUT_ENTER_BEHAVIOR_DESCRIPTIONS.send}
              </SelectItem>
              <SelectItem value="newline">
                {INPUT_ENTER_BEHAVIOR_DESCRIPTIONS.newline}
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            aria-label="发送消息"
            className="size-7 rounded-full p-0 shadow-none"
            disabled={!canSubmitDraft}
            onClick={onSendDraft}
            size="icon"
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <div className="relative">
        {selectedMentionMembers.length > 0 ? (
          <div className="chat-composer-mention-bar flex min-h-8 items-center gap-3 border-b mb-1 border-divider/70">
            <div className="chat-composer-mention-row flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {selectedMentionMembers.map((member) => (
                <span className="inline-flex shrink-0 pt-1 pb-2" key={member.id}>
                  <span
                    className={cn(
                      "relative inline-flex text-[13px] font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                      hoveredMentionMemberId === member.id && "z-10",
                    )}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setHoveredMentionMemberId((currentMemberId) =>
                          currentMemberId === member.id ? null : currentMemberId,
                        );
                      }
                    }}
                    onFocus={() => showMentionRemovePopover(member.id)}
                    onMouseEnter={() => showMentionRemovePopover(member.id)}
                    onMouseLeave={() => scheduleMentionRemovePopoverClose(member.id)}
                    tabIndex={0}
                  >
                    @{member.displayName}

                    {hoveredMentionMemberId === member.id ? (
                      <button
                        aria-label={`移除 @${member.displayName}`}
                        className="absolute -right-2 top-1 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-popover text-primary shadow-[0_4px_12px_var(--shadow-soft)] hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                        onClick={() => handleRemoveMentionMember(member.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                      </button>
                    ) : null}
                  </span>
                </span>
              ))}
            </div>

            <Select
              onValueChange={(value) =>
                onMentionInsertPositionChange(value as MentionInsertPosition)
              }
              value={mentionInsertPosition}
            >
              <SelectTrigger
                aria-label="选择 @ 插入位置"
                className="h-7 min-w-0 shrink-0 border-0 bg-transparent px-1.5 pb-1.5 text-primary focus:ring-0"
              >
                <span>{mentionInsertPosition === "start" ? "文首" : "文尾"}</span>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="start">文首</SelectItem>
                <SelectItem value="end">文尾</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {isMentionPickerOpen && mentionTrigger ? (
          <div
            aria-label="选择群成员"
            className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-56 overflow-y-auto rounded-[10px] border border-border bg-popover py-1 shadow-[0_10px_28px_var(--shadow-soft)]"
            role="listbox"
          >
            {filteredMentionMembers.map((member, index) => (
              <button
                aria-selected={index === activeMentionIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-popover-foreground outline-none transition-colors hover:bg-surface-hover",
                  index === activeMentionIndex && "bg-surface-hover",
                )}
                key={member.id}
                onClick={() =>
                  onSelectMentionMember(
                    member,
                    mentionTrigger.start,
                    mentionTrigger.end,
                  )
                }
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-[11px] font-semibold text-muted-foreground"
                >
                  {member.displayName.slice(0, 1)}
                </span>
                <span className="truncate">{member.displayName}</span>
              </button>
            ))}
          </div>
        ) : null}

        <Textarea
          className="chat-composer-textarea min-h-28 resize-none rounded-none border-0 bg-transparent py-1 pl-0 pr-0.5 text-[14px] shadow-none focus-visible:ring-0"
          disabled={!canSendMessage}
          onChange={(event) =>
            handleDraftChange(event.target.value, event.target.selectionStart)
          }
          onClick={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          onKeyDown={handleDraftKeyDown}
          onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          placeholder={canSendMessage ? "请输入消息……" : "当前会话暂不可发送消息"}
          ref={textareaRef}
          value={draft}
        />
      </div>
      {composerHint ? (
        <p className="px-0.5 text-[12px] leading-5 text-muted-foreground">
          {composerHint}
        </p>
      ) : null}
    </div>
  );
}

function getMentionTrigger(draft: string, cursorPosition: number) {
  const safeCursorPosition = Math.max(0, Math.min(cursorPosition, draft.length));
  const beforeCursor = draft.slice(0, safeCursorPosition);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  const atIndex = beforeCursor.lastIndexOf("@");

  return {
    end: safeCursorPosition,
    query: match[2],
    start: atIndex,
  };
}
