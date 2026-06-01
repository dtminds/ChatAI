import {
  Add01Icon,
  BubbleChatIcon,
  ChartAreaIcon,
  ClipboardCheckIcon,
  Delete02Icon,
  Edit02Icon,
  Search01Icon,
  Setting07Icon,
  Task01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  InsightAnalysisPolicy,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRiskConfig,
  InsightRiskConfigMutationRequest,
  InsightSettingsResponse,
  InsightSessionizationSettings,
} from "@chatai/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  createInsightEntityDictionaryItem,
  createInsightLabelConfig,
  createInsightQaRuleConfig,
  createInsightRescanJob,
  createInsightRiskConfig,
  deleteInsightEntityDictionaryItem,
  deleteInsightLabelConfig,
  deleteInsightQaRuleConfig,
  deleteInsightRiskConfig,
  getInsightSettings,
  updateInsightAnalysisPolicy,
  updateInsightEntityDictionaryItem,
  updateInsightEntityDictionaryItemStatus,
  updateInsightLabelConfig,
  updateInsightLabelConfigStatus,
  updateInsightQaRuleConfig,
  updateInsightQaRuleConfigStatus,
  updateInsightRiskConfig,
  updateInsightRiskConfigStatus,
  updateInsightSessionizationSettings,
} from "./api/insights-service";
import { InsightsLayout } from "./insights-layout";

type MutableCollection = "entity" | "label" | "qa" | "risk";

type ConfigDialogState =
  | { collection: "label"; mode: "create" }
  | { collection: "label"; item: InsightLabelConfig; mode: "edit" }
  | { collection: "qa"; mode: "create" }
  | { collection: "qa"; item: InsightQaRuleConfig; mode: "edit" }
  | { collection: "risk"; mode: "create" }
  | { collection: "risk"; item: InsightRiskConfig; mode: "edit" }
  | { collection: "entity"; mode: "create" }
  | { collection: "entity"; item: InsightEntityDictionaryItem; mode: "edit" };

const defaultSettings: InsightSettingsResponse = {
  analysisPolicy: {
    finalAnalysisEnabled: true,
    liveAnalysisEnabled: true,
    liveMinIntervalMinutes: 10,
    liveMinNewMeaningfulMessages: 6,
    lowConfidenceThreshold: 0.6,
    ruleFallbackEnabled: true,
  },
  entityDictionary: [],
  labelConfigs: [],
  qaRuleConfigs: [],
  riskConfigs: [],
  sessionization: {
    analysisDelayMinutes: 10,
    hardMaxDurationHours: 48,
    idleTimeoutMinutes: 120,
    lateArrivalWindowMinutes: 30,
    preset: "custom",
  },
};

const sessionizationPresets: Array<{
  description: string;
  label: string;
  settings: InsightSessionizationSettings;
  value: InsightSessionizationSettings["preset"];
}> = [
  {
    description: "适合在线客服高频咨询，较快形成逻辑会话并触发分析",
    label: "实时客服",
    settings: {
      analysisDelayMinutes: 10,
      hardMaxDurationHours: 24,
      idleTimeoutMinutes: 60,
      lateArrivalWindowMinutes: 20,
      preset: "realtime_service",
    },
    value: "realtime_service",
  },
  {
    description: "适合私域长周期沟通，保留更长上下文后再切片",
    label: "私域运营",
    settings: {
      analysisDelayMinutes: 20,
      hardMaxDurationHours: 72,
      idleTimeoutMinutes: 240,
      lateArrivalWindowMinutes: 60,
      preset: "private_domain",
    },
    value: "private_domain",
  },
  {
    description: "手动设置切片参数，适合已经有明确服务节奏的团队",
    label: "自定义",
    settings: {
      analysisDelayMinutes: 10,
      hardMaxDurationHours: 48,
      idleTimeoutMinutes: 120,
      lateArrivalWindowMinutes: 30,
      preset: "custom",
    },
    value: "custom",
  },
];

