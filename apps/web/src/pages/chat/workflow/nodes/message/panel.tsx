import { FieldGroup } from "../../panels/field-group";
import { SchemaNodeSettingsPanel } from "../../panels/node-settings";
import type { NodeSettingsProps } from "../../panels/types";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import { getMessageContentPreview, normalizeMessageContent } from "./content";
import { MessageContentEditor } from "./editor";

export function MessageConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"message">) {
  const variables = getAvailableVariablesForNode(node.id, nodes, edges);

  return (
    <>
      <SchemaNodeSettingsPanel includeBase edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />
      <FieldGroup title="消息内容">
        <MessageContentEditor
          onChange={(content) => onNodeChange({
            content,
            metric: getMessageContentPreview(content, variables) || "待配置消息内容",
          })}
          segments={normalizeMessageContent(node.data.content)}
          variables={variables}
        />
      </FieldGroup>
    </>
  );
}
