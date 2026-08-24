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
  Calendar01Icon,
  Delete01Icon,
  TextIcon,
  TextNumberSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { listCustomFields } from "@/pages/chat/ai-hosting/api/custom-field-service";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import type { WorkflowVariableDefinition } from "../../types";
import { WorkflowLiteralOrVariableInput } from "../../workflow-literal-or-variable-input";
import { getAvailableVariablesForNode } from "../../workflow-variables";
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
  const orderedCustomFields = useMemo(
    () => [
      ...customFields.filter(field => isWorkflowCustomerFieldTypeSupported(field.type)),
      ...customFields.filter(field => !isWorkflowCustomerFieldTypeSupported(field.type)),
    ],
    [customFields],
  );
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
    <WorkflowSettingsSection
      actions={(
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
      )}
      contentClassName="space-y-3"
      title="客户属性"
    >

      {loadError ? (
        <p className="text-xs text-destructive" role="alert">客户属性加载失败</p>
      ) : null}

      {fields.length ? (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <CustomerUpdateFieldRow
              availableVariables={availableVariables}
              customFields={orderedCustomFields}
              field={field}
              fieldSelectionDisabled={loading || loadError}
              fields={fields}
              index={index}
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
    </WorkflowSettingsSection>
  );
}

function CustomerUpdateFieldRow({
  availableVariables,
  customFields,
  field,
  fieldSelectionDisabled,
  fields,
  index,
  onChange,
  onDelete,
}: {
  availableVariables: WorkflowVariableDefinition[];
  customFields: CustomFieldItem[];
  field: WorkflowCustomerUpdateDraftField;
  fieldSelectionDisabled: boolean;
  fields: WorkflowCustomerUpdateDraftField[];
  index: number;
  onChange: (field: WorkflowCustomerUpdateDraftField) => void;
  onDelete: () => void;
}) {
  const selectedIds = new Set(fields.flatMap(item =>
    item.id !== field.id && item.field ? [item.field.id] : []));
  const selectedField = field.field;
  const variables = getCompatibleCustomerUpdateVariables(selectedField, availableVariables);
  const fieldAvailable = selectedField
    ? customFields.some(item => item.id === selectedField.id && item.type === selectedField.type)
    : false;
  const valueTypeIcon = getCustomerFieldTypeIcon(selectedField?.type);

  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-start gap-x-2 gap-y-1.5">
      <Badge
        className="h-6 min-w-6 self-center justify-center rounded-md px-1 text-[10px] text-muted-foreground"
        variant="secondary"
      >
        {index + 1}
      </Badge>

      <Select
        disabled={fieldSelectionDisabled}
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
        <SelectTrigger aria-label="客户属性" className="h-9 w-full min-w-0 text-xs">
          <SelectValue placeholder="选择属性">
            {selectedField ? selectedField.title : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {selectedField && !fieldAvailable ? (
            <SelectItem disabled value={String(selectedField.id)}>
              <CustomerFieldOption title={`${selectedField.title}（不可用）`} type={selectedField.type} />
            </SelectItem>
          ) : null}
          {customFields.map(item => {
            const supported = isWorkflowCustomerFieldTypeSupported(item.type);
            return (
              <SelectItem
                disabled={!supported || selectedIds.has(item.id)}
                key={item.id}
                value={String(item.id)}
              >
                <CustomerFieldOption
                  title={`${item.title}${supported ? "" : "（暂不支持）"}`}
                  type={item.type}
                />
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Button
        aria-label="删除客户属性"
        className="size-8 p-0 text-muted-foreground hover:text-destructive"
        disabled={fields.length <= 1}
        onClick={onDelete}
        size="sm"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.8} />
      </Button>

      <WorkflowLiteralOrVariableInput
        ariaLabel={`${selectedField?.title ?? "客户属性"}的值`}
        className="col-start-2"
        disabled={!selectedField}
        inputMode={selectedField?.type === 11 ? "decimal" : undefined}
        inputType={getLiteralInputType(selectedField)}
        leadingAddon={valueTypeIcon ? (
          <HugeiconsIcon
            aria-hidden="true"
            icon={valueTypeIcon}
            size={14}
            strokeWidth={1.8}
          />
        ) : null}
        literalControl={field.value.kind === "literal" && isDateField(selectedField) ? (
          <DatePicker
            aria-label={`${selectedField.title}的值`}
            className="min-w-0 pr-10 text-xs"
            onValueChange={(value) => onChange({
              ...field,
              value: { kind: "literal", value },
            })}
            placeholder="选择或引用变量"
            value={field.value.value}
          />
        ) : undefined}
        onChange={(value) => onChange({ ...field, value })}
        placeholder={selectedField ? "输入或引用变量" : "请先选择属性"}
        showVariablePicker={Boolean(selectedField)}
        value={field.value}
        variables={variables}
      />
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
  if (field?.type === 5) return "tel";
  if (field?.type === 6) return "email";
  if (field?.type === 11) return "number";
  return "text";
}

function isDateField(field: WorkflowCustomerFieldSnapshot | undefined): field is WorkflowCustomerFieldSnapshot {
  return field?.type === 4 || field?.type === 12;
}

function CustomerFieldOption({ title, type }: { title: string; type: number }) {
  const icon = getCustomerFieldTypeIcon(type);
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon ? (
        <HugeiconsIcon
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
          icon={icon}
          size={14}
          strokeWidth={1.8}
        />
      ) : (
        <span aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{title}</span>
    </span>
  );
}

function getCustomerFieldTypeIcon(type: number | undefined) {
  if (type === 11) return TextNumberSignIcon;
  if (type === 4 || type === 12) return Calendar01Icon;
  if (type === 1 || type === 5 || type === 6) return TextIcon;
  return undefined;
}