export function InsightsSettingsPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const [dialogState, setDialogState] = useState<ConfigDialogState | null>(null);
  const [entityQuery, setEntityQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string>();
  const [rescanFrom, setRescanFrom] = useState(() => toDateTimeLocalValue(Date.now() - 24 * 60 * 60 * 1000));
  const [rescanState, setRescanState] = useState<string>();
  const [settings, setSettings] = useState<InsightSettingsResponse>();
  const canAccessSettings = role === "owner" || role === "admin";

  useEffect(() => {
    if (!canAccessSettings) {
      return;
    }

    let ignore = false;

    async function load() {
      setIsLoading(true);

      try {
        const result = await getInsightSettings();

        if (!ignore) {
          setSettings(result);
        }
      } catch (error) {
        if (!ignore) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [canAccessSettings]);

  const currentSettings = settings ?? defaultSettings;
  const filteredEntities = useMemo(() => {
    const query = entityQuery.trim().toLowerCase();

    if (!query) {
      return currentSettings.entityDictionary;
    }

    return currentSettings.entityDictionary.filter((item) =>
      [item.canonicalName, item.entityType, item.aliases.join(" ")].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [currentSettings.entityDictionary, entityQuery]);

  async function handleSessionizationSubmit(payload: InsightSessionizationSettings) {
    setPendingKey("sessionization");

    try {
      const next = await updateInsightSessionizationSettings(payload);
      setSettings((current) => ({ ...(current ?? defaultSettings), sessionization: next }));
      toast.success("切片策略已保存");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleAnalysisPolicySubmit(payload: InsightAnalysisPolicy) {
    setPendingKey("analysis");

    try {
      const next = await updateInsightAnalysisPolicy(payload);
      setSettings((current) => ({ ...(current ?? defaultSettings), analysisPolicy: next }));
      toast.success("分析策略已保存");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleStatusToggle(collection: MutableCollection, id: string, enabled: boolean) {
    setPendingKey(`status:${collection}:${id}`);

    try {
      if (collection === "label") {
        const next = await updateInsightLabelConfigStatus(id, { enabled });
        updateSettingsList("label", next);
      } else if (collection === "qa") {
        const next = await updateInsightQaRuleConfigStatus(id, { enabled });
        updateSettingsList("qa", next);
      } else if (collection === "risk") {
        const next = await updateInsightRiskConfigStatus(id, { enabled });
        updateSettingsList("risk", next);
      } else {
        const next = await updateInsightEntityDictionaryItemStatus(id, { enabled });
        updateSettingsList("entity", next);
      }

      toast.success(enabled ? "已启用" : "已停用");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleDelete(collection: MutableCollection, id: string) {
    setPendingKey(`delete:${collection}:${id}`);

    try {
      if (collection === "label") {
        await deleteInsightLabelConfig(id);
      } else if (collection === "qa") {
        await deleteInsightQaRuleConfig(id);
      } else if (collection === "risk") {
        await deleteInsightRiskConfig(id);
      } else {
        await deleteInsightEntityDictionaryItem(id);
      }

      removeSettingsListItem(collection, id);
      toast.success("配置已删除");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleDialogSubmit(payload: Record<string, unknown>) {
    if (!dialogState) {
      return;
    }

    const pending = `${dialogState.mode}:${dialogState.collection}`;
    setPendingKey(pending);

    try {
      if (dialogState.collection === "label") {
        const next = dialogState.mode === "create"
          ? await createInsightLabelConfig(payload as InsightLabelConfigMutationRequest)
          : await updateInsightLabelConfig(
            dialogState.item.id,
            payload as InsightLabelConfigMutationRequest,
          );

        updateSettingsList("label", next);
      } else if (dialogState.collection === "qa") {
        const next = dialogState.mode === "create"
          ? await createInsightQaRuleConfig(payload as InsightQaRuleConfigMutationRequest)
          : await updateInsightQaRuleConfig(
            dialogState.item.id,
            payload as InsightQaRuleConfigMutationRequest,
          );

        updateSettingsList("qa", next);
      } else if (dialogState.collection === "risk") {
        const next = dialogState.mode === "create"
          ? await createInsightRiskConfig(payload as InsightRiskConfigMutationRequest)
          : await updateInsightRiskConfig(
            dialogState.item.id,
            payload as InsightRiskConfigMutationRequest,
          );

        updateSettingsList("risk", next);
      } else {
        const next = dialogState.mode === "create"
          ? await createInsightEntityDictionaryItem(payload as InsightEntityDictionaryMutationRequest)
          : await updateInsightEntityDictionaryItem(
            dialogState.item.id,
            payload as InsightEntityDictionaryMutationRequest,
          );

        updateSettingsList("entity", next);
      }

      setDialogState(null);
      toast.success(dialogState.mode === "create" ? "配置已新增" : "配置已更新");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function createRescan() {
    setPendingKey("rescan");

    try {
      const result = await createInsightRescanJob({
        from: new Date(rescanFrom).toISOString(),
      });
      setRescanState(`已创建任务 ${result.jobId}`);
      toast.success("历史重刷任务已创建");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  function updateSettingsList(collection: MutableCollection, item: unknown) {
    setSettings((current) => {
      const next = current ?? defaultSettings;

      if (collection === "label") {
        return {
          ...next,
          labelConfigs: upsertById(next.labelConfigs, item as InsightLabelConfig),
        };
      }

      if (collection === "qa") {
        return {
          ...next,
          qaRuleConfigs: upsertById(next.qaRuleConfigs, item as InsightQaRuleConfig),
        };
      }

      if (collection === "risk") {
        return {
          ...next,
          riskConfigs: upsertById(next.riskConfigs, item as InsightRiskConfig),
        };
      }

      return {
        ...next,
        entityDictionary: upsertById(
          next.entityDictionary,
          item as InsightEntityDictionaryItem,
        ),
      };
    });
  }

  function removeSettingsListItem(collection: MutableCollection, id: string) {
    setSettings((current) => {
      const next = current ?? defaultSettings;

      if (collection === "label") {
        return { ...next, labelConfigs: next.labelConfigs.filter((item) => item.id !== id) };
      }

      if (collection === "qa") {
        return { ...next, qaRuleConfigs: next.qaRuleConfigs.filter((item) => item.id !== id) };
      }

      if (collection === "risk") {
        return { ...next, riskConfigs: next.riskConfigs.filter((item) => item.id !== id) };
      }

      return {
        ...next,
        entityDictionary: next.entityDictionary.filter((item) => item.id !== id),
      };
    });
  }

  if (!canAccessSettings) {
    return (
      <InsightsLayout title="洞察配置">
        <div className="rounded-[8px] border bg-background p-8 text-center">
          <h2 className="text-lg font-semibold">仅管理员可查看洞察配置</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            数据页仍按登录态和租户隔离开放，配置页需要管理员角色
          </p>
        </div>
      </InsightsLayout>
    );
  }

  return (
    <InsightsLayout title="洞察配置">
      <div className="space-y-4">
        <SettingsSummary settings={currentSettings} />

        <Tabs className="gap-4" defaultValue="sessionization">
          <TabsList className="h-auto w-full justify-start gap-8 overflow-x-auto rounded-none border-b border-divider bg-transparent p-0 text-muted-foreground">
            <SettingsTabTrigger value="sessionization">会话切片</SettingsTabTrigger>
            <SettingsTabTrigger value="analysis">分析策略</SettingsTabTrigger>
            <SettingsTabTrigger value="labels">标签体系</SettingsTabTrigger>
            <SettingsTabTrigger value="qa">质检规则</SettingsTabTrigger>
            <SettingsTabTrigger value="risks">风险关注</SettingsTabTrigger>
            <SettingsTabTrigger value="entities">实体词库</SettingsTabTrigger>
            <SettingsTabTrigger value="rescan">历史重刷</SettingsTabTrigger>
          </TabsList>

          <TabsContent value="sessionization">
            <SessionizationPanel
              disabled={isLoading || pendingKey === "sessionization"}
              onSubmit={(payload) => void handleSessionizationSubmit(payload)}
              value={currentSettings.sessionization}
            />
          </TabsContent>

          <TabsContent value="analysis">
            <AnalysisPolicyPanel
              disabled={isLoading || pendingKey === "analysis"}
              onSubmit={(payload) => void handleAnalysisPolicySubmit(payload)}
              value={currentSettings.analysisPolicy}
            />
          </TabsContent>

          <TabsContent value="labels">
            <LabelConfigTable
              items={currentSettings.labelConfigs}
              onCreate={() => setDialogState({ collection: "label", mode: "create" })}
              onDelete={(item) => void handleDelete("label", item.id)}
              onEdit={(item) => setDialogState({ collection: "label", item, mode: "edit" })}
              onToggle={(item) => void handleStatusToggle("label", item.id, !item.enabled)}
              pendingKey={pendingKey}
            />
          </TabsContent>

          <TabsContent value="qa">
            <QaRuleConfigTable
              items={currentSettings.qaRuleConfigs}
              onCreate={() => setDialogState({ collection: "qa", mode: "create" })}
              onDelete={(item) => void handleDelete("qa", item.id)}
              onEdit={(item) => setDialogState({ collection: "qa", item, mode: "edit" })}
              onToggle={(item) => void handleStatusToggle("qa", item.id, !item.enabled)}
              pendingKey={pendingKey}
            />
          </TabsContent>

          <TabsContent value="risks">
            <RiskConfigTable
              items={currentSettings.riskConfigs}
              onCreate={() => setDialogState({ collection: "risk", mode: "create" })}
              onDelete={(item) => void handleDelete("risk", item.id)}
              onEdit={(item) => setDialogState({ collection: "risk", item, mode: "edit" })}
              onToggle={(item) => void handleStatusToggle("risk", item.id, !item.enabled)}
              pendingKey={pendingKey}
            />
          </TabsContent>

          <TabsContent value="entities">
            <EntityDictionaryTable
              items={filteredEntities}
              onCreate={() => setDialogState({ collection: "entity", mode: "create" })}
              onDelete={(item) => void handleDelete("entity", item.id)}
              onEdit={(item) => setDialogState({ collection: "entity", item, mode: "edit" })}
              onQueryChange={setEntityQuery}
              onToggle={(item) => void handleStatusToggle("entity", item.id, !item.enabled)}
              pendingKey={pendingKey}
              query={entityQuery}
            />
          </TabsContent>

          <TabsContent value="rescan">
            <RescanPanel
              disabled={pendingKey === "rescan"}
              from={rescanFrom}
              onChange={setRescanFrom}
              onCreate={() => void createRescan()}
              state={rescanState}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ConfigMutationDialog
        disabled={pendingKey?.startsWith("create:") || pendingKey?.startsWith("edit:")}
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
        onSubmit={(payload) => void handleDialogSubmit(payload)}
        state={dialogState}
      />
    </InsightsLayout>
  );
}

function SettingsTabTrigger({
  children,
  value,
}: {
  children: ReactNode;
  value: string;
}) {
  return (
    <TabsTrigger
      className="min-w-0 whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function SettingsSummary({ settings }: { settings: InsightSettingsResponse }) {
  const stats = [
    { icon: BubbleChatIcon, label: "切片预设", value: presetText(settings.sessionization.preset) },
    { icon: ChartAreaIcon, label: "准实时分析", value: settings.analysisPolicy.liveAnalysisEnabled ? "开启" : "关闭" },
    { icon: Setting07Icon, label: "启用标签", value: `${settings.labelConfigs.filter((item) => item.enabled).length} 个` },
    { icon: ClipboardCheckIcon, label: "质检规则", value: `${settings.qaRuleConfigs.filter((item) => item.enabled).length} 条` },
    { icon: Task01Icon, label: "风险关注", value: `${settings.riskConfigs.filter((item) => item.enabled).length} 项` },
    { icon: UserGroupIcon, label: "实体词库", value: `${settings.entityDictionary.length} 个` },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((item) => (
        <div className="flex min-h-[112px] flex-col justify-between rounded-[8px] border bg-background px-4 py-4" key={item.label}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border bg-muted/35 text-muted-foreground">
            <HugeiconsIcon color="currentColor" icon={item.icon} size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 pt-4">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="mt-1 truncate text-sm font-semibold text-foreground">{item.value}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

function SessionizationPanel({
  disabled,
  onSubmit,
  value,
}: {
  disabled: boolean;
  onSubmit: (value: InsightSessionizationSettings) => void;
  value: InsightSessionizationSettings;
}) {
  const [form, setForm] = useState(value);

  useEffect(() => setForm(value), [value]);

  function updateCustomValue<Key extends keyof Omit<InsightSessionizationSettings, "preset">>(
    key: Key,
    nextValue: InsightSessionizationSettings[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: nextValue,
      preset: "custom",
    }));
  }

  return (
    <FormPanel
      disabled={disabled}
      onSubmit={() => onSubmit(form)}
      title="会话切片"
    >
      <RadioGroup
        aria-label="切片预设"
        className="grid gap-3 md:grid-cols-3"
        onValueChange={(preset: InsightSessionizationSettings["preset"]) => {
          const selectedPreset = sessionizationPresets.find((item) => item.value === preset);

          setForm((current) => selectedPreset
            ? { ...selectedPreset.settings }
            : { ...current, preset });
        }}
        value={form.preset}
      >
        {sessionizationPresets.map((preset) => {
          const isSelected = form.preset === preset.value;

          return (
            <Label
              className={cn(
                "flex min-h-[118px] cursor-pointer items-start gap-3 rounded-[10px] border border-border px-4 py-4 transition-colors hover:border-primary/40",
                isSelected && "border-primary bg-primary/5",
              )}
              key={preset.value}
            >
              <RadioGroupItem className="mt-0.5" value={preset.value} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {preset.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {preset.description}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>

      <div className="mt-5 rounded-[8px] border bg-background">
        <SessionizationParameterRow
          description="空闲多久后结束本轮服务；越短越快出结果，越长上下文越完整"
          label="结束时长"
          onChange={(idleTimeoutMinutes) => updateCustomValue("idleTimeoutMinutes", idleTimeoutMinutes)}
          suffix="分钟"
          value={form.idleTimeoutMinutes}
        />
        <SessionizationParameterRow
          description="单个逻辑会话最多持续多久；越短拆分越细，越长单次分析上下文越大"
          label="最长会话"
          onChange={(hardMaxDurationHours) => updateCustomValue("hardMaxDurationHours", hardMaxDurationHours)}
          suffix="小时"
          value={form.hardMaxDurationHours}
        />
        <SessionizationParameterRow
          description="会话结束后多久启动分析；越短越实时，越长越能等待补充消息"
          label="分析延迟"
          onChange={(analysisDelayMinutes) => updateCustomValue("analysisDelayMinutes", analysisDelayMinutes)}
          suffix="分钟"
          value={form.analysisDelayMinutes}
        />
        <SessionizationParameterRow
          description="结束后多久内的新消息仍可补入本轮；越短结果越稳定，越长覆盖越完整"
          label="迟到窗口"
          onChange={(lateArrivalWindowMinutes) => updateCustomValue("lateArrivalWindowMinutes", lateArrivalWindowMinutes)}
          suffix="分钟"
          value={form.lateArrivalWindowMinutes}
        />
      </div>

      <SessionizationTimeline settings={form} />
    </FormPanel>
  );
}

function AnalysisPolicyPanel({
  disabled,
  onSubmit,
  value,
}: {
  disabled: boolean;
  onSubmit: (value: InsightAnalysisPolicy) => void;
  value: InsightAnalysisPolicy;
}) {
  const [form, setForm] = useState(value);

  useEffect(() => setForm(value), [value]);

  return (
    <FormPanel
      disabled={disabled}
      onSubmit={() => onSubmit(form)}
      title="分析策略"
    >
      <div className="rounded-[8px] border bg-background">
        <BooleanSettingRow
          checked={form.liveAnalysisEnabled}
          description="会话进行中满足条件时提前分析，用于更快生成风险、待办和问题判断"
          label="准实时分析"
          onChange={(liveAnalysisEnabled) => setForm((current) => ({ ...current, liveAnalysisEnabled }))}
        />
        <BooleanSettingRow
          checked={form.finalAnalysisEnabled}
          description="逻辑会话结束后做最终分析，用于覆盖准实时阶段的不完整判断"
          label="终局分析"
          onChange={(finalAnalysisEnabled) => setForm((current) => ({ ...current, finalAnalysisEnabled }))}
        />
        <BooleanSettingRow
          checked={form.ruleFallbackEnabled}
          description="模型不可用或置信度不足时启用规则兜底，减少关键结果缺失"
          label="规则降级"
          onChange={(ruleFallbackEnabled) => setForm((current) => ({ ...current, ruleFallbackEnabled }))}
        />
        <NumberSettingRow
          description="准实时分析前至少新增多少条有效消息，避免频繁重复分析"
          label="最少新增有效消息"
          onChange={(liveMinNewMeaningfulMessages) => setForm((current) => ({ ...current, liveMinNewMeaningfulMessages }))}
          suffix="条"
          value={form.liveMinNewMeaningfulMessages}
        />
        <NumberSettingRow
          description="同一逻辑会话两次准实时分析之间的最短间隔"
          label="最短分析间隔"
          onChange={(liveMinIntervalMinutes) => setForm((current) => ({ ...current, liveMinIntervalMinutes }))}
          suffix="分钟"
          value={form.liveMinIntervalMinutes}
        />
        <NumberSettingRow
          description="低于该置信度的结果会被标记为低可信，便于人工复核"
          label="低置信阈值"
          onChange={(lowConfidenceThreshold) => setForm((current) => ({ ...current, lowConfidenceThreshold }))}
          step="0.01"
          value={form.lowConfidenceThreshold}
        />
      </div>
    </FormPanel>
  );
}

function SessionizationTimeline({
  settings,
}: {
  settings: InsightSessionizationSettings;
}) {
  const steps = [
    {
      description: "客户或客服发出最后一条有效消息",
      title: "最后有效消息",
    },
    {
      description: `空闲 ${settings.idleTimeoutMinutes} 分钟后，本轮服务被判定结束`,
      title: "逻辑会话结束",
    },
    {
      description: `再等待 ${settings.analysisDelayMinutes} 分钟，启动 AI 洞察分析`,
      title: "启动分析",
    },
  ];

  return (
    <section className="mt-5 rounded-[8px] border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <div className="relative min-h-[86px] rounded-[8px] bg-background px-4 py-3" key={step.title}>
            {index < steps.length - 1 ? (
              <span className="absolute right-[-10px] top-1/2 hidden h-px w-5 bg-border md:block" />
            ) : null}
            <div className="text-sm font-semibold text-foreground">{step.title}</div>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-right text-xs leading-5 text-muted-foreground">
        会话结束后 {settings.lateArrivalWindowMinutes} 分钟内到达的补充消息会进入迟到窗口；连续沟通超过 {settings.hardMaxDurationHours} 小时会强制切片
      </div>
    </section>
  );
}

function SessionizationParameterRow({
  description,
  label,
  onChange,
  suffix,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <section className="grid gap-4 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_13rem] md:items-center">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center justify-start gap-2 md:justify-end">
        <Input
          className="h-10 w-32 text-right text-base font-semibold"
          min={0}
          onChange={(event) => onChange(Number(event.target.value))}
          type="number"
          value={value}
        />
        <span className="w-10 shrink-0 text-sm text-muted-foreground">{suffix}</span>
      </div>
    </section>
  );
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <section className="grid gap-4 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_13rem] md:items-center">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center justify-start gap-2 md:justify-end">
        {children}
      </div>
    </section>
  );
}

function BooleanSettingRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingsRow description={description} label={label}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </SettingsRow>
  );
}

function NumberSettingRow({
  description,
  label,
  onChange,
  step,
  suffix,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: number) => void;
  step?: string;
  suffix?: string;
  value: number;
}) {
  return (
    <SettingsRow description={description} label={label}>
      <Input
        className="h-10 w-32 text-right text-base font-semibold"
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
      {suffix ? <span className="w-10 shrink-0 text-sm text-muted-foreground">{suffix}</span> : null}
    </SettingsRow>
  );
}

function FormPanel({
  children,
  disabled,
  onSubmit,
  title,
}: {
  children: ReactNode;
  disabled: boolean;
  onSubmit: () => void;
  title: string;
}) {
  return (
    <section className="rounded-[8px] border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button disabled={disabled} onClick={onSubmit} size="sm">
          保存
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function LabelConfigTable({
  items,
  onCreate,
  onDelete,
  onEdit,
  onToggle,
  pendingKey,
}: {
  items: InsightLabelConfig[];
  onCreate: () => void;
  onDelete: (item: InsightLabelConfig) => void;
  onEdit: (item: InsightLabelConfig) => void;
  onToggle: (item: InsightLabelConfig) => void;
  pendingKey?: string;
}) {
  return (
    <ConfigTableShell
      actionText="新增标签"
      description="维护模型可提取、可统计的业务标签"
      onCreate={onCreate}
      title="标签体系"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标签</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>统计</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.labelName} sub={item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.labelCode}</TableCell>
              <TableCell>{item.includeInStatistics ? "纳入" : "不纳入"}</TableCell>
              <TableCell>
                <Switch
                  checked={item.enabled}
                  disabled={pendingKey === `status:label:${item.id}`}
                  onCheckedChange={() => onToggle(item)}
                />
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  disabled={pendingKey === `delete:label:${item.id}`}
                  onDelete={() => onDelete(item)}
                  onEdit={() => onEdit(item)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigTableShell>
  );
}

function QaRuleConfigTable({
  items,
  onCreate,
  onDelete,
  onEdit,
  onToggle,
  pendingKey,
}: {
  items: InsightQaRuleConfig[];
  onCreate: () => void;
  onDelete: (item: InsightQaRuleConfig) => void;
  onEdit: (item: InsightQaRuleConfig) => void;
  onToggle: (item: InsightQaRuleConfig) => void;
  pendingKey?: string;
}) {
  return (
    <ConfigTableShell
      actionText="新增规则"
      description="定义问题是否解决、服务是否达标的判定标准"
      onCreate={onCreate}
      title="质检规则"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>规则</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>严重度</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.ruleName} sub={item.judgmentCriteria ?? item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.ruleCode}</TableCell>
              <TableCell><SeverityBadge severity={item.severity} /></TableCell>
              <TableCell>
                <Switch
                  checked={item.enabled}
                  disabled={pendingKey === `status:qa:${item.id}`}
                  onCheckedChange={() => onToggle(item)}
                />
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  disabled={pendingKey === `delete:qa:${item.id}`}
                  onDelete={() => onDelete(item)}
                  onEdit={() => onEdit(item)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigTableShell>
  );
}

function RiskConfigTable({
  items,
  onCreate,
  onDelete,
  onEdit,
  onToggle,
  pendingKey,
}: {
  items: InsightRiskConfig[];
  onCreate: () => void;
  onDelete: (item: InsightRiskConfig) => void;
  onEdit: (item: InsightRiskConfig) => void;
  onToggle: (item: InsightRiskConfig) => void;
  pendingKey?: string;
}) {
  return (
    <ConfigTableShell
      actionText="新增风险项"
      description="维护需要优先提醒和加权处理的风险信号"
      onCreate={onCreate}
      title="风险关注"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>风险项</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>严重度</TableHead>
            <TableHead>加权</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.riskName} sub={item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.riskCode}</TableCell>
              <TableCell><SeverityBadge severity={item.severity} /></TableCell>
              <TableCell>{item.priorityBoost}</TableCell>
              <TableCell>
                <Switch
                  checked={item.enabled}
                  disabled={pendingKey === `status:risk:${item.id}`}
                  onCheckedChange={() => onToggle(item)}
                />
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  disabled={pendingKey === `delete:risk:${item.id}`}
                  onDelete={() => onDelete(item)}
                  onEdit={() => onEdit(item)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigTableShell>
  );
}

function EntityDictionaryTable({
  items,
  onCreate,
  onDelete,
  onEdit,
  onQueryChange,
  onToggle,
  pendingKey,
  query,
}: {
  items: InsightEntityDictionaryItem[];
  onCreate: () => void;
  onDelete: (item: InsightEntityDictionaryItem) => void;
  onEdit: (item: InsightEntityDictionaryItem) => void;
  onQueryChange: (value: string) => void;
  onToggle: (item: InsightEntityDictionaryItem) => void;
  pendingKey?: string;
  query: string;
}) {
  return (
    <ConfigTableShell
      actionText="新增实体"
      description="统一商品、品牌、活动等名称，提升热点和主体聚合质量"
      extra={(
        <div className="relative">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <Input
            className="h-9 w-60 pl-9"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索实体或别名"
            value={query}
          />
        </div>
      )}
      onCreate={onCreate}
      title="实体词库"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>实体</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>别名</TableHead>
            <TableHead>聚合</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.canonicalName}</TableCell>
              <TableCell>{entityTypeText(item.entityType)}</TableCell>
              <TableCell className="max-w-[360px] text-muted-foreground">
                {item.aliases.length > 0 ? item.aliases.join("、") : "无"}
              </TableCell>
              <TableCell>{item.includeInAggregation ? "纳入" : "不纳入"}</TableCell>
              <TableCell>
                <Switch
                  checked={item.enabled}
                  disabled={pendingKey === `status:entity:${item.id}`}
                  onCheckedChange={() => onToggle(item)}
                />
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  disabled={pendingKey === `delete:entity:${item.id}`}
                  onDelete={() => onDelete(item)}
                  onEdit={() => onEdit(item)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ConfigTableShell>
  );
}

function ConfigTableShell({
  actionText,
  children,
  description,
  extra,
  onCreate,
  title,
}: {
  actionText: string;
  children: ReactNode;
  description: string;
  extra?: ReactNode;
  onCreate: () => void;
  title: string;
}) {
  return (
    <section className="rounded-[8px] border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <Button onClick={onCreate} size="sm">
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={16} strokeWidth={1.8} />
            {actionText}
          </Button>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function RowActions({
  disabled,
  onDelete,
  onEdit,
}: {
  disabled?: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <Button aria-label="编辑" onClick={onEdit} size="icon" variant="ghost">
        <HugeiconsIcon color="currentColor" icon={Edit02Icon} size={16} strokeWidth={1.8} />
      </Button>
      <Button aria-label="删除" disabled={disabled} onClick={onDelete} size="icon" variant="ghost">
        <HugeiconsIcon color="currentColor" icon={Delete02Icon} size={16} strokeWidth={1.8} />
      </Button>
    </div>
  );
}

function RescanPanel({
  disabled,
  from,
  onChange,
  onCreate,
  state,
}: {
  disabled?: boolean;
  from: string;
  onChange: (value: string) => void;
  onCreate: () => void;
  state?: string;
}) {
  return (
    <section className="rounded-[8px] border bg-background">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">历史重刷</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          从指定时间重新生成逻辑会话和洞察结果，适合规则调整后的数据修正
        </p>
      </div>
      <div className="px-5 py-1">
        <section className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">重刷开始时间</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              只处理该时间之后的消息，时间范围越大任务耗时越长
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <div className="flex w-full items-center gap-2 md:justify-end">
              <Input
                className="h-10 md:w-56"
                onChange={(event) => onChange(event.target.value)}
                type="datetime-local"
                value={from}
              />
              <Button className="shrink-0" disabled={disabled} onClick={onCreate}>
                创建任务
              </Button>
            </div>
            {state ? <div className="text-right text-xs text-muted-foreground">{state}</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function ConfigMutationDialog({
  disabled,
  onOpenChange,
  onSubmit,
  state,
}: {
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  state: ConfigDialogState | null;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const open = state != null;

  useEffect(() => {
    if (!state) {
      setForm({});
      return;
    }

    setForm(buildInitialDialogForm(state));
  }, [state]);

  if (!state) {
    return null;
  }

  const title = `${state.mode === "create" ? "新增" : "编辑"}${collectionText(state.collection)}`;

  function setValue(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>配置保存后将影响后续会话分析</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
          {state.collection === "label" ? (
            <>
              <TextField form={form} label="标签名称" name="labelName" onChange={setValue} />
              <TextField form={form} label="标签编码" name="labelCode" onChange={setValue} />
              <TextareaField className="md:col-span-2" form={form} label="说明" name="description" onChange={setValue} />
              <TextareaField form={form} label="正例" name="positiveExamplesText" onChange={setValue} placeholder="每行一个例子" />
              <TextareaField form={form} label="反例" name="negativeExamplesText" onChange={setValue} placeholder="每行一个例子" />
              <SwitchEditorField checked={Boolean(form.enabled)} label="启用" onChange={(value) => setValue("enabled", value)} />
              <SwitchEditorField checked={Boolean(form.includeInStatistics)} label="纳入统计" onChange={(value) => setValue("includeInStatistics", value)} />
            </>
          ) : null}

          {state.collection === "qa" ? (
            <>
              <TextField form={form} label="规则名称" name="ruleName" onChange={setValue} />
              <TextField form={form} label="规则编码" name="ruleCode" onChange={setValue} />
              <SeverityField form={form} onChange={setValue} />
              <TextField form={form} label="适用场景" name="applicableScene" onChange={setValue} />
              <TextareaField className="md:col-span-2" form={form} label="判定标准" name="judgmentCriteria" onChange={setValue} />
              <TextareaField form={form} label="正例" name="positiveExamplesText" onChange={setValue} placeholder="每行一个例子" />
              <TextareaField form={form} label="反例" name="negativeExamplesText" onChange={setValue} placeholder="每行一个例子" />
              <SwitchEditorField checked={Boolean(form.enabled)} label="启用" onChange={(value) => setValue("enabled", value)} />
            </>
          ) : null}

          {state.collection === "risk" ? (
            <>
              <TextField form={form} label="风险名称" name="riskName" onChange={setValue} />
              <TextField form={form} label="风险编码" name="riskCode" onChange={setValue} />
              <SeverityField form={form} onChange={setValue} />
              <NumberEditorField form={form} label="优先级加权" name="priorityBoost" onChange={setValue} />
              <NumberEditorField form={form} label="未解决超时分钟" name="unresolvedTimeoutMinutes" onChange={setValue} />
              <TextareaField form={form} label="关键词" name="keywordsText" onChange={setValue} placeholder="每行一个关键词" />
              <TextareaField className="md:col-span-2" form={form} label="说明" name="description" onChange={setValue} />
              <SwitchEditorField checked={Boolean(form.enabled)} label="启用" onChange={(value) => setValue("enabled", value)} />
            </>
          ) : null}

          {state.collection === "entity" ? (
            <>
              <TextField form={form} label="实体名称" name="canonicalName" onChange={setValue} />
              <TextField form={form} label="实体类型" name="entityType" onChange={setValue} />
              <TextareaField className="md:col-span-2" form={form} label="别名" name="aliasesText" onChange={setValue} placeholder="每行一个别名" />
              <SwitchEditorField checked={Boolean(form.enabled)} label="启用" onChange={(value) => setValue("enabled", value)} />
              <SwitchEditorField checked={Boolean(form.includeInAggregation)} label="纳入聚合" onChange={(value) => setValue("includeInAggregation", value)} />
            </>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={disabled} onClick={() => onSubmit(normalizeDialogPayload(state.collection, form))}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function TextField({
  form,
  label,
  name,
  onChange,
}: {
  form: Record<string, unknown>;
  label: string;
  name: string;
  onChange: (name: string, value: string) => void;
}) {
  const id = `insight-field-${name}`;

  return (
    <Field htmlFor={id} label={label}>
      <Input
        id={id}
        onChange={(event) => onChange(name, event.target.value)}
        value={String(form[name] ?? "")}
      />
    </Field>
  );
}

function TextareaField({
  className,
  form,
  label,
  name,
  onChange,
  placeholder,
}: {
  className?: string;
  form: Record<string, unknown>;
  label: string;
  name: string;
  onChange: (name: string, value: string) => void;
  placeholder?: string;
}) {
  const id = `insight-field-${name}`;

  return (
    <div className={className}>
      <Field htmlFor={id} label={label}>
        <Textarea
          className="min-h-24"
          id={id}
          onChange={(event) => onChange(name, event.target.value)}
          placeholder={placeholder}
          value={String(form[name] ?? "")}
        />
      </Field>
    </div>
  );
}

function NumberEditorField({
  form,
  label,
  name,
  onChange,
}: {
  form: Record<string, unknown>;
  label: string;
  name: string;
  onChange: (name: string, value: number | undefined) => void;
}) {
  const id = `insight-field-${name}`;

  return (
    <Field htmlFor={id} label={label}>
      <Input
        id={id}
        min={0}
        onChange={(event) =>
          onChange(name, event.target.value === "" ? undefined : Number(event.target.value))
        }
        type="number"
        value={form[name] == null ? "" : Number(form[name])}
      />
    </Field>
  );
}

function SeverityField({
  form,
  onChange,
}: {
  form: Record<string, unknown>;
  onChange: (name: string, value: "high" | "low" | "medium") => void;
}) {
  return (
    <Field label="严重度">
      <Select
        onValueChange={(value: "high" | "low" | "medium") => onChange("severity", value)}
        value={String(form.severity ?? "medium")}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="high">高</SelectItem>
          <SelectItem value="medium">中</SelectItem>
          <SelectItem value="low">低</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SwitchEditorField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-[8px] border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PrimaryText({ main, sub }: { main: string; sub?: string }) {
  return (
    <div>
      <div className="font-medium">{main}</div>
      {sub ? <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "high" | "low" | "medium" }) {
  const className =
    severity === "high"
      ? "border-red-200 bg-red-50 text-red-700"
      : severity === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <Badge className={className} variant="outline">
      {severityText(severity)}
    </Badge>
  );
}

function buildInitialDialogForm(state: ConfigDialogState): Record<string, unknown> {
  if (state.collection === "label") {
    const item = state.mode === "edit" ? state.item : undefined;
    return {
      description: item?.description ?? "",
      enabled: item?.enabled ?? true,
      includeInStatistics: item?.includeInStatistics ?? true,
      labelCode: item?.labelCode ?? "",
      labelName: item?.labelName ?? "",
      negativeExamplesText: (item?.negativeExamples ?? []).join("\n"),
      positiveExamplesText: (item?.positiveExamples ?? []).join("\n"),
    };
  }

  if (state.collection === "qa") {
    const item = state.mode === "edit" ? state.item : undefined;
    return {
      applicableScene: item?.applicableScene ?? "",
      description: item?.description ?? "",
      enabled: item?.enabled ?? true,
      judgmentCriteria: item?.judgmentCriteria ?? "",
      negativeExamplesText: (item?.negativeExamples ?? []).join("\n"),
      positiveExamplesText: (item?.positiveExamples ?? []).join("\n"),
      ruleCode: item?.ruleCode ?? "",
      ruleName: item?.ruleName ?? "",
      severity: item?.severity ?? "medium",
    };
  }

  if (state.collection === "risk") {
    const item = state.mode === "edit" ? state.item : undefined;
    return {
      description: item?.description ?? "",
      enabled: item?.enabled ?? true,
      keywordsText: (item?.keywords ?? []).join("\n"),
      priorityBoost: item?.priorityBoost ?? 0,
      riskCode: item?.riskCode ?? "",
      riskName: item?.riskName ?? "",
      severity: item?.severity ?? "medium",
      unresolvedTimeoutMinutes: item?.unresolvedTimeoutMinutes,
    };
  }

  const item = state.mode === "edit" ? state.item : undefined;
  return {
    aliasesText: (item?.aliases ?? []).join("\n"),
    canonicalName: item?.canonicalName ?? "",
    enabled: item?.enabled ?? true,
    entityType: item?.entityType ?? "product",
    includeInAggregation: item?.includeInAggregation ?? true,
  };
}

function normalizeDialogPayload(collection: MutableCollection, form: Record<string, unknown>) {
  if (collection === "label") {
    return {
      description: trimOptional(form.description),
      enabled: Boolean(form.enabled),
      includeInStatistics: Boolean(form.includeInStatistics),
      labelCode: String(form.labelCode ?? "").trim(),
      labelName: String(form.labelName ?? "").trim(),
      negativeExamples: splitLines(form.negativeExamplesText),
      positiveExamples: splitLines(form.positiveExamplesText),
    };
  }

  if (collection === "qa") {
    return {
      applicableScene: trimOptional(form.applicableScene),
      description: trimOptional(form.description),
      enabled: Boolean(form.enabled),
      judgmentCriteria: trimOptional(form.judgmentCriteria),
      negativeExamples: splitLines(form.negativeExamplesText),
      positiveExamples: splitLines(form.positiveExamplesText),
      ruleCode: String(form.ruleCode ?? "").trim(),
      ruleName: String(form.ruleName ?? "").trim(),
      severity: normalizeSeverityFormValue(form.severity),
    };
  }

  if (collection === "risk") {
    return {
      description: trimOptional(form.description),
      enabled: Boolean(form.enabled),
      keywords: splitLines(form.keywordsText),
      priorityBoost: Number(form.priorityBoost ?? 0),
      riskCode: String(form.riskCode ?? "").trim(),
      riskName: String(form.riskName ?? "").trim(),
      severity: normalizeSeverityFormValue(form.severity),
      unresolvedTimeoutMinutes: form.unresolvedTimeoutMinutes == null
        ? undefined
        : Number(form.unresolvedTimeoutMinutes),
    };
  }

  return {
    aliases: splitLines(form.aliasesText),
    canonicalName: String(form.canonicalName ?? "").trim(),
    enabled: Boolean(form.enabled),
    entityType: String(form.entityType ?? "").trim(),
    includeInAggregation: Boolean(form.includeInAggregation),
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => current.id === item.id ? item : current)
    : [...items, item];
}

function splitLines(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function trimOptional(value: unknown) {
  const next = String(value ?? "").trim();
  return next || undefined;
}

function normalizeSeverityFormValue(value: unknown): "high" | "low" | "medium" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function presetText(value: InsightSessionizationSettings["preset"]) {
  return value === "realtime_service" ? "实时客服" : value === "private_domain" ? "私域运营" : "自定义";
}

function collectionText(value: MutableCollection) {
  const text: Record<MutableCollection, string> = {
    entity: "实体",
    label: "标签",
    qa: "规则",
    risk: "风险项",
  };

  return text[value];
}

function severityText(value: "high" | "low" | "medium") {
  return value === "high" ? "高" : value === "medium" ? "中" : "低";
}

function entityTypeText(value: string) {
  const text: Record<string, string> = {
    activity: "活动",
    brand: "品牌",
    product: "商品",
  };

  return text[value] ?? value;
}

function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getErrorMessage(error: unknown) {
  if (isRequestError(error)) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}
