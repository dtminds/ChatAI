import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type RangeSelection,
} from "lexical";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WorkflowVariableContentSegment,
  WorkflowVariableDefinition,
} from "../../types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  getVariableContentText,
  normalizeVariableContent,
  truncateVariableContent,
  variableContentEqual,
} from "./content";
import {
  $exportVariableContent,
  $insertVariableContentToken,
  $restoreVariableContent,
} from "./editor-utils";
import { WorkflowVariableNode } from "./variable-node";

export function VariableContentEditor({
  ariaLabel,
  maxLength,
  onChange,
  placeholder,
  segments,
  variables,
}: {
  ariaLabel: string;
  maxLength?: number;
  onChange: (segments: WorkflowVariableContentSegment[]) => void;
  placeholder: string;
  segments: WorkflowVariableContentSegment[];
  variables: WorkflowVariableDefinition[];
}) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const selectionRef = useRef<RangeSelection | null>(null);
  const [open, setOpen] = useState(false);
  const normalizedSegments = useMemo(() => normalizeVariableContent(segments), [segments]);
  const contentLength = getVariableContentText(normalizedSegments, variables).length;
  const editorConfig = useMemo(() => ({
    namespace: `WorkflowVariableContentEditor:${ariaLabel}`,
    nodes: [WorkflowVariableNode],
    onError(error: Error) { throw error; },
    theme: { paragraph: "m-0" },
  }), [ariaLabel]);
  const registerEditor = useCallback((editor: LexicalEditor | null) => {
    editorRef.current = editor;
  }, []);

  function insertVariable(variable: WorkflowVariableDefinition) {
    setOpen(false);
    editorRef.current?.update(() => $insertVariableContentToken(variable, selectionRef.current));
    editorRef.current?.focus();
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className={cn("relative px-3 py-3 text-sm leading-6", maxLength ? "min-h-30" : "min-h-36")}>
        <LexicalComposer initialConfig={editorConfig}>
          <PlainTextPlugin
            contentEditable={<ContentEditable aria-label={ariaLabel} aria-multiline="true" className={cn("whitespace-pre-wrap break-words outline-none", maxLength ? "min-h-24" : "min-h-30")} role="textbox" />}
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={normalizedSegments.length ? null : <span className="pointer-events-none absolute left-3 top-3 text-muted-foreground/50">{placeholder}</span>}
          />
          <VariableContentEditorPlugin
            maxLength={maxLength}
            onChange={onChange}
            registerEditor={registerEditor}
            registerSelection={(selection) => {
              selectionRef.current = selection;
            }}
            segments={normalizedSegments}
            variables={variables}
          />
        </LexicalComposer>
      </div>
      <div className="flex h-8 items-center justify-between px-2">
        <WorkflowVariablePicker
          onOpenChange={setOpen}
          onSelect={insertVariable}
          open={open}
          variables={variables}
        >
          <Button
            className="h-6 gap-1.5 px-2 text-xs"
            onPointerDown={() => {
              editorRef.current?.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) selectionRef.current = selection.clone();
              });
            }}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.8} />
            插入变量
          </Button>
        </WorkflowVariablePicker>
        {maxLength ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {contentLength}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function VariableContentEditorPlugin({
  maxLength,
  onChange,
  registerEditor,
  registerSelection,
  segments,
  variables,
}: {
  maxLength?: number;
  onChange: (segments: WorkflowVariableContentSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  registerSelection: (selection: RangeSelection | null) => void;
  segments: WorkflowVariableContentSegment[];
  variables: WorkflowVariableDefinition[];
}) {
  const [editor] = useLexicalComposerContext();
  const variableDisplayKey = variables.map((variable) => [
    variable.selector.join("."),
    variable.sourceNodeTitle,
    variable.label,
  ].join(":")).join("|");
  const variableDisplayKeyRef = useRef("");
  useEffect(() => {
    registerEditor(editor);
    return () => registerEditor(null);
  }, [editor, registerEditor]);
  useEffect(() => {
    editor.update(() => {
      const current = $exportVariableContent();
      if (
        !variableContentEqual(current, segments)
        || variableDisplayKeyRef.current !== variableDisplayKey
      ) {
        $restoreVariableContent(segments, variables);
      }
      variableDisplayKeyRef.current = variableDisplayKey;
    });
  }, [editor, segments, variableDisplayKey, variables]);

  return (
    <OnChangePlugin
      onChange={() => {
        let content: WorkflowVariableContentSegment[] = [];
        let selection: RangeSelection | null = null;
        editor.getEditorState().read(() => {
          const currentSelection = $getSelection();
          if ($isRangeSelection(currentSelection)) selection = currentSelection.clone();
          content = $exportVariableContent();
        });

        const nextContent = maxLength
          ? truncateVariableContent(content, variables, maxLength)
          : content;
        if (!variableContentEqual(content, nextContent)) {
          editor.update(() => {
            $restoreVariableContent(nextContent, variables);
            editor.getRootElement()?.focus();
          });
        }
        else if (selection) {
          registerSelection(selection);
        }
        onChange(nextContent);
      }}
    />
  );
}
