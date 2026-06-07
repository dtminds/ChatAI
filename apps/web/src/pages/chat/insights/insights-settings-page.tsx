import {
  Add01Icon,
  AiContentGenerator01Icon,
  AiGenerativeIcon,
  BubbleChatIcon,
  ChartAreaIcon,
  ClipboardCheckIcon,
  Delete02Icon,
  Edit02Icon,
  AiIdeaIcon,
  AiSecurity02Icon,
  AppleIntelligenceIcon,
  Search01Icon,
  Setting07Icon,
  UserAiIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  InsightAnalysisPolicy,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightFeatureConfig,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanAnalysisScope,
  InsightRescanTask,
  InsightSettingsSummaryResponse,
  InsightSessionizationSettings,
} from "@chatai/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Slider } from "@/components/ui/slider";
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
  createInsightIntentConfig,
  createInsightLabelConfig,
  createInsightQaRuleConfig,
  createInsightRescanJob,
  deleteInsightEntityDictionaryItem,
  deleteInsightIntentConfig,
  deleteInsightLabelConfig,
  deleteInsightQaRuleConfig,
  getInsightRescanTasks,
  getInsightSettingsSummary,
  getInsightPolicyAndSessionization,
  getInsightFeatureConfig,
  listInsightIntentConfigs,
  listInsightLabelConfigs,
  listInsightQaRuleConfigs,
  listInsightEntityDictionary,
  updateInsightAnalysisPolicy,
  updateInsightEntityDictionaryItem,
  updateInsightEntityDictionaryItemStatus,
  updateInsightFeatureConfig,
  updateInsightIntentConfig,
  updateInsightIntentConfigStatus,
  updateInsightLabelConfig,
  updateInsightLabelConfigStatus,
  updateInsightQaRuleConfig,
  updateInsightQaRuleConfigStatus,
  updateInsightSessionizationSettings,
} from "./api/insights-service";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import { InsightTablePagination } from "./insight-table-pagination";

type MutableCollection = "entity" | "intent" | "label" | "qa";
type ConfigDialogErrors = Partial<Record<string, string>>;

type TabData =
  | { tab: "policy"; analysisPolicy: InsightAnalysisPolicy; sessionization: InsightSessionizationSettings }
  | { tab: "intents"; items: InsightIntentConfig[] }
  | { tab: "labels"; items: InsightLabelConfig[] }
  | { tab: "qa"; items: InsightQaRuleConfig[] }
  | { tab: "entities"; items: InsightEntityDictionaryItem[] }
  | { tab: "rescan"; items: InsightRescanTask[]; total: number; page: number };

type MutableTabData = Extract<TabData, { tab: "entities" | "intents" | "labels" | "qa" }>;
type ConfigItem =
  | InsightEntityDictionaryItem
  | InsightIntentConfig
  | InsightLabelConfig
  | InsightQaRuleConfig;

type ConfigDialogState =
  | { collection: "label"; mode: "create" }
  | { collection: "label"; item: InsightLabelConfig; mode: "edit" }
  | { collection: "intent"; mode: "create" }
  | { collection: "intent"; item: InsightIntentConfig; mode: "edit" }
  | { collection: "qa"; mode: "create" }
  | { collection: "qa"; item: InsightQaRuleConfig; mode: "edit" }
  | { collection: "entity"; mode: "create" }
  | { collection: "entity"; item: InsightEntityDictionaryItem; mode: "edit" };

type DeleteConfirmState = {
  collection: MutableCollection;
  id: string;
  name: string;
};

const analysisFrequencyPresets = [
  {
    description: "兼顾时效性和成本",
    label: "标准（推荐）",
    liveMinIntervalMinutes: 20,
    liveMinNewMeaningfulMessages: 12,
    value: "stable",
  },
  {
    description: "追求更优的时效性，成本略有提升",
    label: "较快",
    liveMinIntervalMinutes: 10,
    liveMinNewMeaningfulMessages: 8,
    value: "standard",
  },
  {
    description: "更早发现风险和待办，对成本不敏感时开启",
    label: "高频",
    liveMinIntervalMinutes: 5,
    liveMinNewMeaningfulMessages: 4,
    value: "fast",
  },
] as const;

type AnalysisFrequencyPresetValue = (typeof analysisFrequencyPresets)[number]["value"];

const insightPolicyOptionLimits = {
  analysisDelayMinutes: [5, 10, 20, 30],
  hardMaxDurationHours: [2, 4, 6, 8, 12, 24],
} as const;

const intentWeightOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const rescanScopeOptions: Array<{
  description: string;
  label: string;
  value: InsightRescanAnalysisScope;
}> = [
  {
    description: "重新识别标签、实体和意图，适合调整标签体系、实体词库或意图配置后使用。",
    label: "标签 / 实体 / 意图",
    value: "classification",
  },
  {
    description: "只重新评估服务质检结果，适合新增或调整质检规则后使用。",
    label: "服务质检",
    value: "qaFindings",
  },
  {
    description: "重新生成该时间范围内的全部洞察结果，适合配置整体调整后使用，耗时最长。",
    label: "全量重刷",
    value: "all",
  },
];

