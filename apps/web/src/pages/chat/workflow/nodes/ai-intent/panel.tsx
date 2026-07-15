import { useState } from "react";
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
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@/components/ui/sortable";
import { Textarea } from "@/components/ui/textarea";
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
  AI_INTENT_MAX_COUNT,
  AI_INTENT_MIN_COUNT,
  AI_INTENT_PROMPT_MAX_LENGTH,
  createWorkflowIntentOption,
  getAiIntentHandleId,
  getAiIntentMetric,
  getAiIntentStatus,
  normalizeAiIntentInputSelector,
  normalizeAiIntentMode,
  normalizeAiIntentOptions,
  normalizeAiIntentPrompt,
} from "./config";

export function AiIntentConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"ai-intent">) {
  const [inputPickerOpen, setInputPickerOpen] = useState(false);
  const [pendingDeleteIntent, setPendingDeleteIntent] = useState<WorkflowIntentOption | null>(null);
  const mode = normalizeAiIntentMode(node.data.mode);
  const intents = normalizeAiIntentOptions(node.data.intents);
  const prompt = normalizeAiIntentPrompt(node.data.prompt);
  const inputSelector = normalizeAiIntentInputSelector(node.data.inputSelector);
  const inputOptions = getAvailableIntentInputOutputsForNode(node.id, nodes, edges);
  const selectedInput = inputSelector
    ? resolveWorkflowVariable(inputOptions, inputSelector)
    : undefined;
  const hasInvalidInput = Boolean(inputSelector && !selectedInput);

  const updateConfig = ({
    inputSelector: nextInputSelector = inputSelector,
    intents: nextIntents = intents,
    mode: nextMode = mode,
    prompt: nextPrompt = prompt,
  }: Partial<Pick<AiIntentNodeData, "inputSelector" | "intents" | "mode" | "prompt">>) => {
    const nextData = {
      inputSelector: nextInputSelector,
      intents: nextIntents,
      mode: nextMode,
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
      <SegmentedControl
        aria-label="意图识别模式"
        className="grid h-10 w-full grid-cols-2 rounded-lg p-1"
        onValueChange={(value) => {
          if (value === "quick" || value === "advanced") updateConfig({ mode: value });
        }}
        type="single"
        value={mode}
      >
        <SegmentedControlItem
          className="h-8 w-full rounded-md px-3 text-sm font-medium"
          value="quick"
        >
          极速模式
        </SegmentedControlItem>
        <SegmentedControlItem
          className="h-8 w-full rounded-md px-3 text-sm font-medium"
          value="advanced"
        >
          完整模式
        </SegmentedControlItem>
      </SegmentedControl>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">识别内容</h3>
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
            aria-label="识别内容"
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
                  <div className="relative min-w-0">
                    <Textarea
                      aria-label={`意图 ${index + 1}`}
                      className="min-h-20 resize-none pb-7"
                      maxLength={AI_INTENT_DESCRIPTION_MAX_LENGTH}
                      onChange={(event) => updateConfig({
                        intents: intents.map((item) => item.id === intent.id
                          ? { ...item, description: event.target.value }
                          : item),
                      })}
                      placeholder="请输入用户意图的描述，如售后问题等"
                      value={intent.description}
                    />
                    <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">
                      {intent.description.length}/{AI_INTENT_DESCRIPTION_MAX_LENGTH}
                    </span>
                  </div>
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
      </section>

      {mode === "advanced" ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">提示词</h3>
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
        </section>
      ) : null}

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
