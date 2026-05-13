import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp02Icon,
  Cancel01Icon,
  ChatDelayIcon,
  Image01Icon,
  Loading03Icon,
  SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
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
import { cn } from "@/lib/utils";
import {
  type InputEnterBehavior,
  INPUT_ENTER_BEHAVIOR_DESCRIPTIONS,
  INPUT_ENTER_BEHAVIOR_LABELS,
} from "@/pages/chat/components/input-enter-behavior";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_EMOJI_COMMAND,
  INSERT_COMPOSER_IMAGE_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import {
  ComposerEmojiNode,
  ComposerImageNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import {
  ComposerRuntimePlugin,
  MentionTextRemovalPlugin,
} from "@/pages/chat/components/composer/lexical-plugins";
import { WechatEmojiPicker } from "@/pages/chat/components/wechat-emoji-picker";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import { getWechatEmojiByName, type WechatEmojiName } from "@/pages/chat/wechat-emoji";
import type { GroupMember } from "@/pages/chat/chat-types";

export type MentionInsertPosition = "start" | "end";

type ChatComposerProps = {
  canSendMessage: boolean;
  draft: string;
  groupMembers: GroupMember[];
  inputEnterBehavior: InputEnterBehavior;
  isGroupConversation: boolean;
  isEmojiPickerOpen: boolean;
  isSending: boolean;
  mentionInsertPosition: MentionInsertPosition;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onMentionInsertPositionChange: (position: MentionInsertPosition) => void;
  onRemoveMentionMember: (memberId: string) => void;
  onSelectMentionMember: (member: GroupMember, triggerStart: number, triggerEnd: number) => void;
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSendDraft: (segments: ComposerSegment[]) => void;
  selectedMentionMembers: GroupMember[];
  placeholder: string;
  composerRef: RefObject<LexicalEditor | null>;
};

export function ChatComposer({
  canSendMessage,
  draft,
  groupMembers,
  inputEnterBehavior,
  isGroupConversation,
  isEmojiPickerOpen,
  isSending,
  mentionInsertPosition,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onMentionInsertPositionChange,
  onRemoveMentionMember,
  onSelectMentionMember,
  onSegmentsChange,
  onSendDraft,
  selectedMentionMembers,
  placeholder,
  composerRef,
}: ChatComposerProps) {
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mentionDropdownCloseTimerRef = useRef<number | null>(null);
  const [draftText, setDraftText] = useState(draft);
  const [segments, setSegments] = useState<ComposerSegment[]>([]);
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(draft.length);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [isMentionPickerDismissed, setIsMentionPickerDismissed] = useState(false);
  const [pendingMentionRemoval, setPendingMentionRemoval] = useState<{
    end: number;
    start: number;
  } | null>(null);
  const editorConfig = useMemo(
    () => ({
      namespace: "ChatComposer",
      nodes: [ComposerEmojiNode, ComposerImageNode],
      onError(error: Error) {
        throw error;
      },
      theme: {
        paragraph: "m-0",
        root: "chat-composer-editor min-h-28 outline-none",
      },
    }),
    [],
  );
  const mentionSummaryLabel = `查看已 @ 的 ${selectedMentionMembers.length} 位群成员`;
  const mentionTrigger = useMemo(
    () => getMentionTrigger(draftText, cursorPosition),
    [cursorPosition, draftText],
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
    !isSending &&
    isGroupConversation &&
    !!mentionTrigger &&
    !isMentionPickerDismissed &&
    filteredMentionMembers.length > 0;
  const canSubmitDraft =
    canSendMessage &&
    !isSending &&
    (segments.length > 0 || selectedMentionMembers.length > 0);
  const canEditComposer = canSendMessage && !isSending;
  const composerActionButtonClass = "size-8 p-0 shadow-none";

  const registerEditor = useCallback(
    (editor: LexicalEditor | null) => {
      composerRef.current = editor;
    },
    [composerRef],
  );

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

  useEffect(() => {
    if (draft === "" && draftText !== "") {
      composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
    }
  }, [composerRef, draft, draftText]);

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

  const handleDraftTextChange = useCallback(
    (nextDraftText: string) => {
      setDraftText(nextDraftText);
      setCursorPosition(nextDraftText.length);
      onDraftChange(nextDraftText);
    },
    [onDraftChange],
  );

  const handleMoveMentionPicker = useCallback(
    (direction: "down" | "up") => {
      setActiveMentionIndex((currentIndex) =>
        direction === "down"
          ? Math.min(currentIndex + 1, filteredMentionMembers.length - 1)
          : Math.max(currentIndex - 1, 0),
      );
    },
    [filteredMentionMembers.length],
  );

  const handleSelectActiveMention = useCallback(() => {
    if (!mentionTrigger) {
      return;
    }

    const selectedMember = filteredMentionMembers[activeMentionIndex];

    if (!selectedMember) {
      return;
    }

    onSelectMentionMember(
      selectedMember,
      mentionTrigger.start,
      mentionTrigger.end,
    );
    setPendingMentionRemoval({
      end: mentionTrigger.end,
      start: mentionTrigger.start,
    });
  }, [
    activeMentionIndex,
    filteredMentionMembers,
    mentionTrigger,
    onSelectMentionMember,
  ]);

  const handleImageFiles = async (fileList: FileList | File[] | null) => {
    if (isSending) {
      return;
    }

    const files = Array.from(fileList ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    const images = await Promise.all(
      files.map(async (file) => ({
        alt: file.name || "图片",
        src: await readImageFileAsDataUrl(file),
      })),
    );

    for (const image of images) {
      if (!image.src) {
        continue;
      }

      composerRef.current?.dispatchCommand(INSERT_COMPOSER_IMAGE_COMMAND, {
        alt: image.alt,
        localUrl: image.src,
        src: image.src,
      });
    }

    composerRef.current?.focus();
  };

  const handleEmojiSelect = (name: WechatEmojiName) => {
    if (isSending) {
      return;
    }

    const emoji = getWechatEmojiByName(name);

    onEmojiPickerOpenChange(false);

    if (!emoji) {
      return;
    }

    composerRef.current?.dispatchCommand(INSERT_COMPOSER_EMOJI_COMMAND, emoji);
    composerRef.current?.focus();
  };

  const handleSendDraft = () => {
    if (!canSubmitDraft) {
      return;
    }

    onSendDraft(segments);
  };

  const handleSegmentsChange = useCallback(
    (nextSegments: ComposerSegment[]) => {
      setSegments(nextSegments);
      onSegmentsChange(nextSegments);
    },
    [onSegmentsChange],
  );

  return (
    <div className="space-y-1.5 bg-surface px-4 py-2">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="ml-[-6px] flex items-center gap-1.5">
          <div className="relative" ref={emojiPickerRef}>
            <Button
              aria-label="微信表情"
              className={cn(
                composerActionButtonClass,
                isEmojiPickerOpen && "bg-primary/10 text-primary",
              )}
              disabled={isSending}
              onClick={() => onEmojiPickerOpenChange(!isEmojiPickerOpen)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={1.8} />
            </Button>

            {isEmojiPickerOpen ? (
              <div className="absolute bottom-full left-[-24px] z-30 mb-3">
                <WechatEmojiPicker onSelect={handleEmojiSelect} />
              </div>
            ) : null}
          </div>
          <Button
            aria-label="发送图片"
            className={composerActionButtonClass}
            disabled={isSending}
            onClick={() => imageInputRef.current?.click()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
          </Button>
          <input
            accept="image/*"
            aria-label="选择图片"
            className="sr-only"
            multiple
            onChange={(event) => {
              void handleImageFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
            ref={imageInputRef}
            type="file"
          />
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
              className="h-7 min-w-0 border-0 text-[12px] bg-transparent px-1.5 text-muted-foreground shadow-none focus:ring-0"
              disabled={isSending}
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
            aria-busy={isSending}
            className="size-7 rounded-full p-0 shadow-none"
            disabled={isSending || !canSubmitDraft}
            onClick={handleSendDraft}
            size="icon"
          >
            <HugeiconsIcon
              className={cn(isSending && "animate-spin")}
              icon={isSending ? Loading03Icon : ArrowUp02Icon}
              size={14}
              strokeWidth={2}
            />
          </Button>
        </div>
      </div>

      <div className="relative">
        {selectedMentionMembers.length > 0 ? (
          <div className="mb-1 flex min-h-8 items-center gap-1 border-b border-divider/70 text-[13px]">
            <span className="shrink-0 text-muted-foreground">在</span>

            <Select
              onValueChange={(value) =>
                onMentionInsertPositionChange(value as MentionInsertPosition)
              }
              value={mentionInsertPosition}
            >
              <SelectTrigger
                aria-label="选择 @ 插入位置"
                className="h-7 min-w-0 shrink-0 border-0 shadow-none bg-transparent px-1 py-1 text-[13px] text-primary focus:ring-0"
                disabled={isSending}
              >
                <span>{mentionInsertPosition === "start" ? "文首" : "文尾"}</span>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="start">文首</SelectItem>
                <SelectItem value="end">文尾</SelectItem>
              </SelectContent>
            </Select>

            <span className="shrink-0 text-muted-foreground">
              @ {selectedMentionMembers.length} 人：
            </span>

            <DropdownMenu
              open={isMentionDropdownOpen}
              onOpenChange={setIsMentionDropdownOpen}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={mentionSummaryLabel}
                  className="min-w-0 flex-1 truncate text-left text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  disabled={isSending}
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
                className="max-h-64 w-56 overflow-y-auto"
                onCloseAutoFocus={(e) => e.preventDefault()}
                onFocusCapture={keepMentionDropdownOpen}
                onMouseEnter={keepMentionDropdownOpen}
                onMouseLeave={scheduleMentionDropdownClose}
              >
                {selectedMentionMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-sm"
                  >
                    <MentionMemberAvatar member={member} />
                    <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                    <button
                      aria-label={`移除 @${member.displayName}`}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface-muted hover:text-destructive"
                      disabled={isSending}
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
                  "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] text-popover-foreground outline-none transition-colors hover:bg-surface-hover",
                  index === activeMentionIndex && "bg-surface-hover",
                )}
                key={member.id}
                onClick={() => {
                  onSelectMentionMember(
                    member,
                    mentionTrigger.start,
                    mentionTrigger.end,
                  );
                  setPendingMentionRemoval({
                    end: mentionTrigger.end,
                    start: mentionTrigger.start,
                  });
                }}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <MentionMemberAvatar member={member} />
                <span className="truncate">{member.displayName}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative">
          <LexicalComposer initialConfig={editorConfig}>
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label={placeholder}
                  aria-multiline="true"
                  className="chat-composer-textarea min-h-28 max-h-80 overflow-y-auto rounded-none border-0 bg-transparent py-1 pl-0 pr-0.5 text-[14px] leading-6 shadow-none outline-none focus-visible:ring-0"
                  data-testid="chat-composer-editor"
                />
              }
              placeholder={
                <div className="pointer-events-none absolute left-0 top-1 text-[14px] text-muted-foreground">
                  {placeholder}
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <ComposerRuntimePlugin
              canSendMessage={canEditComposer}
              inputEnterBehavior={inputEnterBehavior}
              isMentionPickerOpen={isMentionPickerOpen}
              onDraftTextChange={handleDraftTextChange}
              onEscapeMentionPicker={() => setIsMentionPickerDismissed(true)}
              onMoveMentionPicker={handleMoveMentionPicker}
              onSegmentsChange={handleSegmentsChange}
              onSelectActiveMention={handleSelectActiveMention}
              onPasteImageFiles={handleImageFiles}
              onSendSegments={onSendDraft}
              registerEditor={registerEditor}
            />
            <MentionTextRemovalPlugin
              pendingRemoval={pendingMentionRemoval}
              onRemovalComplete={() => setPendingMentionRemoval(null)}
            />
          </LexicalComposer>
        </div>
      </div>
    </div>
  );
}

function MentionMemberAvatar({ member }: { member: GroupMember }) {
  const [imageErrored, setImageErrored] = useState(false);

  if (!member.avatarUrl || imageErrored) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-primary/15 font-semibold text-[10px] text-muted-foreground"
      >
        {member.displayName.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="relative flex size-5 shrink-0 overflow-hidden rounded-[6px]">
      <img
        alt=""
        aria-hidden="true"
        className="size-full object-cover"
        data-testid="mention-member-avatar"
        onError={() => setImageErrored(true)}
        src={member.avatarUrl}
      />
    </span>
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

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => resolve(""));
    reader.readAsDataURL(file);
  });
}
