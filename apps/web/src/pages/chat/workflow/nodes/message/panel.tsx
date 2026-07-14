import { FieldGroup } from "../../panels/field-group";
import { SchemaNodeSettingsPanel } from "../../panels/node-settings";
import type { NodeSettingsProps } from "../../panels/types";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import { getVariableContentPreview, normalizeVariableContent } from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";

export function MessageConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"message">) {
  const variables = getAvailableVariablesForNode(node.id, nodes, edges);

  return (
    <>
      <SchemaNodeSettingsPanel edges={edges} node={node} nodes={nodes} onNodeChange={onNodeChange} />
      <FieldGroup title="消息内容">
        <VariableContentEditor
          ariaLabel="消息内容"
          onChange={(content) => onNodeChange({
            content,
            metric: getVariableContentPreview(content, variables) || "待配置消息内容",
          })}
          placeholder="请输入消息内容"
          segments={normalizeVariableContent(node.data.content)}
          variables={variables}
        />
      </FieldGroup>
    </>
  );
}
