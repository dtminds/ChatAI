import { useState } from "react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import type { ChatMessage } from "@/pages/chat/chat-types";

const SMART_REPLY_TRIGGER_ICON =
  "https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/customer/容器@2x (1).png!tiny.webp";

export type SmartReplySuggestion = {
  assistantAvatarUrl?: string;
  assistantName: string;
  content: string;
  status?: "thinking" | "ready";
  versionCount: number;
  versionIndex: number;
};

export type SmartReplyCardProps = {
  assistantAvatarUrl?: string;
  assistantName: string;
  content: string;
  isEditing?: boolean;
  isThinking?: boolean;
  isProcessing?: boolean;
  isKnowledgeHit?: boolean;
  onContentChange?: (content: string) => void;
  onEdit?: () => void;
  onMakeShorter?: () => void;
  onRegenerate?: () => void;
  onSend?: () => void;
  versionCount: number;
  versionIndex: number;
};

export function SmartReplyCard({
  assistantAvatarUrl,
  assistantName,
  content,
  isEditing = false, 
  isThinking = false,
  isProcessing = false,
  isKnowledgeHit = true,
  onContentChange,
  onEdit,
  onMakeShorter,
  onRegenerate,
  onSend,
  versionCount,
  versionIndex,
}: SmartReplyCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const versionLabel = `${versionIndex + 1}/${Math.max(versionCount, 1)}`;

  return (
    <article
      className="w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-[8px] border border-border bg-background shadow-[0_8px_24px_var(--shadow-medium)]"
      data-collapsed={isCollapsed ? "true" : "false"}
      data-testid="smart-reply-card"
    >
      <header className="flex items-center gap-[6px] bg-[#F8FBFF] px-[16px] py-[8px]">
        <SmartReplyAssistantAvatar
          avatarUrl={
            assistantAvatarUrl ||
            "https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/customer/小luna@2x.png!tiny.webp"
          }
          name={assistantName}
        />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-[#101419]">
          {assistantName}
        </p>
        <button
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "展开智能回复" : "关闭智能回复"}
          className="inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-[6px] px-1 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20"
          onClick={() => setIsCollapsed((current) => !current)}
          type="button"
        >
          {isCollapsed ? (
            <>
              <span className="text-[12px] leading-4 text-[#267FF0]">展开</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2}  color="#267FF0"/>
            </>
          ) : (
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          )}
        </button>
      </header>

      {isCollapsed ? null : (
        <>
          <SmartReplyContentBody
            content={content}
            isEditing={isEditing}
            isThinking={isThinking}
            isProcessing={isProcessing}
            isKnowledgeHit={isKnowledgeHit}
            onContentChange={onContentChange}
          />
          {
            isKnowledgeHit && !isEditing && !isThinking && !isProcessing ? 
            <footer className="flex items-center justify-between px-[16px] pb-[12px]">
              <SmartReplyToolbar
                onMakeShorter={onMakeShorter}
                onRegenerate={onRegenerate}
                versionLabel={versionLabel}
              />
              <SmartReplyActions
                content={content}
                isThinking={isThinking}
                onEdit={onEdit}
                onSend={onSend}
              />
            </footer> : null
          }
        </>
      )}
    </article>
  );
}

type SmartReplyMessageAnchorProps = {
  message: ChatMessage;
  onEdit?: (message: ChatMessage, content: string) => void;
  onMakeShorter?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
  onSend?: (message: ChatMessage, content: string) => void;
  suggestion?: SmartReplySuggestion | null;
};

export function SmartReplyMessageAnchor({
  message,
  onEdit,
  onMakeShorter,
  onRegenerate,
  onSend,
  suggestion,
}: SmartReplyMessageAnchorProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");

  const resolvedSuggestion = suggestion ?? createDemoSuggestion(message);
  const displayContent = isEditing ? draftContent : resolvedSuggestion.content;
  const isThinking = resolvedSuggestion.status === "thinking";

  const handleDismiss = () => {
    setDismissed(true);
    setIsEditing(false);
    setDraftContent("");
  };

  if (dismissed) {
    return null;
  }

  return (
    <SmartReplyCard
      assistantAvatarUrl={resolvedSuggestion.assistantAvatarUrl}
      assistantName={resolvedSuggestion.assistantName}
      content={displayContent}
      isEditing={isEditing}
      isThinking={isThinking}
      onContentChange={setDraftContent}
      onEdit={() => {
        setDraftContent(displayContent);
        setIsEditing(true);
      }}
      onMakeShorter={
        onMakeShorter
          ? () => {
              onMakeShorter(message);
            }
          : undefined
      }
      onRegenerate={
        onRegenerate
          ? () => {
              onRegenerate(message);
            }
          : undefined
      }
      onSend={
        onSend
          ? () => {
              onSend(message, displayContent.trim());
              handleDismiss();
            }
          : undefined
      }
      versionCount={resolvedSuggestion.versionCount}
      versionIndex={resolvedSuggestion.versionIndex}
    />
  );
}

