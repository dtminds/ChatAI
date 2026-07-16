import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NodeSettingsProps } from "../../panels/types";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import {
  getVariableContentPreview,
  normalizeVariableContent,
} from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";

const handoffMessageMaxLength = 100;

export function HandoffConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"handoff">) {
  const variables = getAvailableVariablesForNode(node.id, nodes, edges);

  return (
    <div className="space-y-6">
      <HandoffMessageField
        ariaLabel="给客服的转发提示"
        help="向接管客服说明客户需求和当前背景"
        onChange={(operatorMessage) => {
          const preview = getVariableContentPreview(operatorMessage, variables);
          onNodeChange({
            metric: preview || "待配置客服提示",
            operatorMessage,
            status: preview ? "ready" : "warning",
          });
        }}
        placeholder="用于告诉对应的接待人员，本次转人工的原因或背景"
        required
        segments={node.data.operatorMessage}
        title="给客服的转发提示"
        variables={variables}
      />
      <HandoffMessageField
        ariaLabel="对客话术"
        onChange={(customerMessage) => onNodeChange({ customerMessage })}
        placeholder="转人工的同时自动先发一条消息，用于缓解客户等待焦虑，例如：请稍等.."
        segments={node.data.customerMessage}
        title="对客话术"
        variables={variables}
      />
    </div>
  );
}

function HandoffMessageField({
  ariaLabel,
  help,
  onChange,
  placeholder,
  required = false,
  segments,
  title,
  variables,
}: {
  ariaLabel: string;
  help?: string;
  onChange: Parameters<typeof VariableContentEditor>[0]["onChange"];
  placeholder: string;
  required?: boolean;
  segments: Parameters<typeof VariableContentEditor>[0]["segments"] | undefined;
  title: string;
  variables: Parameters<typeof VariableContentEditor>[0]["variables"];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {help ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`${title}说明`}
                  className="size-5 rounded-full p-0 text-muted-foreground"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={HelpCircleIcon} size={15} strokeWidth={1.8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>{help}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <VariableContentEditor
        ariaLabel={ariaLabel}
        maxLength={handoffMessageMaxLength}
        onChange={onChange}
        placeholder={placeholder}
        segments={normalizeVariableContent(segments)}
        variables={variables}
      />
    </section>
  );
}
