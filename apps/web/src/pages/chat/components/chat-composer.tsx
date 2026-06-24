import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  ChatDelayIcon,
  Folder01Icon,
  FolderFavouriteIcon,
  Image01Icon,
  Link01Icon,
  SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { Spinner } from "@/components/ui/spinner";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  ComposerLiteAttachmentNode,
  ComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import { ComposerRuntimePlugin } from "@/pages/chat/components/composer/lexical-plugins";
import { QuoteMessagePreview } from "@/pages/chat/components/message/quote";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { SphFeedMark } from "@/pages/chat/components/message/sphfeed";
import {
  $insertComposerMention,
  $insertComposerText,
  $removeComposerTextRange,
} from "@/pages/chat/components/composer/lexical-utils";
import { WechatEmojiPicker } from "@/pages/chat/components/wechat-emoji-picker";
import {
  COMPOSER_IMAGE_FILE_ACCEPT,
  isSupportedComposerImageFile,
  MAX_COMPOSER_IMAGE_SEGMENTS,
} from "@/pages/chat/lib/composer-image-files";
import { COMPOSER_FILE_ACCEPT } from "@/pages/chat/lib/composer-file-files";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import { getWechatEmojiByName, type WechatEmojiName } from "@/pages/chat/wechat-emoji";
import type { GroupMember, QuotedMessagePreviewContent } from "@/pages/chat/chat-types";

type ChatComposerProps = {
  canSendMessage: boolean;
  collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
  draft: string;
  hasMoreCollectedExpressions?: boolean;
  hasActiveFileUpload: boolean;
  groupMembers: GroupMember[];
  currentSeatThirdUserId?: string;
  inputEnterBehavior: InputEnterBehavior;
  isGroupConversation: boolean;
  isEmojiPickerOpen: boolean;
  isCollectedExpressionLoadingMore?: boolean;
  sendingCollectedExpressionId?: string | null;
  isSending: boolean;
  isHistoryPanelOpen: boolean;
  onClearQuotedMessage: () => void;
  onDeleteCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onFileSelect: (files: FileList | File[] | null) => void;
  onLoadMoreCollectedExpressions?: () => void;
  onOpenCollectedExpressions?: () => void;
  onOpenMaterialLibrary: (bizType: ComposerMaterialLibraryBizType) => void;
  onOpenHistory: () => void;
  onSelectCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSendDraft: (segments: ComposerSegment[]) => void;
  onTopCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  placeholder: string;
  quotedMessage: QuotedMessagePreviewContent | null;
  composerRef: RefObject<LexicalEditor | null>;
};

export type ComposerMaterialLibraryBizType =
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.IMAGE
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.FILE
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.H5
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED;

type MentionDropdownItem =
  | {
      displayName: string;
      isAll: true;
      memberId: "__all__";
    }
  | {
      avatarUrl?: string;
      displayName: string;
      isAll?: false;
      memberId: string;
    };