export function SmartReplyTriggerIcon() {
  return (
    <img
      alt=""
      aria-hidden
      className="size-[14px] object-contain"
      src={SMART_REPLY_TRIGGER_ICON}
    />
  );
}

function SmartReplyAssistantAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string;
  name: string;
}) {
  return (
    <Avatar className="size-7 rounded-full">
      {avatarUrl ? <AvatarImage alt={name} src={avatarUrl} /> : null}
      <AvatarFallback className="rounded-full bg-transparent text-[11px] text-white">
        AI
      </AvatarFallback>
    </Avatar>
  );
}

function SmartReplyContentBody({
  content,
  isEditing,
  isThinking,
  isProcessing,
  isKnowledgeHit,
  onContentChange,
}: {
  content: string;
  isEditing: boolean;
  isThinking: boolean;
  isProcessing: boolean;
  isKnowledgeHit: boolean;
  onContentChange?: (content: string) => void;
}) {
  return (
    <div className="px-[16px] py-[12px]">
      {isEditing || isProcessing || !isKnowledgeHit ? (
        <SmartReplyReadonlyContent content={content} isThinking={isThinking} isProcessing={isProcessing} isKnowledgeHit={!isKnowledgeHit} />
      ) : (
        <textarea
          className="min-h-[54px] w-full max-h-[110px] resize-none rounded-[6px] bg-surface-muted px-[12px] py-[5px] text-[13px] leading-[22px] text-[#101419] outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
          onChange={(event) => onContentChange(event.target.value)}
          value={content}
        />
    )}
    </div>
  );
}

function SmartReplyReadonlyContent({
  content,
  isThinking,
  isProcessing,
  isKnowledgeHit,
}: {
  content: string;
  isThinking: boolean;
  isProcessing: boolean;
  isKnowledgeHit: boolean;
}) {
  return (
    <div className="rounded-[10px]">
      {isThinking || isProcessing ? 
      <div className="flex items-center gap-1">
        <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} color="#666666"/>
        <p className="text-[#3D3D3D] text-[13px]" role="status">
          {isThinking ? "AI正在生成话术..." : isProcessing ? "正在处理消息..." : "🤔未命中知识集，暂无推荐话术"}
        </p>
      </div> : null}
      {isKnowledgeHit ? null : <div className="flex items-center">
        <p className="text-[#3D3D3D] text-[13px]">🤔未命中知识集，暂无推荐话术</p>
        <span className="text-[#267FF0] text-[13px] ml-[10px] cursor-pointer">重试</span>
      </div>}
    </div>
  );
}

function SmartReplyToolbar({
  onMakeShorter,
  onRegenerate,
  versionLabel,
}: {
  onMakeShorter?: () => void;
  onRegenerate?: () => void;
  versionLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-[10px] cursor-pointer">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="智能回复调整"
            className="size-auto p-0 shadow-none hover:bg-transparent"
            type="button"
            variant="ghost"
          >
            <img
              alt=""
              aria-hidden
              className="size-[14px] object-contain"
              src="https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/third/%E5%AE%B9%E5%99%A8@2x%20(2).png!tiny.webp"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[128px]" side="top">
          <DropdownMenuItem onSelect={onMakeShorter}>简短一点</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRegenerate}>重新生成</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator className="h-[12px] bg-[#EEEFF0]" orientation="vertical" />
      <div className="inline-flex items-center gap-1 text-[12px] leading-4 text-muted-foreground">
        <img
          alt=""
          aria-hidden
          className="size-[14px] object-contain"
          src="https://b1.dtminds.com/fe-utility-tools/scrm-mobile/assets/third/容器@2x (3).png!tiny.webp"
        />
        <span>{versionLabel}</span>
      </div>
    </div>
  );
}

function SmartReplyActions({
  content,
  isThinking,
  onEdit,
  onSend,
}: {
  content: string;
  isThinking: boolean;
  onEdit?: () => void;
  onSend?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
        <Button
          className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px]"
          onClick={onEdit}
          type="button"
          variant="outline"
        >
          {/* <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} /> */}
          编辑
        </Button>
        <Button
          className="h-8 gap-1.5 rounded-[8px] px-3 text-[13px]"
          disabled={isThinking || !content.trim()}
          onClick={onSend}
          type="button"
        >
          {/* <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} /> */}
          发送
        </Button>
    </div>
  );
}
function createDemoSuggestion(message: ChatMessage): SmartReplySuggestion {
  const preview =
    message.content.type === "text"
      ? message.content.text.slice(0, 80)
      : "已根据客户消息生成建议回复";

  return {
    assistantName: "护肤小助手",
    content: [
      "111",
      preview ? `参考客户消息：${preview}` : "",
      "建议从肤质与当前季节切入，先确认是否敏感肌，再推荐温和修护类产品",
    ]
      .filter(Boolean)
      .join("\n\n"),
    status: "ready",
    versionCount: 6,
    versionIndex: 0,
  };
}

