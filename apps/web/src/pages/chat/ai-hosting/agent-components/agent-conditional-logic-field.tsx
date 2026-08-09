import { useEffect, useMemo, useRef, useState } from "react";
import { AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH } from "@chatai/contracts";
import {
  AiBookIcon,
  ConnectIcon,
  ResourcesAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  HistoryPlugin,
  HistoryResetPlugin,
} from "@/pages/chat/components/lexical-history";
import {
  INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND,
  INSERT_CONDITIONAL_LOGIC_SKILL_COMMAND,
} from "./agent-conditional-logic-lexical-commands";
import {
  KnowledgeBaseChipNode,
  SkillChipNode,
} from "./agent-conditional-logic-lexical-nodes";
import {
  ConditionalLogicResourceTooltipPlugin,
  ConditionalLogicRuntimePlugin,
} from "./agent-conditional-logic-lexical-plugins";
import {
  getConditionalLogicCharacterCount,
  isConditionalLogicEmpty,
  normalizeConditionalLogicSegments,
} from "./agent-conditional-logic-lexical-utils";
import { ConditionalLogicMaxLengthPlugin } from "./agent-conditional-logic-max-length-plugin";
import {
  type ConditionalLogicSegment,
  type KnowledgeBaseOption,
  type SkillOption,
} from "./agent-settings.constants";
import "./agent-conditional-logic.css";