function createComposerImageClientId() {
  return `composer-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatComposer({
  canSendMessage,
  collectedExpressions = [],
  draft,
  hasMoreCollectedExpressions,
  hasActiveFileUpload,
  groupMembers,
  currentSeatThirdUserId,
  inputEnterBehavior,
  isGroupConversation,
  isEmojiPickerOpen,
  isCollectedExpressionLoadingMore,
  sendingCollectedExpressionId,
  isSending,
  isHistoryPanelOpen,
  onClearQuotedMessage,
  onDeleteCollectedExpression,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEnterBehaviorChange,
  onFileSelect,
  onLoadMoreCollectedExpressions,
  onOpenCollectedExpressions,
  onOpenMaterialLibrary,
  onOpenHistory,
  onSelectCollectedExpression,
  onSegmentsChange,
  onSendDraft,
  onTopCollectedExpression,
  placeholder,
  quotedMessage,
  composerRef,
}: ChatComposerProps) {
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftText, setDraftText] = useState(draft);
  const [segments, setSegments] = useState<ComposerSegment[]>([]);
  const [cursorPosition, setCursorPosition] = useState(draft.length);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [isMentionPickerDismissed, setIsMentionPickerDismissed] = useState(false);
  const editorConfig = useMemo(
    () => ({
      namespace: "ChatComposer",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
  const mentionTrigger = useMemo(
    () => getMentionTrigger(draftText, cursorPosition),
    [cursorPosition, draftText],
  );
  const mentionableGroupMembers = useMemo(() => {
    if (!currentSeatThirdUserId) {
      return groupMembers;
    }

    return groupMembers.filter((member) => member.id !== currentSeatThirdUserId);
  }, [currentSeatThirdUserId, groupMembers]);
  const filteredMentionMembers = useMemo(() => {
    if (!mentionTrigger || !isGroupConversation) {
      return [];
    }

    const normalizedQuery = mentionTrigger.query.trim().toLocaleLowerCase();

    return mentionableGroupMembers.filter((member) => {
      return member.displayName.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [isGroupConversation, mentionTrigger, mentionableGroupMembers]);
  const shouldShowMentionAll = useMemo(() => {
    if (!mentionTrigger || mentionableGroupMembers.length === 0) {
      return false;
    }

    const normalizedQuery = mentionTrigger.query.trim().toLocaleLowerCase();

    return (
      normalizedQuery.length === 0 ||
      "所有人".toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [mentionTrigger, mentionableGroupMembers.length]);
  const mentionDropdownItems = useMemo<MentionDropdownItem[]>(
    () => {
      if (mentionableGroupMembers.length === 0) {
        return [];
      }

      const mentionAllItem: MentionDropdownItem = {
        displayName: `所有人（${mentionableGroupMembers.length}人）`,
        isAll: true,
        memberId: "__all__",
      };

      return [
        ...(shouldShowMentionAll ? [mentionAllItem] : []),
        ...filteredMentionMembers.map((member) => ({
          avatarUrl: member.avatarUrl,
          displayName: member.displayName,
          memberId: member.id,
        })),
      ];
    },
    [filteredMentionMembers, mentionableGroupMembers.length, shouldShowMentionAll],
  );
  const isMentionPickerOpen =
    canSendMessage &&
    !isSending &&
    isGroupConversation &&
    !!mentionTrigger &&
    !isMentionPickerDismissed &&
    mentionDropdownItems.length > 0;
  const canSubmitDraft = canSendMessage && !isSending && segments.length > 0;
  const canEditComposer = canSendMessage && !isSending;
  const canSelectFile = canEditComposer && !hasActiveFileUpload;
  const composerImageCount = segments.filter(
    (segment) => segment.type === "image",
  ).length;
  const canAddComposerImage =
    canEditComposer && composerImageCount < MAX_COMPOSER_IMAGE_SEGMENTS;
  const canOpenCollectedFiles = canSendMessage && !isSending;
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
    if (draft === "" && draftText !== "") {
      composerRef.current?.dispatchCommand(CLEAR_COMPOSER_COMMAND, undefined);
    }
  }, [composerRef, draft, draftText]);

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        !target ||
        emojiPickerRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest('[data-emoji-picker-portal="true"]'))
      ) {
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
    (nextDraftText: string, nextCursorPosition: number) => {
      setDraftText(nextDraftText);
      setCursorPosition(nextCursorPosition);
      onDraftChange(nextDraftText);
    },
    [onDraftChange],
  );

  const handleMoveMentionPicker = useCallback(
    (direction: "down" | "up") => {
      setActiveMentionIndex((currentIndex) =>
        direction === "down"
          ? Math.min(currentIndex + 1, mentionDropdownItems.length - 1)
          : Math.max(currentIndex - 1, 0),
      );
    },
    [mentionDropdownItems.length],
  );

  const handleSelectActiveMention = useCallback(() => {
    if (!mentionTrigger) {
      return;
    }

    const selectedMember = mentionDropdownItems[activeMentionIndex];

    if (!selectedMember) {
      return;
    }

    composerRef.current?.update(() => {
      $removeComposerTextRange(mentionTrigger.start, mentionTrigger.end);
      if (shouldPadMentionPrefix(draftText, mentionTrigger.start)) {
        $insertComposerText(" ");
      }
      $insertComposerMention({
        displayName: selectedMember.isAll ? "所有人" : selectedMember.displayName,
        isAll: selectedMember.isAll,
        memberId: selectedMember.isAll ? "__all__" : selectedMember.memberId,
      });
      $insertComposerText(" ");
    });
    setIsMentionPickerDismissed(true);
    composerRef.current?.focus();
  }, [
    composerRef,
    mentionDropdownItems,
    mentionTrigger,
    activeMentionIndex,
  ]);

  const handleImageFiles = async (fileList: FileList | File[] | null) => {
    if (isSending || !canSendMessage) {
      return;
    }

    const currentImageCount = segments.filter(
      (segment) => segment.type === "image",
    ).length;
    const remainingImageSlots = Math.max(
      0,
      MAX_COMPOSER_IMAGE_SEGMENTS - currentImageCount,
    );
    const supportedFiles = Array.from(fileList ?? []).filter(
      isSupportedComposerImageFile,
    );
    const files = supportedFiles.slice(0, remainingImageSlots);

    if (supportedFiles.length > remainingImageSlots) {
      toast.warning("单次发送图片限制为5张");
    }

    if (files.length === 0) {
      composerRef.current?.focus();
      return;
    }

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
        clientId: createComposerImageClientId(),
        localUrl: image.src,
        src: image.src,
      });
    }

    composerRef.current?.focus();
  };

  const handleEmojiSelect = (name: WechatEmojiName) => {
    if (isSending || !canSendMessage) {
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
    <TooltipProvider delayDuration={300}>
      <div className="space-y-1.5 bg-surface">
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="ml-[-6px] flex items-center gap-1.5">
            <div className="relative" ref={emojiPickerRef}>
              <ComposerActionTooltip
                disabled={isSending || !canSendMessage}
                label="表情"
              >
                <Button
                  aria-label="微信表情"
                  className={cn(
                    composerActionButtonClass,
                    isEmojiPickerOpen && "bg-primary/10 text-primary",
                  )}
                  disabled={isSending || !canSendMessage}
                  onClick={() => onEmojiPickerOpenChange(!isEmojiPickerOpen)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={2} />
                </Button>
              </ComposerActionTooltip>

              {isEmojiPickerOpen ? (
                <div className="absolute bottom-full left-[-24px] z-30 mb-3">
                  <WechatEmojiPicker
                    collectedExpressions={collectedExpressions}
                    hasMoreCollectedExpressions={hasMoreCollectedExpressions}
                    isCollectedExpressionLoadingMore={
                      isCollectedExpressionLoadingMore
                    }
                    sendingCollectedExpressionId={sendingCollectedExpressionId}
                    onDeleteCollectedExpression={onDeleteCollectedExpression}
                    onLoadMoreCollectedExpressions={
                      onLoadMoreCollectedExpressions
                    }
                    onOpenCollectedExpressions={onOpenCollectedExpressions}
                    onSelect={handleEmojiSelect}
                    onSelectCollectedExpression={onSelectCollectedExpression}
                    onTopCollectedExpression={onTopCollectedExpression}
                  />
                </div>
              ) : null}
            </div>
            <ComposerMaterialSplitButton
              canOpenCollected={isSending ? false : canSendMessage}
              canSelectLocal={canAddComposerImage}
              collectedIcon={FolderFavouriteIcon}
              collectedLabel="收录的图片"
              localLabel="本地图片"
              menuLabel="打开图片菜单"
              onOpenCollected={() => {
                onOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.IMAGE);
              }}
              onSelectLocal={() => imageInputRef.current?.click()}
              primaryIcon={Image01Icon}
              primaryLabel="选择收录图片"
              tooltipLabel="图片"
            />
            <input
              accept={COMPOSER_IMAGE_FILE_ACCEPT}
              aria-label="选择图片"
              className="sr-only"
              disabled={!canAddComposerImage}
              multiple
              onChange={(event) => {
                void handleImageFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={imageInputRef}
              type="file"
            />
            <ComposerActionTooltip
              disabled={isSending || !canSendMessage}
              label="小程序"
            >
              <Button
                aria-label="收藏小程序"
                className={composerActionButtonClass}
                disabled={isSending || !canSendMessage}
                onClick={() =>
                  onOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM)
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <MiniProgramMark className="size-4.5" />
              </Button>
            </ComposerActionTooltip>
            <ComposerActionTooltip
              disabled={isSending || !canSendMessage}
              label="视频号"
            >
              <Button
                aria-label="收藏视频号"
                className={composerActionButtonClass}
                disabled={isSending || !canSendMessage}
                onClick={() =>
                  onOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED)
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <SphFeedMark className="size-5.75" />
              </Button>
            </ComposerActionTooltip>
            <ComposerActionTooltip
              disabled={isSending || !canSendMessage}
              label="H5链接"
            >
              <Button
                aria-label="收藏H5"
                className={composerActionButtonClass}
                disabled={isSending || !canSendMessage}
                onClick={() => onOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.H5)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Link01Icon} size={18} strokeWidth={2} />
              </Button>
            </ComposerActionTooltip>
            <ComposerMaterialSplitButton
              canOpenCollected={canOpenCollectedFiles}
              canSelectLocal={canSelectFile}
              collectedIcon={FolderFavouriteIcon}
              collectedLabel="收录的文件"
              localLabel="本地文件"
              menuLabel="打开文件菜单"
              onOpenCollected={() => onOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.FILE)}
              onSelectLocal={() => fileInputRef.current?.click()}
              primaryIcon={Folder01Icon}
              primaryLabel="收藏文件"
              tooltipLabel="文件"
            />
            <input
              accept={COMPOSER_FILE_ACCEPT}
              aria-label="选择文件"
              className="sr-only"
              disabled={!canSelectFile}
              onChange={(event) => {
                onFileSelect(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <ComposerActionTooltip label="聊天记录">
              <Button
                aria-label="历史记录"
                aria-pressed={isHistoryPanelOpen}
                className={cn(
                  composerActionButtonClass,
                  isHistoryPanelOpen &&
                    "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={onOpenHistory}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={ChatDelayIcon} size={18} strokeWidth={2} />
              </Button>
            </ComposerActionTooltip>
          </div>
          <div className="flex items-center gap-1">
            <Select
              onValueChange={(value) =>
                onEnterBehaviorChange(value as InputEnterBehavior)
              }
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
              onMouseDown={(event) => event.preventDefault()}
              size="icon"
            >
              {isSending ? (
                <Spinner variant="classic" size={14} className="text-current" />
              ) : (
                <HugeiconsIcon
                  icon={ArrowUp02Icon}
                  size={14}
                  strokeWidth={2}
                />
              )}
            </Button>
          </div>
        </div>

      {quotedMessage ? (
        <div
          className="flex items-start gap-2"
          data-testid="composer-quote-preview"
        >
          <QuoteMessagePreview
            quoteMsgId={quotedMessage.quoteMsgId ?? ""}
            quotedMessage={quotedMessage}
          />
          <Button
            aria-label="取消引用"
            className="size-7 shrink-0 rounded-full p-0 text-muted-foreground shadow-none hover:bg-surface-hover hover:text-foreground"
            onClick={onClearQuotedMessage}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Cancel01Icon}
              size={14}
              strokeWidth={2}
            />
          </Button>
        </div>
      ) : null}

      <div className="relative">
        {isMentionPickerOpen && mentionTrigger ? (
          <div
            aria-label="选择群成员"
            className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-56 overflow-y-auto rounded-[10px] border border-border bg-popover py-1 shadow-[0_10px_28px_var(--shadow-soft)]"
            role="listbox"
          >
            {mentionDropdownItems.map((member, index) => (
              <button
                aria-selected={index === activeMentionIndex}
                className={cn(
                  "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] text-popover-foreground outline-none transition-colors hover:bg-surface-hover",
                  index === activeMentionIndex && "bg-surface-hover",
                )}
                key={member.memberId}
                onClick={() => {
                  composerRef.current?.update(() => {
                    $removeComposerTextRange(mentionTrigger.start, mentionTrigger.end);
                    if (shouldPadMentionPrefix(draftText, mentionTrigger.start)) {
                      $insertComposerText(" ");
                    }
                    $insertComposerMention({
                      displayName: member.isAll ? "所有人" : member.displayName,
                      isAll: member.isAll,
                      memberId: member.memberId,
                    });
                    $insertComposerText(" ");
                  });
                  setIsMentionPickerDismissed(true);
                  composerRef.current?.focus();
                }}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                {!member.isAll && member.avatarUrl ? (
                  <MentionMemberAvatar
                    member={{
                      avatarUrl: member.avatarUrl,
                      displayName: member.displayName,
                      id: member.memberId,
                    }}
                  />
                ) : null}
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
          </LexicalComposer>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

function ComposerMaterialSplitButton({
  canOpenCollected,
  canSelectLocal,
  collectedIcon,
  collectedLabel,
  localLabel,
  menuLabel,
  onOpenCollected,
  onSelectLocal,
  primaryIcon,
  primaryLabel,
  tooltipLabel,
}: {
  canOpenCollected: boolean;
  canSelectLocal: boolean;
  collectedIcon: typeof FolderFavouriteIcon;
  collectedLabel: string;
  localLabel: string;
  menuLabel: string;
  onOpenCollected: () => void;
  onSelectLocal: () => void;
  primaryIcon: typeof Folder01Icon;
  primaryLabel: string;
  tooltipLabel: string;
}) {
  const isControlDisabled = !canOpenCollected && !canSelectLocal;
  const segmentHoverClass =
    "transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25";

  return (
    <ComposerActionTooltip disabled={isControlDisabled} label={tooltipLabel}>
      <div
        className={cn(
          "inline-flex h-8 shrink-0 items-center overflow-hidden rounded-[8px] text-muted-foreground transition-colors",
          !isControlDisabled && [
            "[&:has(button:hover:not(:disabled))]:bg-accent/50",
            "[&:has(button:hover:not(:disabled))]:text-accent-foreground",
            "[&:has([data-state=open])]:bg-accent/50",
            "[&:has([data-state=open])]:text-accent-foreground",
          ],
          isControlDisabled && "pointer-events-none opacity-45",
        )}
      >
        <button
          aria-label={primaryLabel}
          className={cn(
            "flex h-8 shrink-0 items-center justify-center rounded-l-[8px] pl-1.5 pr-0.5 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit",
            segmentHoverClass,
          )}
          disabled={!canOpenCollected}
          onClick={onOpenCollected}
          type="button"
        >
          <HugeiconsIcon icon={primaryIcon} size={18} strokeWidth={2} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={menuLabel}
              className={cn(
                "flex h-8 w-4 shrink-0 items-center justify-center rounded-r-[8px] pr-0.5 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
                segmentHoverClass,
              )}
              disabled={isControlDisabled}
              type="button"
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={1.8}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[8.5rem]">
            <DropdownMenuItem
              disabled={!canSelectLocal}
              onSelect={onSelectLocal}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={1.8} />
              {localLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canOpenCollected}
              onSelect={onOpenCollected}
            >
              <HugeiconsIcon icon={collectedIcon} size={16} strokeWidth={1.8} />
              {collectedLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ComposerActionTooltip>
  );
}

function ComposerActionTooltip({
  children,
  disabled,
  label,
}: {
  children: ReactElement;
  disabled?: boolean;
  label: string;
}) {
  const trigger = disabled ? (
    <span className="inline-flex">{children}</span>
  ) : (
    children
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function MentionMemberAvatar({
  member,
}: {
  member: Pick<GroupMember, "avatarUrl" | "displayName" | "id">;
}) {
  const [imageErrored, setImageErrored] = useState(false);

  if (!member.avatarUrl || imageErrored) {
    return null;
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
  const match = /@([^\s@]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  return {
    end: safeCursorPosition,
    query: match[1],
    start: match.index,
  };
}

function shouldPadMentionPrefix(draft: string, mentionStart: number) {
  if (mentionStart <= 0) {
    return false;
  }

  return !/\s/.test(draft[mentionStart - 1] ?? "");
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
