import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import {
  AiChat02Icon,
  ArrowUp02Icon,
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

type ChatComposerProps = {
  canSendMessage: boolean;
  composerHint?: string;
  draft: string;
  inputEnterBehavior: InputEnterBehavior;
  isEmojiPickerOpen: boolean;
  onDraftChange: (draft: string) => void;
  onEmojiPickerOpenChange: (isOpen: boolean) => void;
  onEmojiSelect: (name: WechatEmojiName) => void;
  onEnterBehaviorChange: (behavior: InputEnterBehavior) => void;
  onSendDraft: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function ChatComposer({
  canSendMessage,
  composerHint,
  draft,
  inputEnterBehavior,
  isEmojiPickerOpen,
  onDraftChange,
  onEmojiPickerOpenChange,
  onEmojiSelect,
  onEnterBehaviorChange,
  onSendDraft,
  textareaRef,
}: ChatComposerProps) {
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

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
            disabled={!draft.trim() || !canSendMessage}
            onClick={onSendDraft}
            size="icon"
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <Textarea
        className="chat-composer-textarea min-h-28 resize-none rounded-none border-0 bg-transparent py-1 pl-0 pr-0.5 text-[14px] shadow-none focus-visible:ring-0"
        disabled={!canSendMessage}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleDraftKeyDown}
        placeholder={canSendMessage ? "请输入消息……" : "当前会话暂不可发送消息"}
        ref={textareaRef}
        value={draft}
      />
      {composerHint ? (
        <p className="px-0.5 text-[12px] leading-5 text-muted-foreground">
          {composerHint}
        </p>
      ) : null}
    </div>
  );
}