export function AgentConditionalLogicField({
  disabled = false,
  historyKey,
  knowledgeBases,
  onChange,
  segments,
  skills,
}: {
  disabled?: boolean;
  historyKey: string;
  knowledgeBases: KnowledgeBaseOption[];
  onChange: (value: ConditionalLogicSegment[]) => void;
  segments: ConditionalLogicSegment[];
  skills: SkillOption[];
}) {
  const [open, setOpen] = useState(false);
  const editorRef = useRef<LexicalEditor | null>(null);

  const selectableKnowledgeBases = useMemo(
    () => knowledgeBases.filter((resource) => resource.status === "available"),
    [knowledgeBases],
  );
  const selectableSkills = useMemo(
    () => skills.filter((resource) => resource.status === "available"),
    [skills],
  );

  const normalizedSegments = useMemo(
    () => {
      const invalidKnowledgeBases = new Map(
        knowledgeBases
          .filter((resource) => resource.status === "invalid")
          .map((resource) => [resource.id, resource.invalidReason]),
      );
      const invalidSkills = new Map(
        skills
          .filter((resource) => resource.status === "invalid")
          .map((resource) => [resource.id, resource.invalidReason]),
      );

      return normalizeConditionalLogicSegments(segments).map((segment) => {
        if (segment.type === "knowledgeBase") {
          if (!invalidKnowledgeBases.has(segment.id)) {
            return segment;
          }

          return {
            ...segment,
            invalid: true,
            invalidReason: invalidKnowledgeBases.get(segment.id),
          };
        }

        if (segment.type === "skill") {
          if (!invalidSkills.has(segment.id)) {
            return segment;
          }

          return {
            ...segment,
            invalid: true,
            invalidReason: invalidSkills.get(segment.id),
          };
        }

        return segment;
      });
    },
    [knowledgeBases, segments, skills],
  );

  const isEmpty = useMemo(() => isConditionalLogicEmpty(normalizedSegments), [normalizedSegments]);
  const characterCount = useMemo(
    () => getConditionalLogicCharacterCount(normalizedSegments),
    [normalizedSegments],
  );

  const editorConfig = useMemo(
    () => ({
      namespace: "AgentConditionalLogicField",
      nodes: [KnowledgeBaseChipNode, SkillChipNode],
      onError(error: Error) {
        throw error;
      },
      theme: {
        paragraph: "m-0",
      },
    }),
    [],
  );

  function registerEditor(editor: LexicalEditor | null) {
    editorRef.current = editor;
  }

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  function insertKnowledgeBase(knowledgeBase: KnowledgeBaseOption) {
    if (disabled) {
      return;
    }

    editorRef.current?.dispatchCommand(
      INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND,
      {
        id: knowledgeBase.id,
        name: knowledgeBase.name,
      },
    );
    setOpen(false);
    editorRef.current?.focus();
  }

  function insertSkill(skill: SkillOption) {
    if (disabled) {
      return;
    }

    editorRef.current?.dispatchCommand(INSERT_CONDITIONAL_LOGIC_SKILL_COMMAND, {
      id: skill.id,
      name: skill.name,
    });
    setOpen(false);
    editorRef.current?.focus();
  }

  return (
    <div
      aria-label="行为指引"
      className="rounded-[8px] border border-border bg-background px-3 py-2.5"
      role="group"
    >
      <Popover modal={false} onOpenChange={setOpen} open={open}>
        <div className="relative min-h-24 text-sm leading-7 text-foreground">
          <LexicalComposer initialConfig={editorConfig}>
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label="行为指引描述"
                  aria-disabled={disabled}
                  aria-multiline="true"
                  className={cn(
                    "min-h-24 max-h-128 w-full overflow-y-auto whitespace-pre-wrap break-words outline-none",
                    disabled && "cursor-not-allowed opacity-70",
                  )}
                  role="textbox"
                  tabIndex={disabled ? -1 : undefined}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
              placeholder={
                isEmpty ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 text-muted-foreground"
                  >
                    请输入目标、处理逻辑或约束
                  </div>
                ) : null
              }
            />
            <HistoryPlugin />
            <HistoryResetPlugin resetKey={historyKey} />
            <ConditionalLogicRuntimePlugin
              disabled={disabled}
              historyKey={historyKey}
              maxLength={AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH}
              onChange={onChange}
              registerEditor={registerEditor}
              segments={normalizedSegments}
            />
            <ConditionalLogicResourceTooltipPlugin />
            <ConditionalLogicMaxLengthPlugin
              maxLength={AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH}
            />
          </LexicalComposer>
        </div>

        <div className="mt-1 flex h-6 items-center justify-between">
          <PopoverTrigger asChild>
            <Button
              aria-expanded={open}
              aria-label="添加引用资源"
              className="size-6 rounded-[6px] p-0 text-muted-foreground"
              disabled={disabled}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={ResourcesAddIcon} size={14} strokeWidth={1.8} />
            </Button>
          </PopoverTrigger>
          <div className="text-xs leading-5 text-muted-foreground">
            {characterCount}/{AI_HOSTING_AGENT_CONDITION_LOGIC_MAX_LENGTH}
          </div>
        </div>

        <PopoverContent
          align="start"
          className="w-[260px] max-w-[min(260px,calc(100vw-2rem))] overflow-hidden rounded-[8px] p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          sideOffset={8}
        >
          <ScrollArea
            className="w-full min-w-0 max-w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=scroll-area-viewport]>div]:max-w-full"
            type="always"
            viewportProps={{ className: "!h-auto max-h-72" }}
          >
            <div
              aria-label="选择引用资源"
              className="w-full min-w-0 max-w-full"
              role="listbox"
            >
              {selectableSkills.length > 0 ? (
                <ResourceGroup
                  icon={ConnectIcon}
                  items={selectableSkills}
                  onSelect={insertSkill}
                  title="技能"
                />
              ) : null}
              {selectableKnowledgeBases.length > 0 ? (
                <ResourceGroup
                  bordered={selectableSkills.length > 0}
                  icon={AiBookIcon}
                  items={selectableKnowledgeBases}
                  onSelect={insertKnowledgeBase}
                  title="知识库"
                />
              ) : null}
              {selectableSkills.length === 0 &&
              selectableKnowledgeBases.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  请先在资源管理中添加技能或知识库
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ResourceGroup<T extends KnowledgeBaseOption | SkillOption>({
  bordered = false,
  icon,
  items,
  onSelect,
  title,
}: {
  bordered?: boolean;
  icon: typeof ConnectIcon;
  items: readonly T[];
  onSelect: (item: T) => void;
  title: string;
}) {
  return (
    <section className={bordered ? "border-t border-border/70" : undefined}>
      <h3 className="px-3 pb-1 pt-2.5 text-xs font-normal text-muted-foreground/60">
        {title}
      </h3>
      <div className="px-1 pb-1">
        {items.map((item) => (
          <ResourceOptionRow
            icon={icon}
            key={item.id}
            label={item.name}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

function ResourceOptionRow({
  icon,
  label,
  onSelect,
}: {
  icon: typeof ConnectIcon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex w-full min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-[6px] px-2 py-1.5 text-left text-[13px] text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
      onClick={onSelect}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      role="option"
      type="button"
    >
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={icon}
        size={15}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
    </button>
  );
}