export function InsightsSettingsPage() {
  const role = useAuthStore((state) => state.subUser?.role);
  const [dialogState, setDialogState] = useState<ConfigDialogState | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<DeleteConfirmState | null>(null);
  const [entityQuery, setEntityQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string>();
  const [rescanDialogOpen, setRescanDialogOpen] = useState(false);
  const [rescanFrom, setRescanFrom] = useState(() => toDateTimeLocalValue(Date.now() - 24 * 60 * 60 * 1000));
  const [rescanScope, setRescanScope] = useState<InsightRescanAnalysisScope>("classification");
  const [settingsTab, setSettingsTab] = useState("policy");
  const [summary, setSummary] = useState<InsightSettingsSummaryResponse>();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [tabData, setTabData] = useState<TabData>();
  const [tabLoading, setTabLoading] = useState(false);
  const canAccessSettings = role === "owner" || role === "admin";

  async function refreshSummary() {
    setSummaryLoading(true);

    try {
      const result = await getInsightSettingsSummary();
      setSummary(result);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccessSettings) {
      return;
    }

    let ignore = false;

    async function load() {
      try {
        const result = await getInsightSettingsSummary();

        if (!ignore) {
          setSummary(result);
        }
      } catch (error) {
        if (!ignore) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setSummaryLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [canAccessSettings]);

  useEffect(() => {
    if (!canAccessSettings) {
      return;
    }

    let ignore = false;

    async function load() {
      setTabLoading(true);

      try {
        if (settingsTab === "policy") {
          const result = await getInsightPolicyAndSessionization();

          if (!ignore) {
            setTabData({ tab: "policy", ...result });
          }
        } else if (settingsTab === "intents") {
          const items = await listInsightIntentConfigs();

          if (!ignore) {
            setTabData({ tab: "intents", items });
          }
        } else if (settingsTab === "labels") {
          const items = await listInsightLabelConfigs();

          if (!ignore) {
            setTabData({ tab: "labels", items });
          }
        } else if (settingsTab === "qa") {
          const items = await listInsightQaRuleConfigs();

          if (!ignore) {
            setTabData({ tab: "qa", items });
          }
        } else if (settingsTab === "entities") {
          const items = await listInsightEntityDictionary();

          if (!ignore) {
            setTabData({ tab: "entities", items });
          }
        } else if (settingsTab === "rescan") {
          const result = await getInsightRescanTasks(1, 10);

          if (!ignore) {
            setTabData({ tab: "rescan", items: result.items, total: result.total, page: 1 });
          }
        }
      } catch (error) {
        if (!ignore) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setTabLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [canAccessSettings, settingsTab]);

  const filteredEntities = useMemo(() => {
    if (tabData?.tab !== "entities") {
      return [];
    }

    const query = entityQuery.trim().toLowerCase();

    if (!query) {
      return tabData.items;
    }

    return tabData.items.filter((item) =>
      [item.canonicalName, item.entityType, item.aliases.join(" ")].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [tabData, entityQuery]);

  async function handleInsightPolicySubmit(payload: {
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  }) {
    setPendingKey("insight-policy");

    try {
      const [sessionization, analysisPolicy] = await Promise.all([
        updateInsightSessionizationSettings(payload.sessionization),
        updateInsightAnalysisPolicy(payload.analysisPolicy),
      ]);

      setTabData({ tab: "policy", analysisPolicy, sessionization });
      await refreshSummary();
      toast.success("洞察策略已保存");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleFeatureConfigChange(next: InsightFeatureConfig) {
    setPendingKey("feature-config");

    try {
      const featureConfig = await updateInsightFeatureConfig({
        entityEnabled: next.entityEnabled,
        insightEnabled: next.insightEnabled,
        intentEnabled: next.intentEnabled,
        labelEnabled: next.labelEnabled,
        qaEnabled: next.qaEnabled,
        todoEnabled: next.todoEnabled,
      });

      await refreshSummary();
      toast.success(featureConfig.insightEnabled ? "会话洞察已开启" : "会话洞察已暂停");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleStatusToggle(collection: MutableCollection, id: string, status: 0 | 1) {
    setPendingKey(`status:${collection}:${id}`);

    try {
      let updatedItem: { id: string; status: -1 | 0 | 1 } | undefined;

      if (collection === "label") {
        updatedItem = await updateInsightLabelConfigStatus(id, { status });
      } else if (collection === "intent") {
        updatedItem = await updateInsightIntentConfigStatus(id, { status });
      } else if (collection === "qa") {
        updatedItem = await updateInsightQaRuleConfigStatus(id, { status });
      } else {
        updatedItem = await updateInsightEntityDictionaryItemStatus(id, { status });
      }

      if (updatedItem) {
        updateCurrentTabItems((items) =>
          items.map((item) => item.id === updatedItem.id ? { ...item, ...updatedItem } : item),
        );
        await refreshSummary();
      }

      toast.success(status === 1 ? "已启用" : "已停用");
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
      } else if (collection === "intent") {
        await deleteInsightIntentConfig(id);
      } else if (collection === "qa") {
        await deleteInsightQaRuleConfig(id);
      } else {
        await deleteInsightEntityDictionaryItem(id);
      }

      updateCurrentTabItems((items) => items.filter((item) => item.id !== id));
      await refreshSummary();
      toast.success("配置已删除");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmState) {
      return;
    }

    await handleDelete(deleteConfirmState.collection, deleteConfirmState.id);
    setDeleteConfirmState(null);
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

        upsertCurrentTabItem(next);
      } else if (dialogState.collection === "intent") {
        const next = dialogState.mode === "create"
          ? await createInsightIntentConfig(payload as InsightIntentConfigMutationRequest)
          : await updateInsightIntentConfig(
            dialogState.item.id,
            payload as InsightIntentConfigMutationRequest,
          );

        upsertCurrentTabItem(next);
      } else if (dialogState.collection === "qa") {
        const next = dialogState.mode === "create"
          ? await createInsightQaRuleConfig(payload as InsightQaRuleConfigMutationRequest)
          : await updateInsightQaRuleConfig(
            dialogState.item.id,
            payload as InsightQaRuleConfigMutationRequest,
          );

        upsertCurrentTabItem(next);
      } else {
        const next = dialogState.mode === "create"
          ? await createInsightEntityDictionaryItem(payload as InsightEntityDictionaryMutationRequest)
          : await updateInsightEntityDictionaryItem(
            dialogState.item.id,
            payload as InsightEntityDictionaryMutationRequest,
          );

        upsertCurrentTabItem(next);
      }

      await refreshSummary();
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
      await createInsightRescanJob({
        analysisScope: rescanScope,
        from: new Date(rescanFrom).toISOString(),
      });
      const result = await getInsightRescanTasks(1, 10);

      setTabData({ tab: "rescan", items: result.items, total: result.total, page: 1 });
      setRescanDialogOpen(false);
      toast.success("历史重刷任务已创建");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingKey(undefined);
    }
  }

  async function handleRescanPageChange(page: number) {
    setTabLoading(true);

    try {
      const result = await getInsightRescanTasks(page, 10);

      setTabData({ tab: "rescan", items: result.items, total: result.total, page });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setTabLoading(false);
    }
  }

  function upsertCurrentTabItem(item: ConfigItem) {
    updateCurrentTabItems((items) => {
      const exists = items.some((current) => current.id === item.id);

      return exists
        ? items.map((current) => current.id === item.id ? item : current)
        : [...items, item];
    });
  }

  function updateCurrentTabItems(
    updater: (items: ConfigItem[]) => ConfigItem[],
  ) {
    setTabData((current) => {
      if (!isMutableTabData(current)) {
        return current;
      }

      return { ...current, items: updater(current.items) } as MutableTabData;
    });
  }

  if (!canAccessSettings) {
    return (
      <InsightsLayout title="洞察配置">
        <div className="rounded-[8px] border bg-background p-8 text-center">
          <h2 className="text-lg font-semibold">仅管理员可查看洞察配置</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            数据页仍按登录账号权限开放，配置页需要管理员角色
          </p>
        </div>
      </InsightsLayout>
    );
  }

  const policyData = tabData?.tab === "policy" ? tabData : undefined;
  const intentsData = tabData?.tab === "intents" ? tabData : undefined;
  const labelsData = tabData?.tab === "labels" ? tabData : undefined;
  const qaData = tabData?.tab === "qa" ? tabData : undefined;
  const entitiesData = tabData?.tab === "entities" ? tabData : undefined;
  const rescanData = tabData?.tab === "rescan" ? tabData : undefined;

  return (
    <InsightsLayout title="洞察配置">
      <div className="space-y-5">
        <InsightsPageHeader
          actions={(
            <InsightRunStatusControl
              disabled={summaryLoading || pendingKey === "feature-config"}
              insightAvailable={summary?.insightAvailable}
              insightEnabled={summary?.insightEnabled ?? false}
              onFeatureConfigChange={(next) => void handleFeatureConfigChange(next)}
            />
          )}
          description="个性化调整洞察策略、标签、质检规则和实体词库"
          title="洞察配置"
        />
        {summary ? <SettingsSummary summary={summary} /> : null}

        <Tabs className="gap-4" onValueChange={setSettingsTab} value={settingsTab}>
          <div className="flex items-center justify-between gap-4 border-b border-divider">
            <TabsList className="h-auto min-w-0 flex-1 justify-start gap-8 overflow-x-auto rounded-none bg-transparent p-0 text-muted-foreground">
              <SettingsTabTrigger value="policy">洞察策略</SettingsTabTrigger>
              <SettingsTabTrigger value="intents">意图配置</SettingsTabTrigger>
              <SettingsTabTrigger value="labels">标签体系</SettingsTabTrigger>
              <SettingsTabTrigger value="qa">质检规则</SettingsTabTrigger>
              <SettingsTabTrigger value="entities">实体词库</SettingsTabTrigger>
              <SettingsTabTrigger value="rescan">历史重刷</SettingsTabTrigger>
            </TabsList>
          </div>

          <TabsContent value="policy">
            {policyData ? (
              <InsightPolicyPanel
                analysisPolicy={policyData.analysisPolicy}
                disabled={tabLoading || pendingKey === "insight-policy"}
                onSubmit={(payload) => void handleInsightPolicySubmit(payload)}
                sessionization={policyData.sessionization}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
          </TabsContent>

          <TabsContent value="intents">
            {intentsData ? (
              <IntentConfigTable
                items={intentsData.items}
                onCreate={() => setDialogState({ collection: "intent", mode: "create" })}
                onDelete={(item) => setDeleteConfirmState({
                  collection: "intent",
                  id: item.id,
                  name: item.intentName,
                })}
                onEdit={(item) => setDialogState({ collection: "intent", item, mode: "edit" })}
                onToggle={(item) => void handleStatusToggle("intent", item.id, item.status === 1 ? 0 : 1)}
                pendingKey={pendingKey}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
          </TabsContent>

          <TabsContent value="labels">
            {labelsData ? (
              <LabelConfigTable
                items={labelsData.items}
                onCreate={() => setDialogState({ collection: "label", mode: "create" })}
                onDelete={(item) => setDeleteConfirmState({
                  collection: "label",
                  id: item.id,
                  name: item.labelName,
                })}
                onEdit={(item) => setDialogState({ collection: "label", item, mode: "edit" })}
                onToggle={(item) => void handleStatusToggle("label", item.id, item.status === 1 ? 0 : 1)}
                pendingKey={pendingKey}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
          </TabsContent>

          <TabsContent value="qa">
            {qaData ? (
              <QaRuleConfigTable
                items={qaData.items}
                onCreate={() => setDialogState({ collection: "qa", mode: "create" })}
                onDelete={(item) => setDeleteConfirmState({
                  collection: "qa",
                  id: item.id,
                  name: item.ruleName,
                })}
                onEdit={(item) => setDialogState({ collection: "qa", item, mode: "edit" })}
                onToggle={(item) => void handleStatusToggle("qa", item.id, item.status === 1 ? 0 : 1)}
                pendingKey={pendingKey}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
          </TabsContent>

          <TabsContent value="entities">
            {entitiesData ? (
              <EntityDictionaryTable
                items={filteredEntities}
                onCreate={() => setDialogState({ collection: "entity", mode: "create" })}
                onDelete={(item) => setDeleteConfirmState({
                  collection: "entity",
                  id: item.id,
                  name: item.canonicalName,
                })}
                onEdit={(item) => setDialogState({ collection: "entity", item, mode: "edit" })}
                onQueryChange={setEntityQuery}
                onToggle={(item) => void handleStatusToggle("entity", item.id, item.status === 1 ? 0 : 1)}
                pendingKey={pendingKey}
                query={entityQuery}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
          </TabsContent>

          <TabsContent value="rescan">
            {rescanData ? (
              <RescanPanel
                disabled={pendingKey === "rescan" || tabLoading}
                onCreateClick={() => setRescanDialogOpen(true)}
                onPageChange={(page) => void handleRescanPageChange(page)}
                page={rescanData.page}
                tasks={rescanData.items}
                total={rescanData.total}
              />
            ) : (
              <TabLoadingPlaceholder />
            )}
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
      <DeleteConfirmDialog
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmState(null);
          }
        }}
        pendingKey={pendingKey}
        state={deleteConfirmState}
      />
      <RescanCreateDialog
        disabled={pendingKey === "rescan"}
        from={rescanFrom}
        onChange={setRescanFrom}
        onCreate={() => void createRescan()}
        onOpenChange={setRescanDialogOpen}
        onScopeChange={setRescanScope}
        open={rescanDialogOpen}
        scope={rescanScope}
      />
    </InsightsLayout>
  );
}

function isMutableTabData(data: TabData | undefined): data is MutableTabData {
  return data?.tab === "entities"
    || data?.tab === "intents"
    || data?.tab === "labels"
    || data?.tab === "qa";
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

function TabLoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-16" role="status">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        <span>正在加载</span>
      </span>
    </div>
  );
}

function InsightRunStatusControl({
  disabled,
  insightAvailable,
  insightEnabled,
  onFeatureConfigChange,
}: {
  disabled: boolean;
  insightAvailable?: boolean;
  insightEnabled: boolean;
  onFeatureConfigChange: (next: InsightFeatureConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [featureConfig, setFeatureConfig] = useState<InsightFeatureConfig>();
  const [loadingConfig, setLoadingConfig] = useState(false);

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen && !featureConfig) {
      setLoadingConfig(true);

      try {
        const config = await getInsightFeatureConfig();

        setFeatureConfig(config);
      } catch (error) {
        toast.error(getErrorMessage(error));
        setOpen(false);
      } finally {
        setLoadingConfig(false);
      }
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant={insightEnabled ? "default" : "secondary"}>{insightEnabled ? "运行中" : "未运行"}</Badge>
        <Button
          aria-label="配置洞察运行"
          className="size-9 p-0"
          disabled={disabled}
          onClick={() => void handleOpenChange(true)}
          variant="outline"
        >
          <HugeiconsIcon icon={Setting07Icon} size={18} />
        </Button>
      </div>
      {featureConfig ? (
        <InsightRunConfigDialog
          disabled={disabled || loadingConfig}
          featureConfig={featureConfig}
          onOpenChange={handleOpenChange}
          onSubmit={(next) => {
            setFeatureConfig(next);
            onFeatureConfigChange(next);
            setOpen(false);
          }}
          open={open}
        />
      ) : null}
    </>
  );
}

function InsightRunConfigDialog({
  disabled,
  featureConfig,
  onOpenChange,
  onSubmit,
  open,
}: {
  disabled: boolean;
  featureConfig: InsightFeatureConfig;
  onOpenChange: (open: boolean) => void;
  onSubmit: (next: InsightFeatureConfig) => void;
  open: boolean;
}) {
  const [form, setForm] = useState(featureConfig);
  const insightAvailable = featureConfig.insightAvailable !== false;

  useEffect(() => {
    if (open) {
      setForm(featureConfig);
    }
  }, [featureConfig, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>洞察运行配置</DialogTitle>
          <DialogDescription>
            控制是否自动分析你的会话，以及后续要生成哪些洞察结果
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-[8px] border bg-background">
            <RunSettingRow
              checked={form.insightEnabled}
              description={insightAvailable ? "开启后，系统会自动同步新会话，完成切片并生成洞察" : "当前账号暂未开通会话洞察"}
              disabled={disabled || !insightAvailable}
              icon={AiIdeaIcon}
              label="启用会话洞察"
              onCheckedChange={(checked) => setForm((current) => ({ ...current, insightEnabled: checked }))}
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-foreground">能力开关</div>
            <div className="overflow-hidden rounded-[8px] border bg-background">
              <RunSettingRow
                checked={form.todoEnabled}
                description="识别到需要人工跟进的事项后，自动生成待办"
                disabled={disabled}
                icon={AiContentGenerator01Icon}
                label="智能创建待办"
                onCheckedChange={(checked) => setForm((current) => ({ ...current, todoEnabled: checked }))}
              />
              <RunSettingRow
                checked={form.intentEnabled}
                description="根据已配置的意图体系，为后续会话抽取客户意图"
                disabled={disabled}
                icon={UserAiIcon}
                label="智能意图识别"
                onCheckedChange={(checked) => setForm((current) => ({ ...current, intentEnabled: checked }))}
              />
              <RunSettingRow
                checked={form.qaEnabled}
                description="依据已配置的质检规则，逐条审计服务过程是否合规，并输出判定理由"
                disabled={disabled}
                icon={AiSecurity02Icon}
                label="智能质检"
                onCheckedChange={(checked) => setForm((current) => ({ ...current, qaEnabled: checked }))}
              />
              <RunSettingRow
                checked={form.entityEnabled}
                description="从会话中识别商品、活动、服务等业务主体"
                disabled={disabled}
                icon={AppleIntelligenceIcon}
                label="智能实体识别"
                onCheckedChange={(checked) => setForm((current) => ({ ...current, entityEnabled: checked }))}
              />
              <RunSettingRow
                checked={form.labelEnabled}
                description="根据标签体系提炼会话特征，用于统计和筛选"
                disabled={disabled}
                icon={AiGenerativeIcon}
                label="智能标签"
                onCheckedChange={(checked) => setForm((current) => ({ ...current, labelEnabled: checked }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={disabled} variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={disabled} onClick={() => onSubmit(form)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunSettingRow({
  checked,
  description,
  disabled,
  icon,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: typeof Setting07Icon;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0">
      <span className="flex size-10 shrink-0 items-center justify-center text-muted-foreground">
        <HugeiconsIcon color="currentColor" icon={icon} size={22} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-6 text-foreground">{label}</div>
        <div className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</div>
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function SettingsSummary({ summary }: { summary: InsightSettingsSummaryResponse }) {
  const stats = [
    { icon: BubbleChatIcon, label: "切分规则", value: `${summary.sessionizationIdleMinutes} 分钟结束` },
    { icon: ChartAreaIcon, label: "提前分析", value: summary.liveAnalysisEnabled ? "开启" : "关闭" },
    { icon: Search01Icon, label: "启用意图", value: `${summary.enabledIntentCount} 个` },
    { icon: Setting07Icon, label: "启用标签", value: `${summary.enabledLabelCount} 个` },
    { icon: ClipboardCheckIcon, label: "质检规则", value: `${summary.enabledQaCount} 条` },
    { icon: UserGroupIcon, label: "启用实体", value: `${summary.entityCount} 个` },
  ];

  return (
    <section aria-label="洞察配置概览" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
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

function InsightPolicyPanel({
  analysisPolicy,
  disabled,
  onSubmit,
  sessionization,
}: {
  analysisPolicy: InsightAnalysisPolicy;
  disabled: boolean;
  onSubmit: (value: {
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  }) => void;
  sessionization: InsightSessionizationSettings;
}) {
  const [analysisForm, setAnalysisForm] = useState(analysisPolicy);
  const [sessionizationForm, setSessionizationForm] = useState(() =>
    normalizeSessionizationSettings(sessionization),
  );
  const baselineAnalysisPolicy = useMemo(
    () => normalizeAnalysisPolicyForCompare(analysisPolicy),
    [analysisPolicy],
  );
  const baselineSessionization = useMemo(
    () => normalizeSessionizationSettings(sessionization),
    [sessionization],
  );
  const isDirty = !isInsightPolicySame({
    analysisPolicy: analysisForm,
    sessionization: sessionizationForm,
  }, {
    analysisPolicy: baselineAnalysisPolicy,
    sessionization: baselineSessionization,
  });

  useEffect(() => setAnalysisForm(analysisPolicy), [analysisPolicy]);
  useEffect(() => setSessionizationForm(baselineSessionization), [baselineSessionization]);

function updateSessionizationValue<Key extends keyof Omit<InsightSessionizationSettings, "preset">>(
    key: Key,
    nextValue: InsightSessionizationSettings[Key],
  ) {
    setSessionizationForm((current) => ({
      ...current,
      [key]: nextValue,
      ...(key === "analysisDelayMinutes" ? { lateArrivalWindowMinutes: nextValue } : {}),
      preset: "custom",
    }));
  }

  function updateFrequency(value: AnalysisFrequencyPresetValue) {
    const preset = analysisFrequencyPresets.find((item) => item.value === value);

    if (!preset) {
      return;
    }

    setAnalysisForm((current) => ({
      ...current,
      liveMinIntervalMinutes: preset.liveMinIntervalMinutes,
      liveMinNewMeaningfulMessages: preset.liveMinNewMeaningfulMessages,
    }));
  }

  return (
    <FormPanel
      onSubmit={() =>
        onSubmit({
          analysisPolicy: {
            ...analysisForm,
            finalAnalysisEnabled: true,
            ruleFallbackEnabled: true,
          },
          sessionization: {
            ...sessionizationForm,
            lateArrivalWindowMinutes: sessionizationForm.analysisDelayMinutes,
          },
        })}
    >
      <SettingsSection title="会话切分规则">
        <PresetSelectRow
          description="空闲多久后结束本轮服务；越短越快出结果，越长上下文越完整"
          label="会话空闲多久后视为结束"
          onChange={(idleTimeoutMinutes) => updateSessionizationValue("idleTimeoutMinutes", idleTimeoutMinutes)}
          options={[60, 120, 240]}
          suffix="分钟"
          value={sessionizationForm.idleTimeoutMinutes}
        />
        <PresetSelectRow
          description="单轮服务最长持续多久；超过后会自动拆分，避免上下文过长"
          label="单轮会话最长持续"
          onChange={(hardMaxDurationHours) => updateSessionizationValue("hardMaxDurationHours", hardMaxDurationHours)}
          options={[2, 4, 6, 8, 12, 24]}
          suffix="小时"
          value={sessionizationForm.hardMaxDurationHours}
        />
        <PresetSelectRow
          description="会话结束后多久生成最终结果；等待越久越能覆盖补充消息"
          label="会话结束后多久生成最终结果"
          onChange={(analysisDelayMinutes) => updateSessionizationValue("analysisDelayMinutes", analysisDelayMinutes)}
          options={[5, 10, 20, 30]}
          suffix="分钟"
          value={sessionizationForm.analysisDelayMinutes}
        />
      </SettingsSection>

      <SettingsSection title="未完结会话">
        <BooleanSettingRow
          checked={analysisForm.liveAnalysisEnabled}
          description="会话未结束时提前生成风险、待办和问题判断"
          label="未完结会话提前分析"
          onChange={(liveAnalysisEnabled) => setAnalysisForm((current) => ({ ...current, liveAnalysisEnabled }))}
        />
        {analysisForm.liveAnalysisEnabled ? (
          <FrequencyPresetRow
            description="高频更及时，标准可减少重复判断"
            label="未完结会话分析频率"
            onChange={updateFrequency}
            value={detectAnalysisFrequencyPreset(analysisForm)}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="低可信提示">
        <SliderSettingRow
          description="阈值越高，越多结果会提示人工复核"
          label="低可信提示阈值"
          onChange={(lowConfidenceThreshold) => setAnalysisForm((current) => ({ ...current, lowConfidenceThreshold }))}
          value={analysisForm.lowConfidenceThreshold}
        />
      </SettingsSection>

      <div className="flex justify-end">
        <Button className="min-w-24" disabled={disabled || !isDirty} type="submit">
          保存
        </Button>
      </div>

      <SessionizationTimeline settings={sessionizationForm} />
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
      title: "咨询会话结束",
    },
    {
      description: `再等待 ${settings.analysisDelayMinutes} 分钟，启动 AI 洞察分析`,
      title: "启动分析",
    },
  ];

  return (
    <section className="mt-2 border-t border-dashed pt-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">分析时序预览</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            展示当前策略下从最后一条消息到 AI 洞察生成的关键节点
          </p>
        </div>
        <div className="hidden rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary md:block">
          {settings.hardMaxDurationHours} 小时自动拆分
        </div>
      </div>
      <div className="relative grid gap-5 md:grid-cols-3 md:gap-8">
        <span className="absolute left-6 right-6 top-4 hidden h-px bg-gradient-to-r from-primary/20 via-border to-primary/20 md:block" />
        {steps.map((step, index) => (
          <div className="relative" key={step.title}>
            <div className="mb-3 flex size-8 items-center justify-center rounded-full border bg-surface text-xs font-semibold text-foreground shadow-sm">
              {index + 1}
            </div>
            <div className="pl-0.5">
              <div className="text-sm font-medium text-foreground">{step.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs leading-5 text-muted-foreground md:text-right">
        会话结束后 {settings.analysisDelayMinutes} 分钟生成最终结果
      </div>
    </section>
  );
}

function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-[8px] border bg-background">{children}</div>
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
    <section className="grid gap-4 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_10rem] md:items-center">
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
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </SettingsRow>
  );
}

function PresetSelectRow({
  description,
  label,
  onChange,
  options,
  renderOption,
  suffix,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: number) => void;
  options: number[];
  renderOption?: (value: number) => string;
  suffix?: string;
  value: number;
}) {
  const formatOption = (option: number) => renderOption?.(option) ?? (suffix ? `${option} ${suffix}` : String(option));

  return (
    <SettingsRow description={description} label={label}>
      <Select onValueChange={(next) => onChange(Number(next))} value={String(value)}>
        <SelectTrigger aria-label={label} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {formatOption(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

function FrequencyPresetRow({
  description,
  label,
  onChange,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: AnalysisFrequencyPresetValue) => void;
  value: AnalysisFrequencyPresetValue;
}) {
  const selectedPreset = analysisFrequencyPresets.find((preset) => preset.value === value);

  return (
    <SettingsRow description={description} label={label}>
      <Select onValueChange={(next) => onChange(next as AnalysisFrequencyPresetValue)} value={value}>
        <SelectTrigger aria-label={label} className="w-40">
          <span>{selectedPreset?.label}</span>
        </SelectTrigger>
        <SelectContent>
          {analysisFrequencyPresets.map((preset) => (
            <SelectItem className="h-auto py-2" key={preset.value} textValue={preset.label} value={preset.value}>
              <div className="grid gap-1 text-left">
                <span className="text-sm font-medium text-foreground">{preset.label}</span>
                <span className="text-xs leading-5 text-muted-foreground">{preset.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

function SliderSettingRow({
  description,
  label,
  onChange,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <SettingsRow description={description} label={label}>
      <div className="flex w-48 items-center gap-3">
        <Slider
          aria-label={label}
          className="flex-1"
          max={0.9}
          min={0.1}
          onValueChange={([next]) => {
            if (next != null) {
              onChange(Number(next.toFixed(1)));
            }
          }}
          step={0.1}
          value={[value]}
        />
        <span className="w-8 text-right text-sm font-semibold text-foreground">
          {value.toFixed(1)}
        </span>
      </div>
    </SettingsRow>
  );
}

function detectAnalysisFrequencyPreset(policy: InsightAnalysisPolicy): AnalysisFrequencyPresetValue {
  const matchedPreset = analysisFrequencyPresets.find(
    (preset) =>
      preset.liveMinIntervalMinutes === policy.liveMinIntervalMinutes
      && preset.liveMinNewMeaningfulMessages === policy.liveMinNewMeaningfulMessages,
  );

  return matchedPreset?.value ?? "standard";
}

function normalizeAnalysisPolicyForCompare(policy: InsightAnalysisPolicy) {
  return {
    liveAnalysisEnabled: policy.liveAnalysisEnabled,
    liveMinIntervalMinutes: policy.liveMinIntervalMinutes,
    liveMinNewMeaningfulMessages: policy.liveMinNewMeaningfulMessages,
    lowConfidenceThreshold: policy.lowConfidenceThreshold,
  };
}

function isInsightPolicySame(
  current: {
    analysisPolicy: InsightAnalysisPolicy;
    sessionization: InsightSessionizationSettings;
  },
  baseline: {
    analysisPolicy: ReturnType<typeof normalizeAnalysisPolicyForCompare>;
    sessionization: InsightSessionizationSettings;
  },
) {
  const currentAnalysisPolicy = normalizeAnalysisPolicyForCompare(current.analysisPolicy);

  return currentAnalysisPolicy.liveAnalysisEnabled === baseline.analysisPolicy.liveAnalysisEnabled
    && currentAnalysisPolicy.liveMinIntervalMinutes === baseline.analysisPolicy.liveMinIntervalMinutes
    && currentAnalysisPolicy.liveMinNewMeaningfulMessages === baseline.analysisPolicy.liveMinNewMeaningfulMessages
    && currentAnalysisPolicy.lowConfidenceThreshold === baseline.analysisPolicy.lowConfidenceThreshold
    && current.sessionization.analysisDelayMinutes === baseline.sessionization.analysisDelayMinutes
    && current.sessionization.hardMaxDurationHours === baseline.sessionization.hardMaxDurationHours
    && current.sessionization.idleTimeoutMinutes === baseline.sessionization.idleTimeoutMinutes
    && current.sessionization.lateArrivalWindowMinutes === baseline.sessionization.lateArrivalWindowMinutes
    && current.sessionization.preset === baseline.sessionization.preset;
}

function normalizeSessionizationSettings(
  settings: InsightSessionizationSettings,
): InsightSessionizationSettings {
  return {
    ...settings,
    analysisDelayMinutes: nearestOption(
      settings.analysisDelayMinutes,
      insightPolicyOptionLimits.analysisDelayMinutes,
    ),
    hardMaxDurationHours: nearestOption(
      settings.hardMaxDurationHours,
      insightPolicyOptionLimits.hardMaxDurationHours,
    ),
    lateArrivalWindowMinutes: nearestOption(
      settings.analysisDelayMinutes,
      insightPolicyOptionLimits.analysisDelayMinutes,
    ),
  };
}

function nearestOption(value: number, options: readonly number[]) {
  return options.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}

function FormPanel({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form className="space-y-4" id="insight-policy-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}>
      {children}
    </form>
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
          {items.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>暂无数据</TableCell>
            </TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.labelName} sub={item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.labelCode}</TableCell>
              <TableCell>{item.includeInStatistics ? "纳入" : "不纳入"}</TableCell>
              <TableCell>
                <Switch
                  checked={item.status === 1}
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

function IntentConfigTable({
  items,
  onCreate,
  onDelete,
  onEdit,
  onToggle,
  pendingKey,
}: {
  items: InsightIntentConfig[];
  onCreate: () => void;
  onDelete: (item: InsightIntentConfig) => void;
  onEdit: (item: InsightIntentConfig) => void;
  onToggle: (item: InsightIntentConfig) => void;
  pendingKey?: string;
}) {
  return (
    <ConfigTableShell
      actionText="新增意图"
      description="维护模型可识别、可筛选、可统计的客户业务诉求"
      onCreate={onCreate}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>意图</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>权重</TableHead>
            <TableHead>统计</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={6}>暂无数据</TableCell>
            </TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.intentName} sub={item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.intentCode}</TableCell>
              <TableCell>{item.weight}</TableCell>
              <TableCell>{item.includeInStatistics ? "纳入" : "不纳入"}</TableCell>
              <TableCell>
                <Switch
                  checked={item.status === 1}
                  disabled={pendingKey === `status:intent:${item.id}`}
                  onCheckedChange={() => onToggle(item)}
                />
              </TableCell>
              <TableCell className="text-right">
                <RowActions
                  disabled={pendingKey === `delete:intent:${item.id}`}
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
      description="定义服务过程是否合规、服务是否达标的判定标准"
      onCreate={onCreate}
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
          {items.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>暂无数据</TableCell>
            </TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <PrimaryText main={item.ruleName} sub={item.judgmentCriteria ?? item.description} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.ruleCode}</TableCell>
              <TableCell><SeverityBadge severity={item.severity} /></TableCell>
              <TableCell>
                <Switch
                  checked={item.status === 1}
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
      description="配置需要定向追踪的活动、品类、竞品，系统自动识别并归类统计"
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
          {items.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={6}>暂无数据</TableCell>
            </TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.canonicalName}</TableCell>
              <TableCell>{entityTypeText(item.entityType)}</TableCell>
              <TableCell className="max-w-[360px] text-muted-foreground">
                {item.aliases.length > 0 ? item.aliases.join("、") : "无"}
              </TableCell>
              <TableCell>{item.includeInAggregation ? "纳入" : "不纳入"}</TableCell>
              <TableCell>
                <Switch
                  checked={item.status === 1}
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
}: {
  actionText: string;
  children: ReactNode;
  description: string;
  extra?: ReactNode;
  onCreate: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <Button className="h-9" onClick={onCreate}>
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={16} strokeWidth={1.8} />
            {actionText}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto bg-background">{children}</div>
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

function DeleteConfirmDialog({
  onConfirm,
  onOpenChange,
  pendingKey,
  state,
}: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pendingKey?: string;
  state: DeleteConfirmState | null;
}) {
  if (!state) {
    return null;
  }

  const deleting = pendingKey === `delete:${state.collection}:${state.id}`;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={state != null}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{`确认删除${collectionText(state.collection)}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`删除后无法恢复，“${state.name}”将从${collectionText(state.collection)}中移除`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={onConfirm} variant="destructive">
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RescanPanel({
  disabled,
  onCreateClick,
  onPageChange,
  page,
  tasks,
  total,
}: {
  disabled?: boolean;
  onCreateClick: () => void;
  onPageChange: (page: number) => void;
  page: number;
  tasks: InsightRescanTask[];
  total: number;
}) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
          从指定时间重新生成洞察结果，适合规则、标签、实体词库或意图配置调整后的数据修正
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button className="h-9" disabled={disabled} onClick={onCreateClick}>
            新建重刷任务
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>状态</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>重刷内容</TableHead>
              <TableHead>时间范围</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>完成时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                  暂无数据
                </TableCell>
              </TableRow>
            ) : tasks.map((task) => (
              <TableRow key={task.taskId}>
                <TableCell>
                  <Badge
                    className={task.status === "failed" ? "border-destructive/40 text-destructive" : undefined}
                    variant="outline"
                  >
                    {rescanStatusText(task.status)}
                  </Badge>
                </TableCell>
                <TableCell>{task.progressText}</TableCell>
                <TableCell>{rescanScopeText(task.analysisScope)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRescanTaskRange(task)}
                </TableCell>
                <TableCell>
                  成功 {task.succeededSessions} / 失败 {task.failedSessions}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {task.finishedAt ? formatDateTime(task.finishedAt) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > pageSize ? (
        <InsightTablePagination
          endRow={endRow}
          onPageChange={onPageChange}
          page={page}
          startRow={startRow}
          total={total}
          totalPages={totalPages}
        />
      ) : null}
    </section>
  );
}

function RescanCreateDialog({
  disabled,
  from,
  onChange,
  onCreate,
  onOpenChange,
  onScopeChange,
  open,
  scope,
}: {
  disabled?: boolean;
  from: string;
  onChange: (value: string) => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  onScopeChange: (value: InsightRescanAnalysisScope) => void;
  open: boolean;
  scope: InsightRescanAnalysisScope;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>新建重刷任务</DialogTitle>
          <DialogDescription>只处理指定时间之后的消息，重刷内容越多任务耗时越长</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>重刷内容</Label>
            <RadioGroup
              aria-label="重刷内容"
              className="grid gap-3 md:grid-cols-3"
              onValueChange={(value) => onScopeChange(value as InsightRescanAnalysisScope)}
              value={scope}
            >
              {rescanScopeOptions.map((option) => (
                <Label
                  className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border px-4 py-3 transition-colors hover:border-primary/40"
                  key={option.value}
                >
                  <RadioGroupItem className="mt-0.5" value={option.value} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="insight-rescan-from">开始时间</Label>
            <Input
              className="h-10"
              id="insight-rescan-from"
              onChange={(event) => onChange(event.target.value)}
              type="datetime-local"
              value={from}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={disabled} onClick={onCreate}>
            创建任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [errors, setErrors] = useState<ConfigDialogErrors>({});
  const open = state != null;

  useEffect(() => {
    if (!state) {
      setErrors({});
      setForm({});
      return;
    }

    setErrors({});
    setForm(buildInitialDialogForm(state));
  }, [state]);

  if (!state) {
    return null;
  }

  const collection = state.collection;
  const title = `${state.mode === "create" ? "新增" : "编辑"}${collectionText(state.collection)}`;
  const description = state.collection === "qa"
    ? "填写判定标准和正反例，AI 将依据此规则逐条审计服务过程是否合规"
    : state.collection === "label"
      ? "定义可提取、可统计的业务标签，帮助你按特征筛选和聚合会话"
      : state.collection === "intent"
        ? "定义客户意图分类，帮助你识别会话的主要诉求类型"
        : "统一业务实体名称，提升热点和主体聚合的准确性";
  const wideConfigDialog = collection === "intent" || collection === "label" || collection === "qa";

  function setValue(key: string, value: unknown) {
    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const { [key]: _removed, ...rest } = current;
      return rest;
    });
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    const nextErrors = validateDialogForm(collection, form);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit(normalizeDialogPayload(collection, form));
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={wideConfigDialog ? "max-w-4xl" : "max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[68vh] gap-4 overflow-y-auto p-1 md:grid-cols-2">
          {state.collection === "label" ? (
            <div className="grid gap-5 md:col-span-2 md:grid-cols-2">
              <div className="grid content-start gap-4">
                <TextField error={errors.labelName} form={form} label="标签名称" name="labelName" onChange={setValue} required />
                <TextField error={errors.labelCode} form={form} label="标签编码" name="labelCode" onChange={setValue} required />
                <TextareaField
                  error={errors.description}
                  form={form}
                  label="判定标准"
                  name="description"
                  onChange={setValue}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SwitchEditorField checked={Number(form.status ?? 1) === 1} label="启用" onChange={(value) => setValue("status", value ? 1 : 0)} />
                  <SwitchEditorField checked={Boolean(form.includeInStatistics)} label="纳入统计" onChange={(value) => setValue("includeInStatistics", value)} />
                </div>
              </div>
              <div className="grid content-start gap-4">
                <TextareaField
                  form={form}
                  label="正例"
                  name="positiveExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
                <TextareaField
                  form={form}
                  label="反例"
                  name="negativeExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
              </div>
            </div>
          ) : null}

          {state.collection === "intent" ? (
            <div className="grid gap-5 md:col-span-2 md:grid-cols-2">
              <div className="grid content-start gap-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem]">
                  <TextField error={errors.intentName} form={form} label="意图名称" name="intentName" onChange={setValue} required />
                  <WeightField form={form} onChange={setValue} />
                </div>
                <TextField error={errors.intentCode} form={form} label="意图编码" name="intentCode" onChange={setValue} required />
                <TextareaField form={form} label="别名" name="aliasesText" onChange={setValue} placeholder="每行一个别名" />
                <TextareaField
                  error={errors.description}
                  form={form}
                  label="判定标准"
                  name="description"
                  onChange={setValue}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SwitchEditorField checked={Number(form.status ?? 1) === 1} label="启用" onChange={(value) => setValue("status", value ? 1 : 0)} />
                  <SwitchEditorField checked={Boolean(form.includeInStatistics)} label="纳入统计" onChange={(value) => setValue("includeInStatistics", value)} />
                </div>
              </div>
              <div className="grid content-start gap-4">
                <TextareaField
                  form={form}
                  label="正例"
                  name="positiveExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
                <TextareaField
                  form={form}
                  label="反例"
                  name="negativeExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
              </div>
            </div>
          ) : null}

          {state.collection === "qa" ? (
            <div className="grid gap-5 md:col-span-2 md:grid-cols-2">
              <div className="grid content-start gap-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem]">
                  <TextField error={errors.ruleName} form={form} label="规则名称" name="ruleName" onChange={setValue} required />
                  <SeverityField form={form} onChange={setValue} />
                </div>
                <TextField error={errors.ruleCode} form={form} label="规则编码" name="ruleCode" onChange={setValue} required />
                <TextField form={form} label="适用场景" name="applicableScene" onChange={setValue} />
                <TextareaField error={errors.judgmentCriteria} form={form} label="判定标准" name="judgmentCriteria" onChange={setValue} required />
                <SwitchEditorField checked={Number(form.status ?? 1) === 1} label="启用" onChange={(value) => setValue("status", value ? 1 : 0)} />
              </div>
              <div className="grid content-start gap-4">
                <TextareaField
                  form={form}
                  label="正例"
                  name="positiveExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
                <TextareaField
                  form={form}
                  label="反例"
                  name="negativeExamplesText"
                  onChange={setValue}
                  placeholder="每行一个例子"
                  textareaClassName="min-h-40"
                />
              </div>
            </div>
          ) : null}

          {state.collection === "entity" ? (
            <>
              <TextField error={errors.canonicalName} form={form} label="实体名称" name="canonicalName" onChange={setValue} required />
              <TextField error={errors.entityType} form={form} label="实体类型" name="entityType" onChange={setValue} required />
              <TextareaField className="md:col-span-2" form={form} label="别名" name="aliasesText" onChange={setValue} placeholder="每行一个别名" />
              <SwitchEditorField checked={Number(form.status ?? 1) === 1} label="启用" onChange={(value) => setValue("status", value ? 1 : 0)} />
              <SwitchEditorField checked={Boolean(form.includeInAggregation)} label="纳入聚合" onChange={(value) => setValue("includeInAggregation", value)} />
            </>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={disabled} onClick={handleSubmit}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  error,
  htmlFor,
  label,
  labelHint,
  required,
}: {
  children: ReactNode;
  error?: string;
  htmlFor?: string;
  label: string;
  labelHint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Label htmlFor={htmlFor}>{label}</Label>
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-sm font-medium leading-none text-destructive">
              *
            </span>
          ) : null}
        </div>
        {labelHint ? <span className="text-xs text-muted-foreground">{labelHint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function TextField({
  error,
  form,
  label,
  labelHint,
  name,
  onChange,
  required,
}: {
  error?: string;
  form: Record<string, unknown>;
  label: string;
  labelHint?: string;
  name: string;
  onChange: (name: string, value: string) => void;
  required?: boolean;
}) {
  const id = `insight-field-${name}`;

  return (
    <Field error={error} htmlFor={id} label={label} labelHint={labelHint} required={required}>
      <Input
        aria-invalid={error ? true : undefined}
        className={cn(error ? "border-destructive focus-visible:ring-destructive/20" : undefined)}
        id={id}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        value={String(form[name] ?? "")}
      />
    </Field>
  );
}

function TextareaField({
  className,
  error,
  form,
  label,
  labelHint,
  name,
  onChange,
  placeholder,
  required,
  textareaClassName,
}: {
  className?: string;
  error?: string;
  form: Record<string, unknown>;
  label: string;
  labelHint?: string;
  name: string;
  onChange: (name: string, value: string) => void;
  placeholder?: string;
  required?: boolean;
  textareaClassName?: string;
}) {
  const id = `insight-field-${name}`;

  return (
    <div className={className}>
      <Field error={error} htmlFor={id} label={label} labelHint={labelHint} required={required}>
        <Textarea
          aria-invalid={error ? true : undefined}
          className={cn(textareaClassName ?? "min-h-24", error ? "border-destructive focus-visible:ring-destructive/20" : undefined)}
          id={id}
          onChange={(event) => onChange(name, event.target.value)}
          placeholder={placeholder}
          required={required}
          value={String(form[name] ?? "")}
        />
      </Field>
    </div>
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

function WeightField({
  form,
  onChange,
}: {
  form: Record<string, unknown>;
  onChange: (name: string, value: number) => void;
}) {
  const value = normalizeWeight(form.weight);

  return (
    <Field label="权重">
      <Select
        onValueChange={(next) => onChange("weight", Number(next))}
        value={String(value)}
      >
        <SelectTrigger aria-label="权重" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {intentWeightOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
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
      status: item?.status ?? 1,
      includeInStatistics: item?.includeInStatistics ?? true,
      labelCode: item?.labelCode ?? "",
      labelName: item?.labelName ?? "",
      negativeExamplesText: (item?.negativeExamples ?? []).join("\n"),
      positiveExamplesText: (item?.positiveExamples ?? []).join("\n"),
    };
  }

  if (state.collection === "intent") {
    const item = state.mode === "edit" ? state.item : undefined;
    return {
      aliasesText: (item?.aliases ?? []).join("\n"),
      description: item?.description ?? "",
      status: item?.status ?? 1,
      includeInStatistics: item?.includeInStatistics ?? true,
      intentCode: item?.intentCode ?? "",
      intentName: item?.intentName ?? "",
      negativeExamplesText: (item?.negativeExamples ?? []).join("\n"),
      positiveExamplesText: (item?.positiveExamples ?? []).join("\n"),
      weight: item?.weight ?? 5,
    };
  }

  if (state.collection === "qa") {
    const item = state.mode === "edit" ? state.item : undefined;
    return {
      applicableScene: item?.applicableScene ?? "",
      description: item?.description ?? "",
      status: item?.status ?? 1,
      judgmentCriteria: item?.judgmentCriteria ?? "",
      negativeExamplesText: (item?.negativeExamples ?? []).join("\n"),
      positiveExamplesText: (item?.positiveExamples ?? []).join("\n"),
      ruleCode: item?.ruleCode ?? "",
      ruleName: item?.ruleName ?? "",
      severity: item?.severity ?? "medium",
    };
  }

  const item = state.mode === "edit" ? state.item : undefined;
  return {
    aliasesText: (item?.aliases ?? []).join("\n"),
    canonicalName: item?.canonicalName ?? "",
    status: item?.status ?? 1,
    entityType: item?.entityType ?? "",
    includeInAggregation: item?.includeInAggregation ?? true,
  };
}

function validateDialogForm(collection: MutableCollection, form: Record<string, unknown>): ConfigDialogErrors {
  const errors: ConfigDialogErrors = {};
  const requiredFieldNames: Record<MutableCollection, string[]> = {
    entity: ["canonicalName", "entityType"],
    intent: ["intentName", "intentCode", "description"],
    label: ["labelName", "labelCode", "description"],
    qa: ["ruleName", "ruleCode", "judgmentCriteria"],
  };

  for (const name of requiredFieldNames[collection]) {
    if (String(form[name] ?? "").trim().length === 0) {
      errors[name] = "请填写必填项";
    }
  }

  return errors;
}

function normalizeDialogPayload(collection: MutableCollection, form: Record<string, unknown>) {
  if (collection === "label") {
    return {
      description: trimOptional(form.description),
      status: Number(form.status ?? 1) === 1 ? 1 : 0,
      includeInStatistics: Boolean(form.includeInStatistics),
      labelCode: String(form.labelCode ?? "").trim(),
      labelName: String(form.labelName ?? "").trim(),
      negativeExamples: splitLines(form.negativeExamplesText),
      positiveExamples: splitLines(form.positiveExamplesText),
    };
  }

  if (collection === "intent") {
    return {
      aliases: splitLines(form.aliasesText),
      description: trimOptional(form.description),
      status: Number(form.status ?? 1) === 1 ? 1 : 0,
      includeInStatistics: Boolean(form.includeInStatistics),
      intentCode: String(form.intentCode ?? "").trim(),
      intentName: String(form.intentName ?? "").trim(),
      negativeExamples: splitLines(form.negativeExamplesText),
      positiveExamples: splitLines(form.positiveExamplesText),
      weight: normalizeWeight(form.weight),
    };
  }

  if (collection === "qa") {
    return {
      applicableScene: trimOptional(form.applicableScene),
      description: trimOptional(form.description),
      status: Number(form.status ?? 1) === 1 ? 1 : 0,
      judgmentCriteria: trimOptional(form.judgmentCriteria),
      negativeExamples: splitLines(form.negativeExamplesText),
      positiveExamples: splitLines(form.positiveExamplesText),
      ruleCode: String(form.ruleCode ?? "").trim(),
      ruleName: String(form.ruleName ?? "").trim(),
      severity: normalizeSeverityFormValue(form.severity),
    };
  }

  return {
    aliases: splitLines(form.aliasesText),
    canonicalName: String(form.canonicalName ?? "").trim(),
    status: Number(form.status ?? 1) === 1 ? 1 : 0,
    entityType: String(form.entityType ?? "").trim(),
    includeInAggregation: Boolean(form.includeInAggregation),
  };
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

function normalizeWeight(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.floor(parsed)));
}

function collectionText(value: MutableCollection) {
  const text: Record<MutableCollection, string> = {
    entity: "实体",
    intent: "意图",
    label: "标签",
    qa: "质检规则",
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

function rescanScopeText(value: InsightRescanAnalysisScope) {
  if (value === "qaFindings") {
    return "服务质检";
  }

  if (value === "classification") {
    return "标签 / 实体 / 意图";
  }

  return "全量重刷";
}

function rescanStatusText(value: InsightRescanTask["status"]) {
  const text: Record<InsightRescanTask["status"], string> = {
    failed: "失败",
    partial: "部分完成",
    pending: "排队中",
    running: "运行中",
    succeeded: "已完成",
  };

  return text[value];
}

function formatRescanTaskRange(task: InsightRescanTask) {
  return `${formatDateTime(new Date(task.from).getTime())} 至 ${task.to ? formatDateTime(new Date(task.to).getTime()) : "当前"}`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
