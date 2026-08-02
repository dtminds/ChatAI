import { useMemo, useRef, type MutableRefObject } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { AGENT_SKILL_CONTENT_MAX_LENGTH } from "@chatai/contracts";
import type { LexicalEditor } from "lexical";
import { cn } from "@/lib/utils";
import {
  getSkillContentCharacterCount,
  getSkillContentResourceReferenceKey,
  getSkillResourceReferenceKey,
  isSkillContentEmpty,
  normalizeSkillContentSegments,
  toSkillContentResourceSegment,
  type SkillContentSegment,
  type SkillResourceItem,
} from "./ai-skill-resource";
import { SkillResourceChipNode } from "./ai-skill-description-lexical-nodes";
import {
  SkillDescriptionResourceTooltipPlugin,
  SkillDescriptionRuntimePlugin,
} from "./ai-skill-description-lexical-plugins";
import { SkillDescriptionMaxLengthPlugin } from "./ai-skill-description-max-length-plugin";
import { AiSkillReferenceMenu } from "./ai-skill-reference-menu";
import "./agent-module.css";
import "./agent-components/agent-conditional-logic.css";

export function AiSkillDescriptionField({
  disabled = false,
  editorRef,
  knowledgeBases,
  onChange,
  onSelectResource,
  segments,
  tools,
  variables,
}: {
  disabled?: boolean;
  editorRef?: MutableRefObject<LexicalEditor | null>;
  knowledgeBases: readonly SkillResourceItem[];
  onChange: (value: SkillContentSegment[]) => void;
  onSelectResource: (item: SkillResourceItem) => void;
  segments: SkillContentSegment[];
  tools: readonly SkillResourceItem[];
  variables: readonly SkillResourceItem[];
}) {
  const localEditorRef = useRef<LexicalEditor | null>(null);
  const normalizedSegments = useMemo(() => {
    const resourceMap = new Map(
      [...variables, ...tools, ...knowledgeBases].map((resource) => [
        getSkillResourceReferenceKey(resource),
        resource,
      ]),
    );

    return normalizeSkillContentSegments(segments).map((segment) => {
      if (segment.type !== "resource") {
        return segment;
      }

      const resource = resourceMap.get(
        getSkillContentResourceReferenceKey(segment),
      );

      if (!resource) {
        const {
          invalid: _invalid,
          invalidReason: _invalidReason,
          ...baseSegment
        } = segment;
        return baseSegment;
      }

      return toSkillContentResourceSegment(resource);
    });
  }, [knowledgeBases, segments, tools, variables]);
  const isEmpty = useMemo(
    () => isSkillContentEmpty(normalizedSegments),
    [normalizedSegments],
  );
  const characterCount = useMemo(
    () => getSkillContentCharacterCount(normalizedSegments),
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
                aria-disabled={disabled}
                aria-multiline="true"
                className={cn(
                  "min-h-48 max-h-128 w-full overflow-y-auto whitespace-pre-wrap break-words outline-none",
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
                  用自然语言解释说明，该技能的具体情况，让AI按照该技能描述去执行
                </div>
              ) : null
            }
          />
          <SkillDescriptionRuntimePlugin
            disabled={disabled}
            maxLength={AGENT_SKILL_CONTENT_MAX_LENGTH}
            onChange={onChange}
            registerEditor={registerEditor}
            segments={normalizedSegments}
          />
          <SkillDescriptionResourceTooltipPlugin />
          <SkillDescriptionMaxLengthPlugin
            maxLength={AGENT_SKILL_CONTENT_MAX_LENGTH}
          />
        </LexicalComposer>
      </div>
      <div className="mt-1 flex h-6 items-center justify-between">
        <AiSkillReferenceMenu
          disabled={disabled}
          knowledgeBases={knowledgeBases}
          onSelectResource={onSelectResource}
          tools={tools}
          variables={variables}
        />
        <div className="text-xs leading-5 text-muted-foreground">
          {characterCount}/{AGENT_SKILL_CONTENT_MAX_LENGTH}
        </div>
      </div>
    </div>
  );
}
