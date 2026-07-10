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
import type {
  WorkflowMessageContentSegment,
  WorkflowVariableDefinition,
} from "../../types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import { messageContentEqual, normalizeMessageContent } from "./content";
import { $exportMessageContent, $insertMessageVariable, $restoreMessageContent } from "./editor-utils";
import { WorkflowVariableNode } from "./variable-node";

export function MessageContentEditor({
  onChange,
  segments,
  variables,
}: {
  onChange: (segments: WorkflowMessageContentSegment[]) => void;
  segments: WorkflowMessageContentSegment[];
  variables: WorkflowVariableDefinition[];
}) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const selectionRef = useRef<RangeSelection | null>(null);
  const [open, setOpen] = useState(false);
  const normalizedSegments = useMemo(() => normalizeMessageContent(segments), [segments]);
  const editorConfig = useMemo(() => ({
    namespace: "WorkflowMessageContentEditor",
    nodes: [WorkflowVariableNode],
    onError(error: Error) { throw error; },
    theme: { paragraph: "m-0" },
  }), []);
  const registerEditor = useCallback((editor: LexicalEditor | null) => {
    editorRef.current = editor;
  }, []);

  function insertVariable(variable: WorkflowVariableDefinition) {
    setOpen(false);
    editorRef.current?.update(() => $insertMessageVariable(variable, selectionRef.current));
    editorRef.current?.focus();
  }

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center border-b px-2 py-1.5">
        <WorkflowVariablePicker
          onOpenChange={setOpen}
          onSelect={insertVariable}
          open={open}
          variables={variables}
        >
          <Button
            className="h-7 gap-1.5 px-2 text-xs"
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
      </div>
      <div className="relative min-h-36 px-3 py-2 text-sm leading-6">
        <LexicalComposer initialConfig={editorConfig}>
          <PlainTextPlugin
            contentEditable={<ContentEditable aria-label="消息内容" aria-multiline="true" className="min-h-32 whitespace-pre-wrap break-words outline-none" role="textbox" />}
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={normalizedSegments.length ? null : <span className="pointer-events-none absolute left-3 top-2 text-muted-foreground">请输入消息内容</span>}
          />
          <MessageEditorPlugin
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
    </div>
  );
}

function MessageEditorPlugin({
  onChange,
  registerEditor,
  registerSelection,
  segments,
  variables,
}: {
  onChange: (segments: WorkflowMessageContentSegment[]) => void;
  registerEditor: (editor: LexicalEditor | null) => void;
  registerSelection: (selection: RangeSelection | null) => void;
  segments: WorkflowMessageContentSegment[];
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
      const current = $exportMessageContent();
      if (
        !messageContentEqual(current, segments)
        || variableDisplayKeyRef.current !== variableDisplayKey
      ) {
        $restoreMessageContent(segments, variables);
      }
      variableDisplayKeyRef.current = variableDisplayKey;
    });
  }, [editor, segments, variableDisplayKey, variables]);

  return (
    <OnChangePlugin
      onChange={() => editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) registerSelection(selection.clone());
        onChange($exportMessageContent());
      })}
    />
  );
}
