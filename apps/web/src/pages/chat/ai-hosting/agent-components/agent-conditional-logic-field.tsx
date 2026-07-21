import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Add01Icon, AiBookIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { listKbs } from "../api/kb-service";
import { INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND } from "./agent-conditional-logic-lexical-commands";
import { KnowledgeBaseChipNode } from "./agent-conditional-logic-lexical-nodes";
import { ConditionalLogicRuntimePlugin } from "./agent-conditional-logic-lexical-plugins";
import {
  isConditionalLogicEmpty,
  normalizeConditionalLogicSegments,
} from "./agent-conditional-logic-lexical-utils";
import {
  type ConditionalLogicSegment,
  type KnowledgeBaseOption,
} from "./agent-settings.constants";
import "./agent-conditional-logic.css";

const knowledgeBasePickerPageSize = 200;

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
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [knowledgeBasesLoaded, setKnowledgeBasesLoaded] = useState(false);
  const [knowledgeBasesLoading, setKnowledgeBasesLoading] = useState(false);
  const editorRef = useRef<LexicalEditor | null>(null);
  const isMountedRef = useRef(false);

  const normalizedSegments = useMemo(
    () => normalizeConditionalLogicSegments(segments),
    [segments],
  );

  const isEmpty = useMemo(() => isConditionalLogicEmpty(normalizedSegments), [normalizedSegments]);

  const filteredKnowledgeBases = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return knowledgeBases;
    }

    return knowledgeBases.filter((knowledgeBase) =>
      knowledgeBase.name.toLowerCase().includes(normalizedQuery),
    );
  }, [knowledgeBases, searchQuery]);

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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    setKnowledgeBasesLoading(true);

    try {
      const response = await listKbs({
        page: 1,
        pageSize: knowledgeBasePickerPageSize,
      });

      if (!isMountedRef.current) {
        return;
      }

      setKnowledgeBases(
        response.kbs.map((knowledgeBase) => ({
          id: knowledgeBase.kbId,
          name: knowledgeBase.name,
        })),
      );
      setKnowledgeBasesLoaded(true);
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      setOpen(false);
      toast.error("知识库加载失败，请稍后重试");
    } finally {
      if (isMountedRef.current) {
        setKnowledgeBasesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || knowledgeBasesLoaded || knowledgeBasesLoading) {
      return;
    }

    void loadKnowledgeBases();
  }, [
    knowledgeBasesLoaded,
    knowledgeBasesLoading,
    loadKnowledgeBases,
    open,
  ]);

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
        <Popover
          modal={false}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
              setSearchQuery("");
            }
          }}
          open={open}
        >
          <PopoverTrigger asChild>
            <Button
              aria-expanded={open}
              aria-label="添加关联知识库"
              className="absolute left-0 top-0 z-10 size-7 rounded-full border border-border bg-background text-muted-foreground hover:bg-muted/40"
              disabled={disabled}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-[280px] max-w-[280px] overflow-hidden rounded-[8px] p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
            sideOffset={8}
          >
            <div aria-label="选择知识库" className="min-w-0 max-w-full" role="listbox">
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
                    placeholder="搜索"
                    value={searchQuery}
                  />
                </div>
              </div>

              <ScrollArea className="max-h-72 w-full min-w-0 max-w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=scroll-area-viewport]>div]:max-w-full">
                <div className="w-full min-w-0 max-w-full p-1">
                  {knowledgeBasesLoading ? (
                    <div
                      aria-label="正在加载"
                      className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
                      role="status"
                    >
                      <Spinner aria-hidden="true" size={14} />
                      <span>正在加载</span>
                    </div>
                  ) : filteredKnowledgeBases.length === 0 ? (
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
          </PopoverContent>
        </Popover>

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
        "flex w-full min-w-0 max-w-full cursor-pointer items-center gap-2 overflow-hidden rounded-[8px] px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/40",
      )}
      onClick={onSelect}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      role="option"
      type="button"
    >
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={AiBookIcon}
        size={15}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 truncate" title={knowledgeBase.name}>
        {knowledgeBase.name}
      </span>
    </button>
  );
}
