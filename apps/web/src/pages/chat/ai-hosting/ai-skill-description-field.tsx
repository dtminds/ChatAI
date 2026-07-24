import { useMemo, useRef, type MutableRefObject } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import type { LexicalEditor } from "lexical";
import { cn } from "@/lib/utils";
import {
  isSkillContentEmpty,
  normalizeSkillContentSegments,
  type SkillContentSegment,
} from "./ai-skill-resource";
import { SkillResourceChipNode } from "./ai-skill-description-lexical-nodes";
import { SkillDescriptionRuntimePlugin } from "./ai-skill-description-lexical-plugins";
import "./ai-skill-description.css";

export function AiSkillDescriptionField({
  editorRef,
  onChange,
  segments,
}: {
  editorRef?: MutableRefObject<LexicalEditor | null>;
  onChange: (value: SkillContentSegment[]) => void;
  segments: SkillContentSegment[];
}) {
  const localEditorRef = useRef<LexicalEditor | null>(null);
  const normalizedSegments = useMemo(
    () => normalizeSkillContentSegments(segments),
    [segments],
  );
  const isEmpty = useMemo(
    () => isSkillContentEmpty(normalizedSegments),
    [normalizedSegments],
  );

  const editorConfig = useMemo(
    () => ({
      namespace: "AiSkillDescriptionField",
      nodes: [SkillResourceChipNode],
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
    localEditorRef.current = editor;
    if (editorRef) {
      editorRef.current = editor;
    }
  }

  return (
    <div
      aria-labelledby="skill-description-title"
      className="rounded-[10px] border border-border bg-background px-3 py-2.5"
      role="group"
    >
      <div className="relative min-h-48 text-sm leading-7 text-foreground">
        <LexicalComposer initialConfig={editorConfig}>
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="技能描述"
                aria-multiline="true"
                className={cn(
                  "min-h-48 w-full whitespace-pre-wrap break-words outline-none",
                )}
                role="textbox"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={
              isEmpty ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 text-muted-foreground"
                >
                  用自然语言解释说明，该技能的具体情况，让AI按照该技能描述去执行
                </div>
              ) : null
            }
          />
          <SkillDescriptionRuntimePlugin
            onChange={onChange}
            registerEditor={registerEditor}
            segments={normalizedSegments}
          />
        </LexicalComposer>
      </div>
    </div>
  );
}
