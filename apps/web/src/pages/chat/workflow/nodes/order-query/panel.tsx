import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS,
  type WorkflowOrderQueryDraftCondition,
  type WorkflowOrderShop,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import { NodeSummaryText } from "../node-summary-text";
import {
  createWorkflowVariableReferenceSummarySegments,
  type WorkflowNodeSummarySegment,
} from "../../workflow-node-summary";
import { WorkflowVariableSelect } from "../../workflow-variable-select";
import {
  getAvailableTimeReferenceVariablesForNode,
  getAvailableVariablesForNode,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import type { WorkflowVariableDefinition } from "../../types";
import type { WorkflowOrderResource } from "../../workflow-order-resource";
import {
  createDefaultOrderQueryConditions,
  createDefaultOrderQueryDynamicTimeRange,
  createDefaultOrderQueryRelativeTimeRange,
  getOrderQueryMetric,
  isOrderNumberVariable,
  isOrderQueryReady,
  normalizeOrderQuerySelector,
  type OrderQueryConditionValidationErrors,
  validateOrderQueryConditions,
} from "./config";
import { OrderQueryTestWorkspace } from "./test-workspace";

const ALL_PLATFORMS_VALUE = "all";
const ALL_ORDER_STATUSES_VALUE = "all";

export function OrderQueryConfig({
  edges,
  node,
  nodes,
  onNodeChange,
  resources,
  testContext,
}: NodeSettingsProps<"order-query">) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const config = node.data.mode === "conditions"
    ? { conditions: node.data.conditions, mode: "conditions" as const }
    : { mode: "order-number" as const, orderNumberSelector: node.data.orderNumberSelector };
  const variables = useMemo(() => getAvailableVariablesForNode(
    node.id,
    nodes,
    edges,
    resources?.customFields?.fields,
  ).filter(variable => isOrderNumberVariable(variable.valueType)), [edges, node.id, nodes, resources?.customFields?.fields]);
  const timeVariables = useMemo(() => getAvailableTimeReferenceVariablesForNode(
    node.id,
    nodes,
    edges,
    resources?.customFields?.fields,
  ), [edges, node.id, nodes, resources?.customFields?.fields]);
  const update = (next: typeof config) => onNodeChange({
    ...next,
    conditions: next.mode === "conditions" ? next.conditions : undefined,
    metric: getOrderQueryMetric(next),
    orderNumberSelector: next.mode === "order-number" ? next.orderNumberSelector : undefined,
    status: isOrderQueryReady(next) ? "ready" : "warning",
  });

  return (
    <>
      <WorkflowSettingsSection title="查询方式">
        <RadioGroup
          aria-label="订单查询方式"
          className="flex items-center gap-6"
          onValueChange={(mode) => {
            if (mode === "order-number") update({ mode, orderNumberSelector: undefined });
            if (mode === "conditions") update({ conditions: createDefaultOrderQueryConditions(), mode });
          }}
          value={config.mode}
        >
          <label className="flex items-center gap-2 text-[13px]"><RadioGroupItem value="order-number" />按订单号</label>
          <label className="flex items-center gap-2 text-[13px]"><RadioGroupItem value="conditions" />按条件</label>
        </RadioGroup>
      </WorkflowSettingsSection>
      {config.mode === "order-number" ? (
        <WorkflowSettingsSection title="订单号">
          <WorkflowVariableSelect
            ariaLabel="订单号"
            customFieldVisibility="compatible"
            invalidLabel="原节点输出不可用"
            onClear={() => update({ mode: "order-number", orderNumberSelector: undefined })}
            onSelect={variable => update({ mode: "order-number", orderNumberSelector: variable.selector })}
            placeholder="请选择订单号"
            value={normalizeOrderQuerySelector(config.orderNumberSelector)}
            variables={variables}
          />
        </WorkflowSettingsSection>
      ) : (
        <WorkflowSettingsSection title={<><span className="text-destructive">* </span>订单满足条件</>}>
          {config.conditions ? (
            <OrderQueryConditionSummary
              conditions={config.conditions}
              orderStatuses={resources?.orders?.orderStatuses ?? []}
              platforms={resources?.orders?.platforms ?? []}
              timeVariables={timeVariables}
            />
          ) : null}
          <Button className="w-full text-sm" onClick={() => setDialogOpen(true)} type="button" variant="outline">
            修改条件
          </Button>
        </WorkflowSettingsSection>
      )}
      {dialogOpen && config.mode === "conditions" ? (
        <OrderConditionsDialog
          conditions={config.conditions ?? createDefaultOrderQueryConditions()}
          onChange={conditions => update({ conditions, mode: "conditions" })}
          onOpenChange={setDialogOpen}
          resource={resources?.orders}
          timeVariables={timeVariables}
        />
      ) : null}
      {testContext ? (
        <OrderQueryTestWorkspace
          node={node}
          testContext={testContext}
          timeVariables={timeVariables}
          variables={variables}
        />
      ) : null}
    </>
  );
}

