import { useState } from "react";
import {
  WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT,
  WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH,
  WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH,
  WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH,
  isValidSmartsheetWebhookUrl,
  type WorkflowSmartsheetFieldType,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSmartsheetFieldOptions,
  isValidSmartsheetTableUrl,
  type SmartsheetSourceConfig,
} from "./config";

const fieldTypeLabels: Record<WorkflowSmartsheetFieldType, string> = {
  text: "文本",
  number: "数字",
  currency: "货币",
  date_time: "日期时间",
  single_select: "单选",
  checkbox: "复选框",
  url: "链接",
};

export function SmartsheetSourceDialog({
  value,
  onConfirm,
  onClose,
}: {
  value: SmartsheetSourceConfig;
  onConfirm: (value: SmartsheetSourceConfig) => void;
  onClose: () => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState(value.webhookUrl);
  const [tableUrl, setTableUrl] = useState(value.tableUrl ?? "");
  const [schema, setSchema] = useState(value.schema);
  const [options, setOptions] = useState(() => getSmartsheetFieldOptions(value.schema, value.fieldMappings));
  const [selectedIds, setSelectedIds] = useState(() => value.fieldMappings.map(field => field.fieldId));
  const [editingSchema, setEditingSchema] = useState(() => !getSmartsheetFieldOptions(value.schema));
  const [schemaBeforeEditing, setSchemaBeforeEditing] = useState(value.schema);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const selectedOptions = (options ?? []).filter(option => option.mapping && selectedIds.includes(option.fieldId));
  const tableUrlValid = !tableUrl.trim() || isValidSmartsheetTableUrl(tableUrl.trim());
  const webhookValid = isValidSmartsheetWebhookUrl(webhookUrl);
  const canReturnToFieldSelection = options !== null;
  const canConfirm = !editingSchema && webhookValid && tableUrlValid
    && selectedOptions.length > 0 && selectedOptions.length <= WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT;
  const optionById = new Map((options ?? []).map(option => [option.fieldId, option]));
  const removedFields = value.fieldMappings.filter(field => !optionById.get(field.fieldId)?.mapping);
  const changedFields = value.fieldMappings.filter(field => {
    const next = optionById.get(field.fieldId)?.mapping;
    return next && next.fieldType !== field.fieldType;
  });

  function parseSchema() {
    const nextOptions = getSmartsheetFieldOptions(schema, value.fieldMappings);
    if (!nextOptions) {
      setSchemaError("Schema 格式不正确");
      return;
    }
    setOptions(nextOptions);
    setSelectedIds(selectedIds.filter(id => nextOptions.some(option => option.fieldId === id && option.mapping)));
    setSchemaBeforeEditing(schema);
    setSchemaError(null);
    setEditingSchema(false);
  }

  function startSchemaEditing() {
    setSchemaBeforeEditing(schema);
    setSchemaError(null);
    setEditingSchema(true);
  }

  function cancelSchemaEditing() {
    setSchema(schemaBeforeEditing);
    setSchemaError(null);
    setEditingSchema(false);
  }

  function toggleField(fieldId: string, checked: boolean) {
    if (!checked) {
      setSelectedIds(ids => ids.filter(id => id !== fieldId));
    } else if (selectedOptions.length < WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT) {
      setSelectedIds(ids => [...ids, fieldId]);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(640px,calc(100vw-2rem))] max-w-[640px] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 px-6 py-4">
          <DialogTitle className="text-base">配置智能表格</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="shrink-0" htmlFor="smartsheet-table-url">智能表格URL</Label>
              <p id="smartsheet-table-url-hint" className="text-right text-xs text-muted-foreground">建议填写，方便打开表格查看</p>
            </div>
            <Input
              id="smartsheet-table-url"
              aria-describedby="smartsheet-table-url-hint"
              aria-invalid={!tableUrlValid || undefined}
              maxLength={WORKFLOW_SMARTSHEET_WRITE_TABLE_URL_MAX_LENGTH}
              value={tableUrl}
              onChange={event => setTableUrl(event.target.value)}
              placeholder="选填"
            />
            {!tableUrlValid ? <p className="text-xs text-destructive">请输入有效的 http 或 https 地址</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="smartsheet-webhook-url">Webhook 地址</Label>
            <Input
              id="smartsheet-webhook-url"
              aria-invalid={Boolean(webhookUrl.trim()) && !webhookValid || undefined}
              maxLength={WORKFLOW_SMARTSHEET_WRITE_WEBHOOK_URL_MAX_LENGTH}
              value={webhookUrl}
              onChange={event => setWebhookUrl(event.target.value)}
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=..."
            />
            {webhookUrl.trim() && !webhookValid ? (
              <p className="text-xs text-destructive">Webhook 地址格式不正确</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              {!editingSchema ? (
                <>
                  <span className="text-sm font-medium">字段选择</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={startSchemaEditing}
                  >
                    同步字段
                  </Button>
                </>
              ) : null}
            </div>
            {editingSchema ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="smartsheet-schema">示例数据</Label>
                  <Textarea
                    id="smartsheet-schema"
                    aria-invalid={Boolean(schemaError) || undefined}
                    maxLength={WORKFLOW_SMARTSHEET_WRITE_SCHEMA_MAX_LENGTH}
                    value={schema}
                    onChange={event => {
                      setSchemaError(null);
                      setSchema(event.target.value);
                    }}
                    placeholder='{"schema": {"f04Gwj": {"title": "姓名", "type": "text"}}}'
                    rows={6}
                    className="font-mono text-xs"
                  />
                  {schemaError ? <p className="text-xs text-destructive">{schemaError}</p> : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {removedFields.length > 0 ? (
                  <p role="status" className="break-words text-xs text-muted-foreground">
                    已移除失效字段：{removedFields.map(field => field.fieldTitle).join("、")}
                  </p>
                ) : null}
                {changedFields.length > 0 ? (
                  <p role="status" className="break-words text-xs text-muted-foreground">
                    字段类型已变化，确认后需重新配置：{changedFields.map(field => field.fieldTitle).join("、")}
                  </p>
                ) : null}
                <div className="max-h-72 min-h-32 overflow-y-auto divide-y divide-border">
                  {(options ?? []).map(option => {
                    const checked = Boolean(option.mapping) && selectedIds.includes(option.fieldId);
                    const disabled = !option.mapping || !checked && selectedOptions.length >= WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT;
                    return (
                      <label key={option.fieldId} className="flex items-center gap-3 py-3 text-sm">
                        <Checkbox
                          aria-label={option.title}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={checked => toggleField(option.fieldId, checked === true)}
                        />
                        <span className="min-w-0 flex-1 break-words">{option.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.mapping ? fieldTypeLabels[option.mapping.fieldType] : "暂不支持"}
                        </span>
                      </label>
                    );
                  })}
                  {options?.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p> : null}
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-t px-6 py-4 sm:justify-between">
          {editingSchema ? (
            <Button asChild variant="link" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
              <a
                href="https://developer.work.weixin.qq.com/document/path/101239"
                target="_blank"
                rel="noopener noreferrer"
              >
                了解如何通过 Webhook 地址推送数据
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">已选 {selectedOptions.length} / {WORKFLOW_SMARTSHEET_WRITE_FIELD_MAX_COUNT}</span>
          )}
          <div className="flex items-center gap-2">
            {editingSchema ? (
              <>
                {canReturnToFieldSelection ? (
                  <Button type="button" variant="outline" onClick={cancelSchemaEditing}>返回</Button>
                ) : null}
                <Button type="button" disabled={!schema.trim()} onClick={parseSchema}>解析</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                <Button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => {
                    if (!canConfirm) return;
                    onConfirm({
                      webhookUrl: webhookUrl.trim(),
                      tableUrl: tableUrl.trim(),
                      schema,
                      fieldMappings: selectedOptions.flatMap(option => option.mapping ? [option.mapping] : []),
                    });
                  }}
                >确认</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
