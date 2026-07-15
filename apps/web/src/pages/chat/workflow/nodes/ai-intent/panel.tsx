import { useLayoutEffect, useRef, useState } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@/components/ui/sortable";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  AiIntentNodeData,
  WorkflowIntentOption,
} from "../../types";
import {
  getAvailableIntentInputOutputsForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import {
  AI_INTENT_DESCRIPTION_MAX_LENGTH,
  AI_INTENT_DESCRIPTION_COUNT_THRESHOLD,
  AI_INTENT_MAX_COUNT,
  AI_INTENT_MIN_COUNT,
  AI_INTENT_PROMPT_MAX_LENGTH,
  createWorkflowIntentOption,
  getAiIntentHandleId,
  getAiIntentMetric,
  getAiIntentStatus,
  normalizeAiIntentAdvancedEnabled,
  normalizeAiIntentInputSelector,
  normalizeAiIntentOptions,
  normalizeAiIntentPrompt,
} from "./config";

export function AiIntentConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"ai-intent">) {
  const [inputPickerOpen, setInputPickerOpen] = useState(false);
  const [pendingDeleteIntent, setPendingDeleteIntent] = useState<WorkflowIntentOption | null>(null);
  const advancedEnabled = normalizeAiIntentAdvancedEnabled(node.data.advancedEnabled);
  const intents = normalizeAiIntentOptions(node.data.intents);
  const prompt = normalizeAiIntentPrompt(node.data.prompt);
  const inputSelector = normalizeAiIntentInputSelector(node.data.inputSelector);
  const inputOptions = getAvailableIntentInputOutputsForNode(node.id, nodes, edges);
  const selectedInput = inputSelector
    ? resolveWorkflowVariable(inputOptions, inputSelector)
    : undefined;
  const hasInvalidInput = Boolean(inputSelector && !selectedInput);

  const updateConfig = ({
    advancedEnabled: nextAdvancedEnabled = advancedEnabled,
    inputSelector: nextInputSelector = inputSelector,
    intents: nextIntents = intents,
    prompt: nextPrompt = prompt,
  }: Partial<Pick<AiIntentNodeData, "advancedEnabled" | "inputSelector" | "intents" | "prompt">>) => {
    const nextData = {
      advancedEnabled: nextAdvancedEnabled,
      inputSelector: nextInputSelector,
      intents: nextIntents,
      prompt: nextPrompt,
    };
    onNodeChange({
      ...nextData,
      metric: getAiIntentMetric(nextData),
      status: getAiIntentStatus(nextData),
    });
  };

  const deleteIntent = (intent: WorkflowIntentOption) => {
    updateConfig({ intents: intents.filter((item) => item.id !== intent.id) });
    setPendingDeleteIntent(null);
  };

  const requestDeleteIntent = (intent: WorkflowIntentOption) => {
    const connected = edges.some((edge) =>
      edge.source === node.id && edge.sourceHandle === getAiIntentHandleId(intent.id),
    );
    if (connected) {
      setPendingDeleteIntent(intent);
      return;
    }
    deleteIntent(intent);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">输入</h3>
        <WorkflowVariablePicker
          onOpenChange={setInputPickerOpen}
          onSelect={(variable) => {
            updateConfig({ inputSelector: variable.selector });
            setInputPickerOpen(false);
          }}
          open={inputPickerOpen}
          variables={inputOptions}
        >
          <Button
            aria-label="输入"
            className="h-10 w-full justify-between rounded-[8px] px-3 font-normal"
            type="button"
            variant="outline"
          >
            <span className={selectedInput ? "truncate" : "truncate text-muted-foreground"}>
              {selectedInput
                ? getWorkflowVariableDisplayLabel(selectedInput)
                : hasInvalidInput ? "原节点输出不可用" : "请选择前序节点输出"}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
          </Button>
        </WorkflowVariablePicker>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">意图匹配</h3>
          <Button
            aria-label="添加意图"
            className="size-8 rounded-md"
            disabled={intents.length >= AI_INTENT_MAX_COUNT}
            onClick={() => updateConfig({
              intents: [...intents, createWorkflowIntentOption(intents)],
            })}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="space-y-3 rounded-[8px] border px-2 py-4">
          <Sortable
            flatCursor
            getItemValue={(intent) => intent.id}
            onValueChange={(nextIntents) => updateConfig({ intents: nextIntents })}
            value={intents}
          >
            <SortableContent className="space-y-2">
              {intents.map((intent, index) => (
                <SortableItem key={intent.id} value={intent.id}>
                  <div className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-2">
                    <SortableItemHandle
                      aria-label={`拖动意图 ${index + 1}`}
                      className="mt-2 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={1.8} />
                    </SortableItemHandle>
                    <IntentDescriptionTextarea
                      index={index}
                      intent={intent}
                      onChange={(description) => updateConfig({
                        intents: intents.map((item) => item.id === intent.id
                          ? { ...item, description }
                          : item),
                      })}
                    />
                    <Button
                      aria-label={`删除意图 ${index + 1}`}
                      className="mt-2 size-8 rounded-md text-destructive hover:text-destructive"
                      disabled={intents.length <= AI_INTENT_MIN_COUNT}
                      onClick={() => requestDeleteIntent(intent)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                    </Button>
                  </div>
                </SortableItem>
              ))}
            </SortableContent>
          </Sortable>

          <div className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-2">
            <span />
            <div className="flex h-10 items-center rounded-[8px] bg-secondary px-3 text-sm text-secondary-foreground">
              其他意图
            </div>
            <span />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">高级调教</h3>
          <Switch
            aria-label="高级调教"
            checked={advancedEnabled}
            onCheckedChange={(checked) => updateConfig({ advancedEnabled: checked })}
          />
        </div>
        {advancedEnabled ? (
          <div className="relative">
            <Textarea
              aria-label="提示词"
              className="min-h-40 resize-y pb-8"
              maxLength={AI_INTENT_PROMPT_MAX_LENGTH}
              onChange={(event) => updateConfig({ prompt: event.target.value })}
              placeholder="补充意图判断规则、示例或冲突处理要求"
              value={prompt}
            />
            <span className="pointer-events-none absolute bottom-3 right-3 text-xs text-muted-foreground">
              {prompt.length}/{AI_INTENT_PROMPT_MAX_LENGTH}
            </span>
          </div>
        ) : null}
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIntent(null);
        }}
        open={Boolean(pendingDeleteIntent)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除意图</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该意图对应的下游连线也会被删除
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteIntent) deleteIntent(pendingDeleteIntent);
              }}
              variant="destructive"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntentDescriptionTextarea({
  index,
  intent,
  onChange,
}: {
  index: number;
  intent: WorkflowIntentOption;
  onChange: (description: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const showCount = intent.description.length > AI_INTENT_DESCRIPTION_COUNT_THRESHOLD;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
  }, [intent.description, showCount]);

  return (
    <div className="relative min-w-0">
      <Textarea
        aria-label={`意图 ${index + 1}`}
        className={cn(
          "min-h-10 resize-none overflow-hidden px-3 py-2 leading-5 transition-colors",
          showCount && "pb-6",
        )}
        maxLength={AI_INTENT_DESCRIPTION_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="请输入用户意图的描述，如售后问题等"
        ref={textareaRef}
        rows={1}
        value={intent.description}
      />
      {showCount ? (
        <span className="pointer-events-none absolute bottom-1.5 right-3 text-[11px] text-muted-foreground">
          {intent.description.length}/{AI_INTENT_DESCRIPTION_MAX_LENGTH}
        </span>
      ) : null}
    </div>
  );
}