function OrderConditionsDialog({ conditions, onChange, onOpenChange, resource, timeVariables }: {
  conditions: WorkflowOrderQueryDraftCondition;
  onChange: (value: WorkflowOrderQueryDraftCondition) => void;
  onOpenChange: (open: boolean) => void;
  resource: WorkflowOrderResource | undefined;
  timeVariables: WorkflowVariableDefinition[];
}) {
  const [draftConditions, setDraftConditions] = useState<WorkflowOrderQueryDraftCondition>(
    () => structuredClone(conditions),
  );
  const [amountInputs, setAmountInputs] = useState(() => ({
    max: formatAmountInput(conditions.amount.max),
    min: formatAmountInput(conditions.amount.min),
  }));
  const [validationErrors, setValidationErrors] = useState<OrderQueryConditionValidationErrors>({});
  const [shops, setShops] = useState<WorkflowOrderShop[]>([]);
  const [shopStatus, setShopStatus] = useState<"error" | "idle" | "loading" | "ready">("idle");
  const listShops = resource?.listShops;
  const selectedPlatformIds = useMemo(
    () => draftConditions.platformId ? [draftConditions.platformId] : [],
    [draftConditions.platformId],
  );
  const loadShops = useCallback(async () => {
    if (!listShops) return;
    setShopStatus("loading");
    try {
      const items = await listShops(selectedPlatformIds);
      setShops(items);
      setShopStatus("ready");
    } catch {
      setShopStatus("error");
    }
  }, [listShops, selectedPlatformIds]);
  useEffect(() => {
    if (!listShops) return;
    let active = true;
    setShopStatus("loading");
    void listShops(selectedPlatformIds).then((items) => {
      if (active) {
        setShops(items);
        setShopStatus("ready");
      }
    }).catch(() => { if (active) setShopStatus("error"); });
    return () => { active = false; };
  }, [listShops, selectedPlatformIds]);
  const patch = (value: Partial<WorkflowOrderQueryDraftCondition>) => {
    setDraftConditions(current => ({ ...current, ...value }));
    if ("shopIds" in value) {
      setValidationErrors(current => ({ ...current, shopIds: undefined }));
    }
    if ("timeRange" in value) {
      setValidationErrors(current => ({ ...current, timeRange: undefined }));
    }
  };
  const selectPlatform = (value: string) => {
    if (value === ALL_PLATFORMS_VALUE) {
      setDraftConditions((current) => {
        const next = { ...current, shopIds: [] };
        delete next.platformId;
        return next;
      });
      return;
    }
    patch({ platformId: Number(value), shopIds: [] });
  };
  const selectOrderStatus = (value: string) => {
    if (value === ALL_ORDER_STATUSES_VALUE) {
      setDraftConditions((current) => {
        const next = { ...current };
        delete next.orderStatus;
        return next;
      });
      return;
    }
    patch({ orderStatus: Number(value) });
  };
  const updateAmountInput = (key: "max" | "min") => (event: ChangeEvent<HTMLInputElement>) => {
    setAmountInputs(current => ({ ...current, [key]: event.target.value }));
    setValidationErrors(current => ({ ...current, amount: undefined }));
  };
  const save = () => {
    const parsedAmount = parseAmountInputs(amountInputs);
    const nextConditions = parsedAmount
      ? { ...draftConditions, amount: parsedAmount }
      : draftConditions;
    const nextErrors = validateOrderQueryConditions(nextConditions);
    if (!parsedAmount) nextErrors.amount = "请输入正确的金额，最多两位小数";
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onChange(nextConditions);
    onOpenChange(false);
  };
  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[90vh] w-[min(640px,calc(100vw-2rem))] max-w-[640px] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">订单查询</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <Field label="平台">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={draftConditions.platformId ? String(draftConditions.platformId) : ALL_PLATFORMS_VALUE} onValueChange={selectPlatform}>
                <SelectTrigger aria-label="平台" className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL_PLATFORMS_VALUE}>全部</SelectItem>{resource?.platforms.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
              {resource?.status === "error" ? <Button onClick={resource.reload} size="sm" type="button" variant="ghost">重试</Button> : null}
            </div>
          </Field>
          <Field label="店铺/达人">
            <div className="flex flex-col gap-1.5">
              <ShopMultiSelect
                invalid={Boolean(validationErrors.shopIds)}
                onRetry={loadShops}
                onChange={shopIds => patch({ shopIds })}
                selectedIds={draftConditions.shopIds}
                shops={shops}
                status={shopStatus}
              />
              {validationErrors.shopIds ? (
                <p className="text-xs text-destructive" role="alert">{validationErrors.shopIds}</p>
              ) : null}
            </div>
          </Field>
          <Field label="商品名称">
            <Input
              aria-label="商品名称"
              className="w-64 max-w-full"
              maxLength={512}
              onChange={event => patch({ goodsName: readOptionalText(event.target.value) })}
              placeholder="按商品关键词查询，留空则不限"
              value={draftConditions.goodsName ?? ""}
            />
          </Field>
          <Field label="订单时间">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={draftConditions.timeField} onValueChange={(value) => {
                  if (value === "order-time" || value === "pay-time" || value === "finish-time") {
                    patch({ timeField: value });
                  }
                }}>
                  <SelectTrigger aria-label="订单时间字段" className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order-time">下单时间</SelectItem>
                    <SelectItem value="pay-time">支付时间</SelectItem>
                    <SelectItem value="finish-time">完成时间</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={draftConditions.timeRange.mode} onValueChange={(mode) => {
                  if (mode === "dynamic") patch({ timeRange: createDefaultOrderQueryDynamicTimeRange() });
                  if (mode === "relative") patch({ timeRange: createDefaultOrderQueryRelativeTimeRange() });
                  if (mode === "absolute") patch({ timeRange: { endAt: "", mode, startAt: "" } });
                }}>
                  <SelectTrigger aria-label="订单时间类型" className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dynamic">动态时间</SelectItem>
                    <SelectItem value="relative">相对时间</SelectItem>
                    <SelectItem value="absolute">绝对时间</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <OrderTimeRangeFields
                invalid={Boolean(validationErrors.timeRange)}
                onChange={timeRange => patch({ timeRange })}
                timeRange={draftConditions.timeRange}
                variables={timeVariables}
              />
              {validationErrors.timeRange ? (
                <p className="text-xs text-destructive" role="alert">{validationErrors.timeRange}</p>
              ) : null}
            </div>
          </Field>
          <Field label="订单状态">
            <Select
              onValueChange={selectOrderStatus}
              value={draftConditions.orderStatus === undefined
                ? ALL_ORDER_STATUSES_VALUE
                : String(draftConditions.orderStatus)}
            >
              <SelectTrigger aria-label="订单状态" className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ORDER_STATUSES_VALUE}>不限</SelectItem>
                {resource?.orderStatuses.map(item => (
                  <SelectItem key={item.status} value={String(item.status)}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="订单金额">
            <AmountFields
              amountInputs={amountInputs}
              error={validationErrors.amount}
              onMaxChange={updateAmountInput("max")}
              onMinChange={updateAmountInput("min")}
            />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
          <Button onClick={save} type="button">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShopMultiSelect({ invalid, onChange, onRetry, selectedIds, shops, status }: {
  invalid: boolean;
  onChange: (shopIds: number[]) => void;
  onRetry: () => Promise<void>;
  selectedIds: number[];
  shops: WorkflowOrderShop[];
  status: "error" | "idle" | "loading" | "ready";
}) {
  const [open, setOpen] = useState(false);
  const selectedIdSet = new Set(selectedIds);
  const selectedShops = shops.filter(shop => selectedIdSet.has(shop.id));
  const shopGroups = [
    { label: "店铺", shops: shops.filter(shop => shop.model !== 2) },
    { label: "达人", shops: shops.filter(shop => shop.model === 2) },
  ].filter(group => group.shops.length > 0);
  const summary = selectedIds.length === 0
    ? "请选择"
    : selectedShops.length === 1
      ? selectedShops[0]!.name
      : `已选择 ${selectedIds.length} 个`;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-label="店铺/达人"
          className="w-64 max-w-full justify-between px-3.5 text-sm font-normal"
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className={cn(
            "min-w-0 truncate",
            selectedIds.length === 0 && "text-muted-foreground",
          )}>
            {summary}
          </span>
          <HugeiconsIcon aria-hidden="true" className="shrink-0 opacity-50" icon={ArrowDown01Icon} size={16} strokeWidth={1.8} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1 text-sm">
        {status === "loading" ? (
          <div className="flex h-10 items-center gap-2 px-2.5" role="status"><Spinner />正在加载</div>
        ) : status === "error" ? (
          <div className="flex h-10 items-center justify-between gap-2 px-2.5"><span className="text-destructive">加载失败</span><Button onClick={() => void onRetry()} size="sm" type="button" variant="ghost">重试</Button></div>
        ) : shops.length === 0 ? (
          <div className="flex h-10 items-center px-2.5 text-muted-foreground">暂无数据</div>
        ) : (
          <div aria-label="店铺/达人选项" className="max-h-64 overflow-y-auto" role="group">
            {shopGroups.map(group => (
              <div aria-label={group.label} key={group.label} role="group">
                <div className="px-2.5 pb-1 pt-2 text-[11px] text-muted-foreground">{group.label}</div>
                {group.shops.map((shop) => {
                  const selected = selectedIdSet.has(shop.id);
                  const disabled = !selected
                    && selectedIds.length >= WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS;
                  return (
                    <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 hover:bg-surface-hover" key={shop.id}>
                      <Checkbox
                        aria-label={shop.name}
                        checked={selected}
                        disabled={disabled}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            if (!selected
                              && selectedIds.length < WORKFLOW_ORDER_QUERY_MAX_SELECTED_SHOPS) {
                              onChange([...selectedIds, shop.id]);
                            }
                            return;
                          }
                          onChange(selectedIds.filter(id => id !== shop.id));
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{shop.name}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function OrderQueryConditionSummary({ conditions, orderStatuses, platforms, timeVariables }: {
  conditions: WorkflowOrderQueryDraftCondition;
  orderStatuses: readonly { name: string; status: number }[];
  platforms: readonly { id: number; name: string }[];
  timeVariables: WorkflowVariableDefinition[];
}) {
  const platform = conditions.platformId === undefined
    ? "全部平台"
    : platforms.find(item => item.id === conditions.platformId)?.name ?? `平台 ${conditions.platformId}`;
  const rows = [
    { label: "下单平台：", value: platform },
    ...(conditions.shopIds.length > 0
      ? [{ label: "店铺/达人：", value: `已选择 ${conditions.shopIds.length} 个` }]
      : []),
    ...(conditions.goodsName
      ? [{ label: "商品名称：", value: conditions.goodsName }]
      : []),
    ...(conditions.orderStatus === undefined
      ? []
      : [{
          label: "订单状态：",
          value: orderStatuses.find(item => item.status === conditions.orderStatus)?.name
            ?? `状态 ${conditions.orderStatus}`,
        }]),
    {
      label: `${getOrderQueryTimeLabel(conditions.timeField)}：`,
      value: renderOrderQueryTimeRange(conditions.timeRange, timeVariables),
    },
    { label: "订单金额：", value: formatOrderQueryAmount(conditions) },
  ];
  return (
    <div className="relative min-w-0 pl-8 text-xs">
      <span
        aria-hidden="true"
        className="absolute bottom-[18px] left-2 top-[18px] w-5 rounded-l-[8px] border-b border-l border-t border-border"
      />
      <span
        aria-label="条件关系：且"
        className="absolute left-2 top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] border border-input bg-background text-xs shadow-none"
      >
        且
      </span>
      <dl aria-label="订单查询条件摘要" className="min-w-0 space-y-2">
        {rows.map(row => (
          <div className="grid min-w-0 grid-cols-[60px_minmax(0,1fr)] items-center gap-2 rounded-[8px] bg-secondary/50 px-3 py-2.5" key={row.label}>
            <dt className="whitespace-nowrap text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 truncate text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function getOrderQueryTimeLabel(timeField: WorkflowOrderQueryDraftCondition["timeField"]) {
  if (timeField === "pay-time") return "支付时间";
  if (timeField === "finish-time") return "完成时间";
  return "下单时间";
}

function renderOrderQueryTimeRange(
  timeRange: WorkflowOrderQueryDraftCondition["timeRange"],
  timeVariables: WorkflowVariableDefinition[],
) {
  if (timeRange.mode === "absolute") {
    return `${formatOrderQueryDateTime(timeRange.startAt)} - ${formatOrderQueryDateTime(timeRange.endAt)}`;
  }
  if (timeRange.mode === "dynamic") {
    const segments = [
      ...createOrderQueryTimeVariableSegments(timeRange.start, timeVariables),
      { kind: "operator" as const, text: " - " },
      ...createOrderQueryTimeVariableSegments(timeRange.end, timeVariables),
    ];
    return (
      <NodeSummaryText segments={segments} />
    );
  }
  return `${formatRelativePoint(timeRange.start)} - ${formatRelativePoint(timeRange.end)}`;
}

function createOrderQueryTimeVariableSegments(
  selector: WorkflowVariableSelector,
  variables: WorkflowVariableDefinition[],
): WorkflowNodeSummarySegment[] {
  const variable = resolveWorkflowVariable(variables, selector);
  return variable
    ? createWorkflowVariableReferenceSummarySegments(variable)
    : [{ kind: "value", text: "时间变量不可用", tone: "warning" }];
}

function formatOrderQueryDateTime(value: string) {
  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function formatRelativePoint(point: RelativePointValue) {
  const unit = point.unit === "day" ? "天" : point.unit === "hour" ? "小时" : "分钟";
  return `过去 ${point.amount} ${unit}${point.unit === "day" ? ` ${point.time}:00` : ""}`;
}

function formatOrderQueryAmount(conditions: WorkflowOrderQueryDraftCondition) {
  const { max, min } = conditions.amount;
  if (min === undefined && max === undefined) return "不限";
  return `${min ?? "不限"} - ${max ?? "不限"}`;
}

function AmountFields({ amountInputs, error, onMaxChange, onMinChange }: {
  amountInputs: { max: string; min: string };
  error?: string;
  onMaxChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMinChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-invalid={error ? true : undefined} aria-label="最低订单金额" className={cn("w-32 text-sm", error && "border-destructive focus-visible:ring-destructive/20")} inputMode="decimal" onChange={onMinChange} placeholder="最低金额" value={amountInputs.min} />
        <span className="shrink-0 text-muted-foreground">至</span>
        <Input aria-invalid={error ? true : undefined} aria-label="最高订单金额" className={cn("w-32 text-sm", error && "border-destructive focus-visible:ring-destructive/20")} inputMode="decimal" onChange={onMaxChange} placeholder="最高金额" value={amountInputs.max} />
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

function Field({ children, label, required = false }: { children: ReactNode; label: string; required?: boolean }) {
  return (
    <div className="grid items-start gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
      <div className="pt-2 font-medium">{required ? <span className="text-destructive">* </span> : null}{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type OrderTimeRange = WorkflowOrderQueryDraftCondition["timeRange"];
type RelativeOrderTimeRange = Extract<OrderTimeRange, { mode: "relative" }>;
type RelativePointValue = RelativeOrderTimeRange["start"];

function OrderTimeRangeFields({ invalid, onChange, timeRange, variables }: {
  invalid: boolean;
  onChange: (value: OrderTimeRange) => void;
  timeRange: OrderTimeRange;
  variables: WorkflowVariableDefinition[];
}) {
  if (timeRange.mode === "absolute") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0">开始</span>
          <DateTimePicker aria-invalid={invalid || undefined} aria-label="订单开始时间" className="h-10 w-56" onValueChange={startAt => onChange({ endAt: timeRange.endAt, mode: "absolute", startAt })} value={timeRange.startAt} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0">结束</span>
          <DateTimePicker aria-invalid={invalid || undefined} aria-label="订单结束时间" className="h-10 w-56" onValueChange={endAt => onChange({ endAt, mode: "absolute", startAt: timeRange.startAt })} value={timeRange.endAt} />
        </div>
      </div>
    );
  }
  if (timeRange.mode === "dynamic") {
    return (
      <div className="flex flex-col gap-2">
        <DynamicTimeField label="开始" onChange={start => onChange({ ...timeRange, start })} value={timeRange.start} variables={variables} />
        <DynamicTimeField label="结束" onChange={end => onChange({ ...timeRange, end })} value={timeRange.end} variables={variables} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <RelativePoint invalid={invalid} label="开始" value={timeRange.start} onChange={start => onChange({ ...timeRange, start })} />
      <RelativePoint invalid={invalid} label="结束" value={timeRange.end} onChange={end => onChange({ ...timeRange, end })} />
    </div>
  );
}

function DynamicTimeField({ label, onChange, value, variables }: {
  label: string;
  onChange: (value: WorkflowVariableSelector) => void;
  value: WorkflowVariableSelector;
  variables: WorkflowVariableDefinition[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0">{label}</span>
      <WorkflowVariableSelect
        ariaLabel={`${label}动态时间`}
        buttonClassName="w-64 max-w-full"
        customFieldVisibility="compatible"
        invalidLabel="时间变量不可用"
        onSelect={variable => onChange(variable.selector)}
        value={value}
        variables={variables}
      />
    </div>
  );
}

function RelativePoint({ invalid, label, onChange, value }: { invalid: boolean; label: string; onChange: (value: RelativePointValue) => void; value: RelativePointValue }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0">{label}</span>
      <Input
        aria-label={`${label}相对数值`}
        aria-invalid={invalid || undefined}
        className={cn("w-20 px-2.5", invalid && "border-destructive focus-visible:ring-destructive/20")}
        min={0}
        onChange={event => onChange({ ...value, amount: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })}
        type="number"
        value={value.amount}
      />
      <Select value={value.unit} onValueChange={(unit) => {
        if (unit === "day") onChange({ amount: value.amount, unit, time: label === "开始" ? "00:00" : "23:59" });
        if (unit === "hour" || unit === "minute") onChange({ amount: value.amount, unit });
      }}>
        <SelectTrigger aria-label={`${label}相对单位`} className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="day">天前</SelectItem>
          <SelectItem value="hour">小时前</SelectItem>
          <SelectItem value="minute">分钟前</SelectItem>
        </SelectContent>
      </Select>
      {value.unit === "day" ? <TimePicker aria-label={`${label}时间`} className="h-10" onValueChange={time => onChange({ ...value, time })} value={value.time} /> : null}
    </div>
  );
}

function formatAmountInput(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function parseAmountInputs(values: { max: string; min: string }) {
  const min = parseOptionalAmount(values.min);
  const max = parseOptionalAmount(values.max);
  if (min === null || max === null) return null;
  return {
    ...(max === undefined ? {} : { max }),
    ...(min === undefined ? {} : { min }),
  };
}

function parseOptionalAmount(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function readOptionalText(value: string) {
  return value.trim() || undefined;
}
