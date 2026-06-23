import { useEffect, useMemo, useRef, useState } from "react";
import { Add01Icon, AiBookIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND } from "./agent-conditional-logic-lexical-commands";
import { KnowledgeBaseChipNode } from "./agent-conditional-logic-lexical-nodes";
import { ConditionalLogicRuntimePlugin } from "./agent-conditional-logic-lexical-plugins";
import {
  isConditionalLogicEmpty,
  normalizeConditionalLogicSegments,
} from "./agent-conditional-logic-lexical-utils";
import {
  mockKnowledgeBaseOptions,
  type ConditionalLogicSegment,
  type KnowledgeBaseOption,
} from "./agent-settings.constants";
import "./agent-conditional-logic.css";

export function AgentConditionalLogicField({
  disabled = false,
  onChange,
  segments,
}: {
  disabled?: boolean;
  onChange: (value: ConditionalLogicSegment[]) => void;
  segments: ConditionalLogicSegment[];
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const editorRef = useRef<LexicalEditor | null>(null);

  const normalizedSegments = useMemo(
    () => normalizeConditionalLogicSegments(segments),
    [segments],
  );

  const isEmpty = useMemo(() => isConditionalLogicEmpty(normalizedSegments), [normalizedSegments]);

  const filteredKnowledgeBases = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return mockKnowledgeBaseOptions;
    }

    return mockKnowledgeBaseOptions.filter((knowledgeBase) =>
      knowledgeBase.name.toLowerCase().includes(normalizedQuery),
    );
  }, [searchQuery]);

  const editorConfig = useMemo(
    () => ({
      namespace: "AgentConditionalLogicField",
      nodes: [KnowledgeBaseChipNode],
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
    setSearchQuery("");
    editorRef.current?.focus();
  }

  return (
    <div
      aria-label="条件逻辑"
      className="rounded-[8px] border border-border bg-background px-3 py-2.5"
      role="group"
    >
      <div className="relative min-h-24 text-sm leading-7 text-foreground">
        <span className="absolute left-0 top-0 z-10">
          <Button
            aria-expanded={open}
            aria-label="添加关联知识库"
            className="size-7 rounded-full border border-border bg-background text-muted-foreground hover:bg-muted/40"
            disabled={disabled}
            onClick={() => setOpen((currentOpen) => !currentOpen)}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
          </Button>
        </span>

        {open ? (
          <div
            aria-label="选择知识库"
            className="absolute left-0 top-8 z-30 w-[280px] rounded-[8px] border border-border bg-popover p-0 shadow-[0_10px_28px_var(--shadow-soft)]"
            role="listbox"
          >
            <div className="border-b border-border p-2">
              <div className="relative">
                <HugeiconsIcon
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  icon={Search01Icon}
                  size={15}
                  strokeWidth={1.8}
                />
                <Input
                  aria-label="搜索知识库"
                  className="h-9 rounded-[8px] pl-8"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      setSearchQuery("");
                      editorRef.current?.focus();
                    }
                  }}
                  placeholder="搜索"
                  value={searchQuery}
                />
              </div>
            </div>

            <ScrollArea className="max-h-56">
              <div className="p-1">
                {filteredKnowledgeBases.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    未找到匹配知识库
                  </p>
                ) : (
                  filteredKnowledgeBases.map((knowledgeBase) => (
                    <KnowledgeBaseOptionRow
                      key={knowledgeBase.id}
                      knowledgeBase={knowledgeBase}
                      onSelect={() => insertKnowledgeBase(knowledgeBase)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ) : null}

        <LexicalComposer initialConfig={editorConfig}>
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="条件逻辑描述"
                aria-disabled={disabled}
                aria-multiline="true"
                className={cn(
                  "min-h-24 w-full whitespace-pre-wrap break-words pt-8 outline-none",
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
                  className="pointer-events-none absolute left-0 top-8 text-muted-foreground"
                >
                  请输入条件逻辑描述
                </div>
              ) : null
            }
          />
          <ConditionalLogicRuntimePlugin
            disabled={disabled}
            onChange={onChange}
            registerEditor={registerEditor}
            segments={normalizedSegments}
          />
        </LexicalComposer>
      </div>
    </div>
  );
}

function KnowledgeBaseOptionRow({
  knowledgeBase,
  onSelect,
}: {
  knowledgeBase: KnowledgeBaseOption;
  onSelect: () => void;
}) {
  return (
    <button
      aria-label={knowledgeBase.name}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/40",
      )}
      onClick={onSelect}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      role="option"
      type="button"
    >
      <HugeiconsIcon
        className="text-muted-foreground"
        icon={AiBookIcon}
        size={15}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 truncate">{knowledgeBase.name}</span>
    </button>
  );
}
