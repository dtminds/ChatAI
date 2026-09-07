import { useMemo, useState, type ReactElement } from "react";
import {
  WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH,
  type WorkflowSmartsheetFieldMapping,
} from "@chatai/contracts";
import { ArrowDown01Icon, Calendar03Icon, FileSpreadsheetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { parseLocalDateTime } from "@/lib/local-date-time";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import {
  WorkflowLiteralOrVariableInput,
  type WorkflowLiteralOrVariableValue,
} from "../../workflow-literal-or-variable-input";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import {
  getCompatibleSmartsheetVariables,
  getSmartsheetWriteNodePatch,
  normalizeSmartsheetFieldMappings,
  normalizeSmartsheetSchema,
  normalizeSmartsheetWebhookUrl,
  normalizeSmartsheetTableUrl,
  isValidSmartsheetTableUrl,
  type SmartsheetSourceConfig,
} from "./config";
import { SmartsheetSourceDialog } from "./source-dialog";

export function SmartsheetWriteConfig({
  edges,
  node,
  nodes,
  onNodeChange,
  resources,
}: NodeSettingsProps<"smartsheet-write">) {
  const webhookUrl = normalizeSmartsheetWebhookUrl(node.data.webhookUrl);
  const schema = normalizeSmartsheetSchema(node.data.schema);
  const tableUrl = normalizeSmartsheetTableUrl(node.data.tableUrl);
  const fieldMappings = normalizeSmartsheetFieldMappings(node.data.fieldMappings);
  const [configuringNodeId, setConfiguringNodeId] = useState<string | null>(null);

  const availableVariables = useMemo(
    () => getAvailableVariablesForNode(
      node.id,
      nodes,
      edges,
      resources?.customFields?.fields,
    ),
    [edges, node.id, nodes, resources?.customFields?.fields],
  );

  const updateConfig = (
    patch: Partial<SmartsheetSourceConfig>,
  ) => {
    onNodeChange(getSmartsheetWriteNodePatch({
      webhookUrl: patch.webhookUrl ?? webhookUrl,
      tableUrl: patch.tableUrl ?? tableUrl,
      schema: patch.schema ?? schema,
      fieldMappings: patch.fieldMappings ?? fieldMappings,
    }));
  };

  const handleFieldValueChange = (index: number, value: WorkflowLiteralOrVariableValue) => {
    const newMappings = [...fieldMappings];
    newMappings[index] = {
      ...newMappings[index],
      value: toSmartsheetFieldValue(value),
    };
    updateConfig({ fieldMappings: newMappings });
  };

  return (
    <>
      <WorkflowSettingsSection title="选择智能表格" contentClassName="text-[13px]">
        {fieldMappings.length > 0 ? (
          <div className="min-w-0 rounded-lg border p-3 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
                <HugeiconsIcon icon={FileSpreadsheetIcon} size={16} aria-hidden="true" />
                智能表格
              </span>
              <Button aria-haspopup="dialog" onClick={() => setConfiguringNodeId(node.id)} type="button" variant="ghost" size="sm">编辑</Button>
            </div>
            <dl className="mt-2 space-y-2">
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">智能表格URL</dt>
                <dd className="min-w-0">
                  {isValidSmartsheetTableUrl(tableUrl) ? (
                    <Button asChild variant="link" size="sm" className="h-auto p-0 text-[13px]">
                      <a href={tableUrl} target="_blank" rel="noopener noreferrer">点此查看</a>
                    </Button>
                  ) : "未填写"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">Webhook 地址</dt>
                <dd className="min-w-0 break-all">{webhookUrl || "未填写"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <Button aria-haspopup="dialog" onClick={() => setConfiguringNodeId(node.id)} type="button" variant="outline" className="w-full">配置智能表格</Button>
        )}
      </WorkflowSettingsSection>

      {configuringNodeId === node.id ? (
        <SmartsheetSourceDialog
          key={node.id}
          value={{ webhookUrl, tableUrl, schema, fieldMappings }}
          onClose={() => setConfiguringNodeId(null)}
          onConfirm={config => {
            updateConfig(config);
            setConfiguringNodeId(null);
          }}
        />
      ) : null}

      {fieldMappings.length > 0 ? (
        <WorkflowSettingsSection title="字段映射">
          <div className="space-y-2.5">
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2 px-0.5 text-xs text-muted-foreground">
              <span>字段名</span>
              <span>字段值</span>
            </div>
            {fieldMappings.map((mapping, index) => (
              <SmartsheetFieldRow
                availableVariables={availableVariables}
                key={mapping.fieldId}
                mapping={mapping}
                onValueChange={(value) => handleFieldValueChange(index, value)}
              />
            ))}
          </div>
        </WorkflowSettingsSection>
      ) : null}
    </>
  );
}

function SmartsheetFieldRow({
  availableVariables,
  mapping,
  onValueChange,
}: {
  availableVariables: ReturnType<typeof getAvailableVariablesForNode>;
  mapping: WorkflowSmartsheetFieldMapping;
  onValueChange: (value: WorkflowLiteralOrVariableValue) => void;
}) {
  const variables = getCompatibleSmartsheetVariables(mapping.fieldType, availableVariables);
  const inputValue = toInputValue(mapping);
  const selectOptions = getSelectOptions(mapping);
  const pickerOnly = mapping.fieldType === "image"
    || mapping.fieldType === "date_time"
    || selectOptions.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] items-start gap-2">
      <Input
        aria-label={`${mapping.fieldTitle}字段名`}
        className="h-9 min-w-0 px-3 text-xs"
        readOnly
        value={mapping.fieldTitle}
      />
      <WorkflowLiteralOrVariableInput
        ariaLabel={`${mapping.fieldTitle}的值`}
        clearVariableAriaLabel="改为固定内容"
        customFieldVisibility="compatible"
        inputMode={mapping.fieldType === "number" ? "decimal" : undefined}
        inputType={mapping.fieldType === "number" ? "number" : "text"}
        maxLength={WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH}
        literalDisplayValue={getLiteralDisplayValue(mapping)}
        literalTriggerAriaLabel={getLiteralTriggerAriaLabel(mapping, selectOptions)}
        placeholder={getFieldPlaceholder(mapping.fieldType)}
        readOnlyLiteral={pickerOnly}
        trailingAction={getTrailingIcon(mapping.fieldType, selectOptions.length > 0)}
        value={inputValue}
        wrapLiteral={getLiteralWrapper(mapping, selectOptions, onValueChange)}
        onChange={onValueChange}
        variables={variables}
      />
    </div>
  );
}

function getTrailingIcon(
  fieldType: WorkflowSmartsheetFieldMapping["fieldType"],
  hasSelectOptions: boolean,
) {
  if (fieldType === "date_time") {
    return <HugeiconsIcon aria-hidden="true" icon={Calendar03Icon} size={14} strokeWidth={1.8} />;
  }
  if (hasSelectOptions) {
    return <HugeiconsIcon aria-hidden="true" icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />;
  }
  return undefined;
}

function getLiteralTriggerAriaLabel(
  mapping: WorkflowSmartsheetFieldMapping,
  selectOptions: string[],
) {
  if (mapping.fieldType === "date_time") return `选择${mapping.fieldTitle}日期`;
  if (selectOptions.length > 0) return `选择${mapping.fieldTitle}选项`;
  return undefined;
}

function getLiteralWrapper(
  mapping: WorkflowSmartsheetFieldMapping,
  selectOptions: string[],
  onValueChange: (value: WorkflowLiteralOrVariableValue) => void,
) {
  if (mapping.fieldType === "date_time") {
    const literalValue = mapping.value.kind === "literal" ? mapping.value.value : "";
    return (trigger: ReactElement) => (
      <DateTimePicker
        aria-label={mapping.fieldTitle}
        onValueChange={(value) => onValueChange({ kind: "literal", value })}
        value={literalValue}
      >
        {trigger}
      </DateTimePicker>
    );
  }
  if (selectOptions.length === 0) return undefined;
  return (trigger: ReactElement) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {selectOptions.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => onValueChange({ kind: "literal", value: option })}
          >
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function toSmartsheetFieldValue(
  value: WorkflowLiteralOrVariableValue,
): WorkflowSmartsheetFieldMapping["value"] {
  if (value.kind === "literal") return { ...value, value: value.value.slice(0, WORKFLOW_SMARTSHEET_WRITE_VALUE_MAX_LENGTH) };
  const kind = value.valueType.kind;
  return {
    kind: "variable",
    selector: value.selector,
    valueType: kind === "boolean" || kind === "datetime" || kind === "number" || kind === "string"
      ? { kind }
      : { kind: "string" },
  };
}

function toInputValue(
  mapping: WorkflowSmartsheetFieldMapping,
): WorkflowLiteralOrVariableValue {
  if (mapping.value.kind === "literal") {
    return { kind: "literal", value: mapping.value.value };
  }
  return {
    kind: "variable",
    selector: mapping.value.selector,
    valueType: mapping.value.valueType,
  };
}

function getSelectOptions(mapping: WorkflowSmartsheetFieldMapping) {
  if (mapping.fieldType === "checkbox") return ["true", "false"];
  if (mapping.fieldType === "single_select") return mapping.enumOptions ?? [];
  return [];
}

function getLiteralDisplayValue(mapping: WorkflowSmartsheetFieldMapping) {
  if (mapping.value.kind !== "literal") return undefined;
  if (mapping.fieldType === "image") return "";
  if (mapping.fieldType === "date_time") return formatDateTimeDisplay(mapping.value.value);
  return undefined;
}

function formatDateTimeDisplay(value: string) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return "";
  const year = parsed.date.getFullYear();
  const month = String(parsed.date.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} ${parsed.time}`;
}

function getFieldPlaceholder(fieldType: WorkflowSmartsheetFieldMapping["fieldType"]) {
  if (fieldType === "number") return "输入数字或引用变量";
  if (fieldType === "date_time") return "选择日期或引用变量";
  if (fieldType === "single_select" || fieldType === "checkbox") return "选择选项或引用变量";
  if (fieldType === "image") return "引用变量";
  return "输入或引用变量";
}
