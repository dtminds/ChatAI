import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
} from "@chatai/contracts";
import { MessageAttachmentPicker } from "@/pages/chat/components/message-content/message-attachment-picker";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeSettingsProps } from "../../panels/types";
import type {
  MessageNodeData,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";
import {
  getAvailableMessageContentOutputsForNode,
  getAvailableVariablesForNode,
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import { getVariableContentPreview, normalizeVariableContent } from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";
import {
  getWorkflowMessageNodeStatus,
  normalizeWorkflowMessageAttachments,
} from "./attachments";
import {
  normalizeWorkflowMessageContentMode,
  normalizeWorkflowMessageOutputSelector,
} from "./content-source";

export function MessageConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"message">) {
  const variables = getAvailableVariablesForNode(node.id, nodes, edges);
  const outputOptions = getAvailableMessageContentOutputsForNode(node.id, nodes, edges);
  const attachments = normalizeWorkflowMessageAttachments(node.data.attachments);
  const contentMode = normalizeWorkflowMessageContentMode(node.data.contentMode);
  const outputSelector = normalizeWorkflowMessageOutputSelector(node.data.outputSelector);

  const updateMessage = ({
    attachments: nextAttachments = attachments,
    content: nextContent = normalizeVariableContent(node.data.content),
    contentMode: nextContentMode = contentMode,
    outputSelector: nextOutputSelector = outputSelector,
  }: {
    attachments?: typeof attachments;
    content?: ReturnType<typeof normalizeVariableContent>;
    contentMode?: MessageNodeData["contentMode"];
    outputSelector?: WorkflowVariableSelector;
  }) => {
    const customPreview = getVariableContentPreview(nextContent, variables);
    const selectedOutput = nextOutputSelector
      ? resolveWorkflowVariable(outputOptions, nextOutputSelector)
      : undefined;
    const contentPreview = nextContentMode === "node-output"
      ? selectedOutput ? getWorkflowVariableDisplayLabel(selectedOutput) : ""
      : customPreview;
    const attachmentMetric = nextAttachments.length > 0
      ? `${nextAttachments.length} 个附件`
      : "";

    onNodeChange({
      attachments: nextAttachments,
      content: nextContent,
      contentMode: nextContentMode,
      metric: contentPreview || attachmentMetric || "待配置消息内容",
      outputSelector: nextOutputSelector,
      status: getWorkflowMessageNodeStatus({
        attachments: nextAttachments,
        hasContent: Boolean(contentPreview),
        requiresContent: nextContentMode === "node-output",
      }),
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">消息内容</h3>
          <SegmentedControl
            aria-label="消息来源"
            onValueChange={(value) => {
              if (value === "custom" || value === "node-output") {
                updateMessage({ contentMode: value });
              }
            }}
            type="single"
            value={contentMode}
          >
            <SegmentedControlItem className="w-auto px-3 text-xs" value="custom">
              自定义消息
            </SegmentedControlItem>
            <SegmentedControlItem className="w-auto px-3 text-xs" value="node-output">
              节点输出
            </SegmentedControlItem>
          </SegmentedControl>
        </div>

        {contentMode === "custom" ? (
          <VariableContentEditor
            ariaLabel="消息内容"
            maxLength={QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH}
            onChange={(content) => updateMessage({ content })}
            placeholder="请输入消息内容"
            segments={normalizeVariableContent(node.data.content)}
            variables={variables}
          />
        ) : (
          <MessageOutputSelect
            onChange={(selector) => updateMessage({ outputSelector: selector })}
            options={outputOptions}
            value={outputSelector}
          />
        )}
      </section>
      <MessageAttachmentPicker
        attachments={attachments}
        imageSource="material-library"
        maxCount={QUICK_REPLY_ATTACHMENT_MAX_COUNT}
        onChange={(nextAttachments) => updateMessage({
          attachments: normalizeWorkflowMessageAttachments(nextAttachments),
        })}
      />
    </div>
  );
}

function MessageOutputSelect({ onChange, options, value }: {
  onChange: (selector: WorkflowVariableSelector) => void;
  options: WorkflowVariableDefinition[];
  value?: WorkflowVariableSelector;
}) {
  const optionByKey = new Map(options.map((option) => [
    getWorkflowVariableSelectorKey(option.selector),
    option,
  ]));
  const selectedKey = value ? getWorkflowVariableSelectorKey(value) : undefined;
  const hasInvalidSelection = Boolean(selectedKey && !optionByKey.has(selectedKey));
  const groups = groupOutputsByNode(options);

  return (
    <Select
      disabled={!groups.length && !hasInvalidSelection}
      onValueChange={(key) => {
        const option = optionByKey.get(key);
        if (option) onChange(option.selector);
      }}
      value={selectedKey}
    >
      <SelectTrigger aria-label="节点输出" className="w-full">
        <SelectValue placeholder={groups.length ? "请选择节点输出" : "暂无可用节点输出"} />
      </SelectTrigger>
      <SelectContent>
        {hasInvalidSelection && selectedKey ? (
          <SelectItem disabled value={selectedKey}>原节点输出不可用</SelectItem>
        ) : null}
        {groups.map((group) => (
          <SelectGroup key={group.sourceNodeId}>
            <SelectLabel className="px-2 text-xs text-muted-foreground">
              {group.sourceNodeTitle}
            </SelectLabel>
            {group.options.map((option) => (
              <SelectItem
                key={getWorkflowVariableSelectorKey(option.selector)}
                value={getWorkflowVariableSelectorKey(option.selector)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function groupOutputsByNode(options: WorkflowVariableDefinition[]) {
  const groups = new Map<string, {
    options: WorkflowVariableDefinition[];
    sourceNodeId: string;
    sourceNodeTitle: string;
  }>();

  options.forEach((option) => {
    if (!option.sourceNodeId || !option.sourceNodeTitle) return;
    const current = groups.get(option.sourceNodeId);
    if (current) {
      current.options.push(option);
      return;
    }
    groups.set(option.sourceNodeId, {
      options: [option],
      sourceNodeId: option.sourceNodeId,
      sourceNodeTitle: option.sourceNodeTitle,
    });
  });

  return [...groups.values()];
}
