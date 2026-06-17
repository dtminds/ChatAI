import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Add01Icon, Book04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  mockKnowledgeBaseOptions,
  type ConditionalLogicSegment,
  type KnowledgeBaseOption,
} from "./agent-settings.constants";

export function AgentConditionalLogicField({
  onChange,
  segments,
}: {
  onChange: (value: ConditionalLogicSegment[]) => void;
  segments: ConditionalLogicSegment[];
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

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

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const currentSegments = parseEditorContent(editor);

    if (segmentsEqual(currentSegments, normalizedSegments)) {
      return;
    }

    renderSegmentsToEditor(editor, normalizedSegments);
  }, [normalizedSegments]);

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange();
    }
  }

  function handleInput() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    onChange(parseEditorContent(editor));
  }

  function insertKnowledgeBase(knowledgeBaseId: string) {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const range = getInsertionRange(editor, savedSelectionRef.current);
    const chip = createKnowledgeBaseChipElement(knowledgeBaseId);

    editor.focus();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    range.deleteContents();
    range.insertNode(chip);

    const caretAnchor = document.createTextNode("\u200b");
    chip.after(caretAnchor);

    const caretRange = document.createRange();
    caretRange.setStart(caretAnchor, caretAnchor.length);
    caretRange.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(caretRange);
    savedSelectionRef.current = caretRange.cloneRange();

    handleInput();
    setOpen(false);
    setSearchQuery("");
  }

  return (
    <div
      aria-label="条件逻辑"
      className="rounded-[8px] border border-[#E5E5E5] bg-background px-3 py-2.5"
      role="group"
    >
      <div className="relative min-h-24 text-sm leading-7 text-foreground">
        <span className="absolute left-0 top-0 z-10">
          <Popover
            onOpenChange={(nextOpen) => {
              if (nextOpen) {
                saveSelection();
              }

              setOpen(nextOpen);

              if (!nextOpen) {
                setSearchQuery("");
              }
            }}
            open={open}
          >
            <PopoverTrigger asChild>
              <Button
                aria-label="添加关联知识库"
                className="size-7 rounded-full border border-[#E5E5E5] bg-background text-muted-foreground hover:bg-muted/40"
                onMouseDown={(event) => {
                  event.preventDefault();
                  saveSelection();
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-[280px] p-0">
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
                        onSelect={() => insertKnowledgeBase(knowledgeBase.id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </span>

        {isEmpty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-8 text-muted-foreground"
          >
            请输入条件逻辑描述
          </span>
        ) : null}

        <div
          ref={editorRef}
          aria-label="条件逻辑描述"
          aria-multiline="true"
          className="min-h-24 w-full whitespace-pre-wrap break-words pt-8 outline-none"
          contentEditable
          onInput={handleInput}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}

function KnowledgeBaseTag({ name }: { name: string }) {
  return (
    <span className="mx-px inline-flex h-7 max-w-full items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-background px-1.5 align-middle text-xs text-foreground">
      <HugeiconsIcon
        className="text-muted-foreground"
        icon={Book04Icon}
        size={14}
        strokeWidth={1.8}
      />
      <span>{name}</span>
    </span>
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
      type="button"
    >
      <HugeiconsIcon
        className="text-muted-foreground"
        icon={Book04Icon}
        size={15}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 truncate">{knowledgeBase.name}</span>
    </button>
  );
}

function getInsertionRange(editor: HTMLDivElement, savedRange: Range | null) {
  if (savedRange && editor.contains(savedRange.startContainer)) {
    return savedRange.cloneRange();
  }

  const range = document.createRange();

  if (editor.childNodes.length === 0) {
    range.setStart(editor, 0);
    range.collapse(true);
    return range;
  }

  range.selectNodeContents(editor);
  range.collapse(false);

  return range;
}

function createKnowledgeBaseChipElement(knowledgeBaseId: string) {
  const knowledgeBase = mockKnowledgeBaseOptions.find((option) => option.id === knowledgeBaseId);
  const container = document.createElement("span");
  container.innerHTML = renderToStaticMarkup(
    <KnowledgeBaseTag name={knowledgeBase?.name ?? ""} />,
  );

  const chip = container.firstElementChild;

  if (!(chip instanceof HTMLElement)) {
    throw new Error("Failed to create knowledge base chip element");
  }

  chip.contentEditable = "false";
  chip.dataset.kbId = knowledgeBaseId;

  return chip;
}

function renderSegmentsToEditor(
  editor: HTMLDivElement,
  segments: ConditionalLogicSegment[],
) {
  editor.innerHTML = "";

  for (const segment of segments) {
    if (segment.type === "knowledgeBase") {
      editor.appendChild(createKnowledgeBaseChipElement(segment.id));
      continue;
    }

    if (segment.value.length > 0) {
      editor.appendChild(document.createTextNode(segment.value));
    }
  }
}

function parseEditorContent(root: HTMLElement): ConditionalLogicSegment[] {
  const segments: ConditionalLogicSegment[] = [];

  function appendText(value: string) {
    const normalizedValue = value.replace(/\u200b/g, "");

    if (!normalizedValue) {
      return;
    }

    const lastSegment = segments[segments.length - 1];

    if (lastSegment?.type === "text") {
      lastSegment.value += normalizedValue;
      return;
    }

    segments.push({ type: "text", value: normalizedValue });
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "");
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const knowledgeBaseId = node.dataset.kbId;

    if (knowledgeBaseId) {
      segments.push({ type: "knowledgeBase", id: knowledgeBaseId });
      return;
    }

    if (node.tagName === "BR") {
      return;
    }

    node.childNodes.forEach(walk);
  }

  root.childNodes.forEach(walk);

  return normalizeConditionalLogicSegments(segments);
}

function segmentsEqual(
  left: ConditionalLogicSegment[],
  right: ConditionalLogicSegment[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isConditionalLogicEmpty(segments: ConditionalLogicSegment[]) {
  return !segments.some(
    (segment) =>
      segment.type === "knowledgeBase" ||
      (segment.type === "text" && segment.value.replace(/\u200b/g, "").length > 0),
  );
}

function normalizeConditionalLogicSegments(
  segments: ConditionalLogicSegment[],
): ConditionalLogicSegment[] {
  if (segments.length === 0) {
    return [{ type: "text", value: "" }];
  }

  const merged: ConditionalLogicSegment[] = [];

  for (const segment of segments) {
    if (segment.type === "knowledgeBase") {
      merged.push(segment);
      continue;
    }

    const lastSegment = merged[merged.length - 1];

    if (lastSegment?.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: `${lastSegment.value}${segment.value}`,
      };
      continue;
    }

    merged.push({ type: "text", value: segment.value });
  }

  if (merged.length === 0 || merged[0]?.type !== "text") {
    merged.unshift({ type: "text", value: "" });
  }

  const lastSegment = merged[merged.length - 1];

  if (lastSegment?.type !== "text") {
    merged.push({ type: "text", value: "" });
  }

  return merged;
}
