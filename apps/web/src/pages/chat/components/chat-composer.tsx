import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp02Icon,
  Cancel01Icon,
  ChatDelayIcon,
  Image01Icon,
  SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function ChatComposer({
  canSendMessage,
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
  placeholder,
  textareaRef,
}: ChatComposerProps) {
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const mentionDropdownCloseTimerRef = useRef<number | null>(null);
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(draft.length);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [isMentionPickerDismissed, setIsMentionPickerDismissed] = useState(false);
  const mentionSummaryLabel = `查看已 @ 的 ${selectedMentionMembers.length} 位群成员`;
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
  const composerActionButtonClass =
    "size-8 rounded-md p-0 shadow-none";

  useEffect(() => {
    setActiveMentionIndex(0);
    setIsMentionPickerDismissed(false);
  }, [mentionTrigger?.query]);

  useEffect(() => {
    return () => {
      if (mentionDropdownCloseTimerRef.current) {
        window.clearTimeout(mentionDropdownCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedMentionMembers.length === 0) {
      setIsMentionDropdownOpen(false);
    }
  }, [selectedMentionMembers.length]);

  const keepMentionDropdownOpen = () => {
    if (mentionDropdownCloseTimerRef.current) {
      window.clearTimeout(mentionDropdownCloseTimerRef.current);
      mentionDropdownCloseTimerRef.current = null;
    }

    setIsMentionDropdownOpen(true);
  };

  const scheduleMentionDropdownClose = () => {
    if (mentionDropdownCloseTimerRef.current) {
      window.clearTimeout(mentionDropdownCloseTimerRef.current);
    }

    mentionDropdownCloseTimerRef.current = window.setTimeout(() => {
      setIsMentionDropdownOpen(false);
      mentionDropdownCloseTimerRef.current = null;
    }, 150);
  };

  const removeMentionMember = (memberId: string) => {
    onRemoveMentionMember(memberId);

    if (selectedMentionMembers.length <= 1) {
      setIsMentionDropdownOpen(false);
    } else {
      keepMentionDropdownOpen();
    }
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
    <div className="space-y-1.5 bg-surface px-4 py-2">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5 ml-[-6px]">
          <div className="relative" ref={emojiPickerRef}>
            <Button
              aria-label="微信表情"
              className={cn(
                composerActionButtonClass,
                isEmojiPickerOpen && "bg-primary/10 text-primary",
              )}
              onClick={() => onEmojiPickerOpenChange(!isEmojiPickerOpen)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={1.8} />
            </Button>

            {isEmojiPickerOpen ? (
              <div className="absolute bottom-full left-[-24px] z-30 mb-3">
                <WechatEmojiPicker onSelect={onEmojiSelect} />
              </div>
            ) : null}
          </div>
          <Button
            aria-label="发送图片"
            className={composerActionButtonClass}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
          </Button>
          <Button
            aria-label="历史记录"
            className={composerActionButtonClass}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={ChatDelayIcon} size={18} strokeWidth={1.8} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Select
            onValueChange={(value) => onEnterBehaviorChange(value as InputEnterBehavior)}
            value={inputEnterBehavior}
          >
            <SelectTrigger
              aria-label="选择 Enter 键行为"
              className="h-7 min-w-0 border-0 bg-transparent px-1.5 text-muted-foreground shadow-none focus:ring-0"
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
          <div className="flex min-h-8 items-center gap-1 border-b border-divider/70 mb-1 text-[13px]">
            <span className="shrink-0 text-muted-foreground">在</span>

            <Select
              onValueChange={(value) =>
                onMentionInsertPositionChange(value as MentionInsertPosition)
              }
              value={mentionInsertPosition}
            >
              <SelectTrigger
                aria-label="选择 @ 插入位置"
                className="h-7 min-w-0 shrink-0 border-0 bg-transparent text-[13px] px-1 py-1 text-primary focus:ring-0"
              >
                <span>{mentionInsertPosition === "start" ? "文首" : "文尾"}</span>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="start">文首</SelectItem>
                <SelectItem value="end">文尾</SelectItem>
              </SelectContent>
            </Select>

            <span className="shrink-0 text-muted-foreground">@ {selectedMentionMembers.length} 人：</span>

            <DropdownMenu
              open={isMentionDropdownOpen}
              onOpenChange={setIsMentionDropdownOpen}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={mentionSummaryLabel}
                  className="min-w-0 flex-1 truncate text-left text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  onBlur={scheduleMentionDropdownClose}
                  onFocus={keepMentionDropdownOpen}
                  onMouseEnter={keepMentionDropdownOpen}
                  onMouseLeave={scheduleMentionDropdownClose}
                  type="button"
                >
                  {selectedMentionMembers.map((m) => m.displayName).join("，")}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
                className="w-56 max-h-64 overflow-y-auto"
                onCloseAutoFocus={(e) => e.preventDefault()}
                onFocusCapture={keepMentionDropdownOpen}
                onMouseEnter={keepMentionDropdownOpen}
                onMouseLeave={scheduleMentionDropdownClose}
              >
                {selectedMentionMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 rounded-[8px] px-2.5 py-1.5"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-[11px] font-semibold text-muted-foreground">
                      {member.displayName.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                    <button
                      aria-label={`移除 @${member.displayName}`}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface-muted hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeMentionMember(member.id);
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      type="button"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
          placeholder={placeholder}
          ref={textareaRef}
          value={draft}
        />
      </div>
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

  const atIndex = match.index + match[1].length;

  return {
    end: safeCursorPosition,
    query: match[2],
    start: atIndex,
  };
}
