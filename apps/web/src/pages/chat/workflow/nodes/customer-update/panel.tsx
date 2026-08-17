import { useEffect, useMemo, useState } from "react";
import {
  isWorkflowCustomerFieldTypeSupported,
  WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT,
  type CustomFieldItem,
  type WorkflowCustomerFieldSnapshot,
  type WorkflowCustomerUpdateDraftField,
} from "@chatai/contracts";
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  Settings03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { listCustomFields } from "@/pages/chat/ai-hosting/api/custom-field-service";
import type { NodeSettingsProps } from "../../panels/types";
import type { WorkflowVariableDefinition } from "../../types";
import { WorkflowVariablePicker } from "../../workflow-variable-picker";
import {
  getAvailableVariablesForNode,
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import {
  createCustomerUpdateDraftField,
  getCompatibleCustomerUpdateVariables,
  getCustomerUpdateNodePatch,
  normalizeCustomerUpdateFields,
} from "./config";

export function CustomerUpdateConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"customer-update">) {
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const fields = normalizeCustomerUpdateFields(node.data.fields);
  const availableVariables = useMemo(
    () => getAvailableVariablesForNode(node.id, nodes, edges),
    [edges, node.id, nodes],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadFields() {
      setLoading(true);
      setLoadError(false);
      try {
        const response = await listCustomFields({ status: 1 });
        if (!cancelled) setCustomFields(response.fields);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadFields();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateFields = (nextFields: WorkflowCustomerUpdateDraftField[]) => {
    onNodeChange(getCustomerUpdateNodePatch(nextFields));
  };

  return (
    <div className="space-y-3">
      <div className="flex h-5 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">客户属性</h3>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Spinner size={14} />
              正在加载
            </span>
          ) : null}
          <Button
            aria-label="添加客户属性"
            className="size-7 p-0"
            disabled={loading || loadError || fields.length >= WORKFLOW_CUSTOMER_UPDATE_MAX_FIELD_COUNT}
            onClick={() => updateFields([...fields, createCustomerUpdateDraftField(fields)])}
            size="sm"
            title="添加属性"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="text-xs text-destructive" role="alert">客户属性加载失败</p>
      ) : null}

      {fields.length ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_2rem] gap-2 px-0.5 text-xs text-muted-foreground">
            <span>客户属性</span>
            <span>属性值</span>
          </div>
          {fields.map(field => (
            <CustomerUpdateFieldRow
              availableVariables={availableVariables}
              customFields={customFields}
              field={field}
              fields={fields}
              key={field.id}
              onChange={(nextField) => updateFields(fields.map(item =>
                item.id === field.id ? nextField : item))}
              onDelete={() => updateFields(fields.filter(item => item.id !== field.id))}
            />
          ))}
        </div>
      ) : loading ? null : (
        <p className="py-2 text-sm text-muted-foreground">暂无数据</p>
      )}
    </div>
  );
}

function CustomerUpdateFieldRow({
  availableVariables,
  customFields,
  field,
  fields,
  onChange,
  onDelete,
}: {
  availableVariables: WorkflowVariableDefinition[];
  customFields: CustomFieldItem[];
  field: WorkflowCustomerUpdateDraftField;
  fields: WorkflowCustomerUpdateDraftField[];
  onChange: (field: WorkflowCustomerUpdateDraftField) => void;
  onDelete: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedIds = new Set(fields.flatMap(item =>
    item.id !== field.id && item.field ? [item.field.id] : []));
  const selectedField = field.field;
  const variables = getCompatibleCustomerUpdateVariables(selectedField, availableVariables);
  const selectedVariable = field.value.kind === "variable"
    ? resolveWorkflowVariable(variables, field.value.selector)
    : undefined;
  const fieldAvailable = selectedField
    ? customFields.some(item => item.id === selectedField.id && item.type === selectedField.type)
    : false;

  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_2rem] items-start gap-2">
      <Select
        onValueChange={(value) => {
          const next = customFields.find(item => String(item.id) === value);
          if (!next || !isWorkflowCustomerFieldTypeSupported(next.type)) return;
          onChange({
            ...field,
            field: toFieldSnapshot(next),
            value: { kind: "literal", value: "" },
          });
        }}
        value={selectedField ? String(selectedField.id) : ""}
      >
        <SelectTrigger aria-label="客户属性" className="h-9 min-w-0 text-xs">
          <SelectValue placeholder="选择属性">
            {selectedField ? selectedField.title : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {selectedField && !fieldAvailable ? (
            <SelectItem disabled value={String(selectedField.id)}>{selectedField.title}（不可用）</SelectItem>
          ) : null}
          {customFields.map(item => {
            const supported = isWorkflowCustomerFieldTypeSupported(item.type);
            return (
              <SelectItem
                disabled={!supported || selectedIds.has(item.id)}
                key={item.id}
                value={String(item.id)}
              >
                {item.title}{supported ? "" : "（暂不支持）"}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="relative min-w-0">
        <Input
          aria-label={`${selectedField?.title ?? "客户属性"}的值`}
          className="h-9 min-w-0 pl-3 pr-16 text-xs"
          disabled={!selectedField}
          inputMode={selectedField?.type === 11 ? "decimal" : undefined}
          onChange={(event) => onChange({
            ...field,
            value: { kind: "literal", value: event.target.value },
          })}
          placeholder={selectedField ? "输入或引用变量" : "请先选择属性"}
          readOnly={field.value.kind === "variable"}
          type={getLiteralInputType(selectedField)}
          value={field.value.kind === "variable"
            ? selectedVariable ? getWorkflowVariableDisplayLabel(selectedVariable) : "原变量不可用"
            : field.value.value}
        />
        {field.value.kind === "variable" ? (
          <Button
            aria-label="改为固定内容"
            className="absolute right-8 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onChange({ ...field, value: { kind: "literal", value: "" } })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
          </Button>
        ) : null}
        {selectedField ? (
          <WorkflowVariablePicker
            onOpenChange={setPickerOpen}
            onSelect={(variable) => {
              onChange({
                ...field,
                value: {
                  kind: "variable",
                  selector: variable.selector,
                  valueType: variable.valueType,
                },
              });
              setPickerOpen(false);
            }}
            open={pickerOpen}
            variables={variables}
          >
            <Button
              aria-label="引用变量"
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
              size="sm"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Settings03Icon} size={14} strokeWidth={1.8} />
            </Button>
          </WorkflowVariablePicker>
        ) : null}
      </div>

      <Button
        aria-label="删除客户属性"
        className="size-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        size="sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.8} />
      </Button>
    </div>
  );
}

function toFieldSnapshot(field: CustomFieldItem): WorkflowCustomerFieldSnapshot {
  if (!isWorkflowCustomerFieldTypeSupported(field.type)) {
    throw new Error("Unsupported customer field type");
  }
  return {
    id: field.id,
    key: field.key,
    title: field.title,
    type: field.type,
  };
}

function getLiteralInputType(field: WorkflowCustomerFieldSnapshot | undefined) {
  if (field?.type === 4 || field?.type === 12) return "date";
  if (field?.type === 5) return "tel";
  if (field?.type === 6) return "email";
  if (field?.type === 11) return "number";
  return "text";
}
