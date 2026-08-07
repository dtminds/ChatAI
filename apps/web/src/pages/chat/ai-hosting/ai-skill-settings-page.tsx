import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add01Icon,
  AbsoluteIcon,
  AlertCircleIcon,
  AiBookIcon,
  ApiIcon,
  ArrowDown01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Edit02Icon,
  File01Icon,
  File02Icon,
  Search01Icon,
  SlidersHorizontalIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AGENT_SKILL_APPLY_SCENE_MAX_LENGTH,
  AGENT_SKILL_KB_MAX_COUNT,
  AGENT_SKILL_NAME_MAX_LENGTH,
  AGENT_SKILL_TOOL_CATALOG,
  AGENT_SKILL_VISIBLE_TOOL_CATALOG,
  KB_SEARCH_QUERY_MAX_LENGTH,
  type AiHostingAgentResourceInvalidReason,
  type AgentSkillResources,
  type AgentSkillVariable,
} from "@chatai/contracts";
import type { LexicalEditor } from "lexical";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  createAgentSkill,
  getAgentSkill,
  updateAgentSkill,
} from "./api/agent-skill-service";
import { listKbs, toKbListViewItem } from "./api/kb-service";
import { canManageAiHostingAgents } from "./agent-permissions";
import {
  SKILL_CREATE_DRAFT_STATE_KEY,
  type SkillCreateDraft,
} from "./ai-skill-create-draft";
import { AiSkillDescriptionField } from "./ai-skill-description-field";
import { INSERT_SKILL_CONTENT_RESOURCE_COMMAND } from "./ai-skill-description-lexical-commands";
import {
  InsertVariableDialog,
  type InsertVariableInitialConfigure,
} from "./ai-skill-insert-variable-dialog";
import {
  buildKnowledgeBasePlaceholder,
  buildSkillVariableResourceItem,
  buildToolPlaceholder,
  getSkillResourceChipName,
  getSkillResourceInvalidReasonLabel,
  parseSkillContentSegments,
  parseSkillTagVariableStoredName,
  removeResourceFromSkillContent,
  replaceResourceInSkillContent,
  serializeSkillContentSegments,
  toSkillContentResourceSegment,
  type SkillContentSegment,
  type SkillRecommendBinding,
  type SkillResourceItem,
} from "./ai-skill-resource";
import { AiHostingLayout } from "./ai-hosting-layout";
import type { KbListViewItem } from "./kb-types";
import "./agent-module.css";
import "./ai-skill-delivery.css";

const KB_PICKER_PAGE_SIZE = 10;
const emptyStateIllustrationUrl = "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

type ResourceSectionId = "variables" | "tools" | "knowledge-bases";

type ResourceCatalogItem = SkillResourceItem & {
  icon: typeof ApiIcon | typeof File01Icon;
};

const resourceSections = [
  { icon: AbsoluteIcon, id: "variables", singular: "变量", title: "变量" },
  { icon: ApiIcon, id: "tools", singular: "工具", title: "工具" },
  {
    icon: AiBookIcon,
    id: "knowledge-bases",
    singular: "知识库",
    title: "知识库",
  },
] as const satisfies ReadonlyArray<{
  icon: typeof AbsoluteIcon;
  id: ResourceSectionId;
  singular: string;
  title: string;
}>;

const insertDialogMeta: Record<
  Exclude<ResourceSectionId, "variables">,
  {
    manageHref?: string;
    manageLabel?: string;
    title: string;
  }
> = {
  tools: {
    title: "插入工具",
  },
  "knowledge-bases": {
    title: "选择知识库",
    manageHref: "/chat/ai-hosting/kb",
    manageLabel: "前往知识库管理",
  },
};

const staticInsertItems: Partial<
  Record<ResourceSectionId, readonly ResourceCatalogItem[]>
> = {
  tools: AGENT_SKILL_VISIBLE_TOOL_CATALOG.map((tool) => ({
    description: tool.description,
    icon: ApiIcon,
    id: tool.id,
    placeholder: buildToolPlaceholder(tool.id, tool.name),
    status: "available",
    title: tool.name,
    toolKey: tool.id,
  })),
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function buildKnowledgeBaseResourceItem(item: KbListViewItem): ResourceCatalogItem {
  const kbId = Number(item.id);

  return {
    description: item.description,
    icon: File01Icon,
    id: `kb:${item.id}`,
    kbId: Number.isFinite(kbId) ? kbId : undefined,
    placeholder: buildKnowledgeBasePlaceholder(item.id, item.name),
    status: "available",
    title: item.name,
  };
}

type InvalidSkillResources = Record<
  ResourceSectionId,
  SkillResourceItem[]
> | null;

function buildSelectedResources(
  resources: AgentSkillResources,
): Record<ResourceSectionId, SkillResourceItem[]> {
  const toolCatalog = new Map<
    string,
    (typeof AGENT_SKILL_TOOL_CATALOG)[number]
  >(
    AGENT_SKILL_TOOL_CATALOG.map((tool) => [tool.id, tool]),
  );

  return {
    variables: resources.variables.map((resource) => ({
      ...buildSkillVariableResourceItem(resource.variable, resource.name),
      id: resource.id,
      invalidReason: resource.invalidReason,
      status: resource.status,
      title: resource.name,
    })),
    tools: resources.tools.map((resource) => {
      const catalogItem = toolCatalog.get(resource.toolKey);
      return {
        description: catalogItem?.description ?? "",
        id: resource.id,
        invalidReason: resource.invalidReason,
        placeholder: buildToolPlaceholder(resource.toolKey, resource.name),
        status: resource.status,
        title: resource.name,
        toolKey: resource.toolKey,
      };
    }),
    "knowledge-bases": resources.knowledgeBases.map((resource) => ({
      description: "",
      id: resource.id,
      invalidReason: resource.invalidReason,
      kbId: resource.kbId,
      placeholder: buildKnowledgeBasePlaceholder(resource.kbId, resource.name),
      status: resource.status,
      title: resource.name,
    })),
  };
}

function readSkillCreateDraft(state: unknown): SkillCreateDraft | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const draft = (state as Record<string, unknown>)[SKILL_CREATE_DRAFT_STATE_KEY];
  if (!draft || typeof draft !== "object") {
    return null;
  }

  const content = (draft as SkillCreateDraft).content;
  if (typeof content !== "string" || content.length === 0) {
    return null;
  }

  return draft as SkillCreateDraft;
}

export function AiSkillSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { skillId } = useParams<{ skillId?: string }>();
  const role = useAuthStore((state) => state.subUser?.role);
  const canManage = canManageAiHostingAgents(role);
  const isEditMode = Boolean(skillId);
  const descriptionEditorRef = useRef<LexicalEditor | null>(null);
  const [createDraft] = useState(() =>
    isEditMode ? null : readSkillCreateDraft(location.state),
  );
  const createDraftClearedRef = useRef(false);
  const [pageLoading, setPageLoading] = useState(isEditMode);
  const [pageError, setPageError] = useState(false);
  const [name, setName] = useState(createDraft?.name?.trim() ?? "");
  const [applicationScenario, setApplicationScenario] = useState(
    createDraft?.applyScene ?? "",
  );
  const [skillContentSegments, setSkillContentSegments] = useState<
    SkillContentSegment[]
  >(() =>
    createDraft?.content
      ? parseSkillContentSegments(createDraft.content)
      : [{ type: "text", value: "" }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [selectedResources, setSelectedResources] = useState<
    Record<ResourceSectionId, SkillResourceItem[]>
  >(() => ({
    variables: createDraft?.resources?.variables ?? [],
    tools: createDraft?.resources?.tools ?? [],
    "knowledge-bases": createDraft?.resources?.["knowledge-bases"] ?? [],
  }));
  const [activeInsertSection, setActiveInsertSection] =
    useState<ResourceSectionId | null>(null);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<SkillResourceItem | null>(
    null,
  );
  const recommendResources = createDraft?.recommendResources ?? [];
  const [removeTarget, setRemoveTarget] = useState<{
    item: SkillResourceItem;
    sectionId: ResourceSectionId;
    singular: string;
  } | null>(null);
  const [invalidResourceDialog, setInvalidResourceDialog] =
    useState<InvalidSkillResources>(null);

  const variableInitialConfigure = useMemo<InsertVariableInitialConfigure | null>(
    () => {
      if (editingVariable?.variable) {
        return {
          kind: editingVariable.variable.type,
          lockKind: true,
          initialVariable: editingVariable.variable,
        };
      }

      return null;
    },
    [editingVariable],
  );

  const controlsDisabled = submitting || !canManage;
  const canSubmit =
    canManage && name.trim().length > 0 && !pageLoading && !pageError;
  const invalidResourceCount = Object.values(selectedResources)
    .flat()
    .filter((resource) => resource.status === "invalid").length;

  useEffect(() => {
    if (isEditMode || !createDraft || createDraftClearedRef.current) {
      return;
    }

    createDraftClearedRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
  }, [createDraft, isEditMode, location.pathname, navigate]);

  useEffect(() => {
    if (!skillId) {
      setPageLoading(false);
      setPageError(false);
      return;
    }

    let cancelled = false;

    async function loadSkillDetail() {
      setPageLoading(true);
      setPageError(false);

      try {
        const detail = await getAgentSkill(skillId!);
        if (cancelled) {
          return;
        }

        setName(detail.name);
        setApplicationScenario(detail.applyScene);
        setSkillContentSegments(parseSkillContentSegments(detail.content));
        setSelectedResources(buildSelectedResources(detail.resources));
      } catch {
        if (!cancelled) {
          setPageError(true);
          toast.error("技能加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadSkillDetail();

    return () => {
      cancelled = true;
    };
  }, [skillId]);

  function goBackToMySkills() {
    navigate("/chat/ai-hosting/skills?tab=mine");
  }

  function handleCancel() {
    goBackToMySkills();
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) {
      return;
    }

    const invalidResources = getInvalidSkillResourceGroups(selectedResources);
    if (invalidResources) {
      setInvalidResourceDialog(invalidResources);
      return;
    }

    const payload = {
      applyScene: applicationScenario.trim(),
      content: serializeSkillContentSegments(skillContentSegments),
      kbs: selectedResources["knowledge-bases"]
        .map((item) => item.kbId)
        .filter((kbId): kbId is number => typeof kbId === "number"),
      name: name.trim(),
      tools: selectedResources.tools
        .map((item) => item.toolKey)
        .filter((toolKey): toolKey is string => Boolean(toolKey)),
      variables: selectedResources.variables
        .map((item) => item.variable)
        .filter((variable): variable is NonNullable<typeof variable> => Boolean(variable)),
    };

    setSubmitting(true);
    try {
      if (skillId) {
        await updateAgentSkill(skillId, payload);
      } else {
        await createAgentSkill(payload);
      }
      toast.success(skillId ? "技能已保存" : "技能已提交");
      goBackToMySkills();
    } catch (error) {
      const invalidResources = readInvalidSkillResourcesFromRequestError(error);
      if (invalidResources) {
        setSelectedResources((current) =>
          mergeInvalidSkillResourceGroups(current, invalidResources),
        );
        setInvalidResourceDialog(invalidResources);
        return;
      }
      toast.error(skillId ? "保存失败，请稍后重试" : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddResource(sectionId: ResourceSectionId, item: SkillResourceItem) {
    handleAddResources(sectionId, [item]);
  }

  function handleAddResources(
    sectionId: ResourceSectionId,
    items: readonly SkillResourceItem[],
  ) {
    if (controlsDisabled) {
      return;
    }

    const existingIds = new Set(selectedResources[sectionId].map((item) => item.id));
    const additions = items.filter((item) => !existingIds.has(item.id));
    if (additions.length === 0) {
      return;
    }

    setSelectedResources((current) => {
      const currentIds = new Set(current[sectionId].map((item) => item.id));
      const currentAdditions = additions.filter((item) => !currentIds.has(item.id));

      return {
        ...current,
        [sectionId]: [...current[sectionId], ...currentAdditions],
      };
    });

    toast.success("已添加");
  }

  function handleReplaceVariable(
    previous: SkillResourceItem,
    next: SkillResourceItem,
  ) {
    if (controlsDisabled) {
      return;
    }

    setSelectedResources((current) => {
      const previousIndex = current.variables.findIndex(
        (item) => item.id === previous.id,
      );
      const withoutPrevious = current.variables.filter(
        (item) => item.id !== previous.id,
      );
      const withoutDuplicate = withoutPrevious.filter((item) => item.id !== next.id);
      const insertAt =
        previousIndex < 0
          ? withoutDuplicate.length
          : Math.min(previousIndex, withoutDuplicate.length);

      return {
        ...current,
        variables: [
          ...withoutDuplicate.slice(0, insertAt),
          next,
          ...withoutDuplicate.slice(insertAt),
        ],
      };
    });

    setSkillContentSegments((current) =>
      replaceResourceInSkillContent(
        current,
        { id: previous.id, placeholder: previous.placeholder },
        toSkillContentResourceSegment(next),
      ),
    );

    toast.success("已更新");
  }

  function handleChangeKnowledgeBases(items: readonly SkillResourceItem[]) {
    if (controlsDisabled) {
      return;
    }

    if (items.length > AGENT_SKILL_KB_MAX_COUNT) {
      toast.error(`一个技能最多可添加${AGENT_SKILL_KB_MAX_COUNT}个知识库`);
      return;
    }

    const nextIds = new Set(items.map((item) => item.id));
    const removedItems = selectedResources["knowledge-bases"].filter(
      (item) => !nextIds.has(item.id),
    );

    setSelectedResources((current) => ({
      ...current,
      "knowledge-bases": [...items],
    }));

    if (removedItems.length > 0) {
      setSkillContentSegments((current) =>
        removedItems.reduce(
          (segments, item) =>
            removeResourceFromSkillContent(segments, {
              id: item.id,
              placeholder: item.placeholder,
            }),
          current,
        ),
      );
    }

  }

  function handleRemoveResource(sectionId: ResourceSectionId, itemId: string) {
    if (controlsDisabled) {
      return;
    }

    const section = resourceSections.find((item) => item.id === sectionId);
    const item = selectedResources[sectionId].find(
      (resource) => resource.id === itemId,
    );

    if (!section || !item) {
      return;
    }

    setRemoveTarget({
      item,
      sectionId,
      singular: section.singular,
    });
  }

  function handleConfirmRemoveResource() {
    if (!removeTarget || controlsDisabled) {
      return;
    }

    const { item, sectionId } = removeTarget;

    setSelectedResources((current) => ({
      ...current,
      [sectionId]: current[sectionId].filter((resource) => resource.id !== item.id),
    }));
    setSkillContentSegments((current) =>
      removeResourceFromSkillContent(current, {
        id: item.id,
        placeholder: item.placeholder,
      }),
    );
    setRemoveTarget(null);
  }

  /** 仅插入技能描述；可选池来自右侧已添加资源 */
  function handleInsertReferencedResource(item: SkillResourceItem) {
    if (!item.placeholder || controlsDisabled || item.status === "invalid") {
      return;
    }

    descriptionEditorRef.current?.dispatchCommand(
      INSERT_SKILL_CONTENT_RESOURCE_COMMAND,
      toSkillContentResourceSegment(item),
    );
    descriptionEditorRef.current?.focus();
  }

  function handleOpenResourcePicker(sectionId: ResourceSectionId) {
    if (controlsDisabled) {
      return;
    }

    setEditingVariable(null);
    if (sectionId === "variables") {
      setActiveInsertSection(null);
      setVariableDialogOpen(true);
      return;
    }

    setVariableDialogOpen(false);
    setActiveInsertSection(sectionId);
  }

  return (
    <AiHostingLayout title="技能设置">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-label="返回我的技能"
              asChild
              className="-ml-2 size-9 shrink-0 rounded-[8px]"
              size="icon"
              variant="ghost"
            >
              <Link to="/chat/ai-hosting/skills?tab=mine">
                <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.8} />
              </Link>
            </Button>
            <h1 className="truncate text-xl font-semibold leading-tight text-foreground">
              技能设置
            </h1>
          </div>
          {canManage ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={handleCancel} type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={!canSubmit || submitting}
                onClick={() => void handleSubmit()}
                type="button"
              >
                保存
              </Button>
            </div>
          ) : null}
        </header>

        {!canManage ? (
          <p className="rounded-[8px] border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
            当前账号仅可查看技能，管理操作需管理员权限
          </p>
        ) : null}

        {pageLoading ? (
          <div
            className="flex min-h-48 items-center justify-center gap-2 rounded-[14px] border border-border bg-card text-sm text-muted-foreground"
            role="status"
          >
            <Spinner size={16} />
            <span>正在加载</span>
          </div>
        ) : pageError ? (
          <div
            className="flex min-h-48 items-center justify-center rounded-[14px] border border-border bg-card text-sm text-destructive"
            role="alert"
          >
            加载失败
          </div>
        ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            <section
              aria-labelledby="skill-basic-settings-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <div className="mb-5 flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="agent-module-section-icon agent-module-section-icon--settings inline-flex size-10 shrink-0 items-center justify-center rounded-[8px]"
                >
                  <HugeiconsIcon
                    icon={SlidersHorizontalIcon}
                    size={20}
                    strokeWidth={1.8}
                  />
                </span>
                <div className="min-w-0 space-y-1">
                  <h2
                    className="text-base font-semibold text-foreground"
                    id="skill-basic-settings-title"
                  >
                    基本设置
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    告诉 Agent 应该何时使用这个技能
                  </p>
                </div>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="skill-name">
                    技能名称 <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      aria-required="true"
                      className="h-10 pr-14"
                      disabled={controlsDisabled}
                      id="skill-name"
                      maxLength={AGENT_SKILL_NAME_MAX_LENGTH}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="请输入"
                      value={name}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {name.length}/{AGENT_SKILL_NAME_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="skill-application-scenario">技能应用场景</Label>
                  <div className="relative">
                    <Textarea
                      className="min-h-36 bg-background"
                      disabled={controlsDisabled}
                      id="skill-application-scenario"
                      maxLength={AGENT_SKILL_APPLY_SCENE_MAX_LENGTH}
                      onChange={(event) => setApplicationScenario(event.target.value)}
                      placeholder="描述在什么情形下，Agent 可以调用这个技能"
                      value={applicationScenario}
                    />
                    <div className="mt-1 text-right text-xs text-muted-foreground">
                      {applicationScenario.length}/{AGENT_SKILL_APPLY_SCENE_MAX_LENGTH}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="skill-description-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <div className="mb-5 flex items-start gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="agent-module-section-icon agent-module-section-icon--description inline-flex size-10 shrink-0 items-center justify-center rounded-[8px]"
                  >
                    <HugeiconsIcon icon={File02Icon} size={20} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h2
                      className="text-base font-semibold text-foreground"
                      id="skill-description-title"
                    >
                      技能描述
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      详细描述技能的功能、使用方式和注意事项
                    </p>
                  </div>
                </div>
              </div>
              <AiSkillDescriptionField
                disabled={controlsDisabled}
                editorRef={descriptionEditorRef}
                knowledgeBases={selectedResources["knowledge-bases"]}
                onChange={setSkillContentSegments}
                onSelectResource={handleInsertReferencedResource}
                segments={skillContentSegments}
                tools={selectedResources.tools}
                variables={selectedResources.variables}
              />
            </section>
          </div>

          <div className="flex h-fit flex-col gap-5">
            <aside
              aria-labelledby="skill-insert-resources-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <h2
                className="mb-4 text-base font-semibold text-foreground"
                id="skill-insert-resources-title"
              >
                资源管理
              </h2>
              {invalidResourceCount > 0 ? (
                <div
                  className="mb-4 flex items-start gap-2 rounded-[8px] bg-destructive/5 px-3 py-1.5 text-sm text-destructive"
                  role="alert"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    icon={AlertCircleIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  <span>保存前请移除失效资源</span>
                </div>
              ) : null}
              <div className="space-y-5">
                {resourceSections.map((section) => (
                  <SkillResourceSection
                    disabled={controlsDisabled}
                    icon={section.icon}
                    items={selectedResources[section.id]}
                    key={section.id}
                    onAdd={() => handleOpenResourcePicker(section.id)}
                    onEdit={
                      section.id === "variables"
                        ? (item) => {
                            if (!isEditableSkillVariable(item)) {
                              return;
                            }
                            setEditingVariable(item);
                            setVariableDialogOpen(true);
                          }
                        : undefined
                    }
                    onRemove={(itemId) => handleRemoveResource(section.id, itemId)}
                    title={section.title}
                  />
                ))}
              </div>
            </aside>

            {!isEditMode && recommendResources.length > 0 ? (
              <SkillRecommendResourcesTips items={recommendResources} />
            ) : null}
          </div>
        </div>
        )}
      </div>

      <InsertVariableDialog
        addedVariables={selectedResources.variables}
        initialConfigure={variableInitialConfigure}
        onConfirm={(items) => {
          if (editingVariable) {
            const next = items[0];
            if (next) {
              handleReplaceVariable(editingVariable, next);
            }
            setEditingVariable(null);
          } else {
            handleAddResources("variables", items);
          }
          setVariableDialogOpen(false);
          if (activeInsertSection === "variables") {
            setActiveInsertSection(null);
          }
        }}
        onOpenChange={(open) => {
          setVariableDialogOpen(open);
          if (!open) {
            setEditingVariable(null);
            if (activeInsertSection === "variables") {
              setActiveInsertSection(null);
            }
          }
        }}
        open={variableDialogOpen || activeInsertSection === "variables"}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        open={removeTarget != null}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>删除{removeTarget?.singular ?? "资源"}</AlertDialogTitle>
            <AlertDialogDescription>
              将删除技能描述中引用的{removeTarget?.singular ?? "资源"}，确认删除吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive bg-background text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={handleConfirmRemoveResource}
              variant="outline"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvalidSkillResourcesDialog
        onOpenChange={(open) => {
          if (!open) {
            setInvalidResourceDialog(null);
          }
        }}
        state={invalidResourceDialog}
      />

      <InsertResourceDialog
        addedItems={
          activeInsertSection && activeInsertSection !== "variables"
            ? selectedResources[activeInsertSection]
            : []
        }
        onAdd={(item) => {
          if (!activeInsertSection || activeInsertSection === "variables") {
            return;
          }
          handleAddResource(activeInsertSection, item);
        }}
        onChangeKnowledgeBases={handleChangeKnowledgeBases}
        onOpenChange={(open) => {
          if (!open && activeInsertSection !== "variables") {
            setActiveInsertSection(null);
          }
        }}
        open={
          activeInsertSection === "tools" ||
          activeInsertSection === "knowledge-bases"
        }
        sectionId={
          activeInsertSection === "tools" ||
          activeInsertSection === "knowledge-bases"
            ? activeInsertSection
            : null
        }
      />
    </AiHostingLayout>
  );
}

function SkillRecommendResourcesTips({
  items,
}: {
  items: readonly SkillRecommendBinding[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="推荐资源"
      className="ai-skill-recommend-tips overflow-hidden rounded-[14px] border"
    >
      <div className="ai-skill-recommend-tips__banner flex items-center gap-2 px-4 py-2">
        <span
          aria-hidden="true"
          className="ai-skill-recommend-tips__icon inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none"
        >
          !
        </span>
        <p className="ai-skill-recommend-tips__text text-xs leading-4">
          小贴士：建议关联配置资源使用
        </p>
      </div>
      <ul className="ai-skill-recommend-tips__content relative z-10 divide-y divide-border/60 rounded-t-[18px] px-4 pt-2">
        {items.map((item, index) => (
          <li
            className="px-2 py-4"
            key={`${item.type}-${item.title}-${index}`}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-5 text-foreground">
                {item.title}
              </p>
              {item.description ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkillResourceSection({
  disabled,
  icon,
  items,
  onAdd,
  onEdit,
  onRemove,
  title,
}: {
  disabled: boolean;
  icon: typeof AbsoluteIcon;
  items: readonly SkillResourceItem[];
  onAdd: () => void;
  onEdit?: (item: SkillResourceItem) => void;
  onRemove: (itemId: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useMemo(() => `skill-resource-${title}`, [title]);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="flex items-center gap-1 py-0.5">
        <CollapsibleTrigger asChild>
          <Button
            aria-controls={contentId}
            aria-expanded={open}
            aria-label={`${open ? "收起" : "展开"}${title}`}
            className="size-6 shrink-0 p-0 text-muted-foreground"
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              icon={open ? ArrowDown01Icon : ArrowRight01Icon}
              size={14}
              strokeWidth={2.2}
            />
          </Button>
        </CollapsibleTrigger>
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{title}</p>
        <Button
          aria-label={`添加${title}`}
          className="size-6 shrink-0 rounded-[6px] p-0"
          disabled={disabled}
          onClick={onAdd}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
        </Button>
      </div>

      <CollapsibleContent id={contentId}>
        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center px-2 py-6"
            role="status"
          >
            <img
              alt=""
              aria-hidden="true"
              className="h-auto w-20 opacity-50"
              src={emptyStateIllustrationUrl}
            />
            <p className="text-sm text-muted-foreground">暂未配置</p>
          </div>
        ) : (
          <ul aria-label={`已添加${title}`} className="space-y-1.5 px-0.5 py-2">
            {items.map((item) => {
              const tagPresentation = getSkillTagResourcePresentation(item);
              const displayTitle = tagPresentation?.title ?? item.title;
              const canEditResource =
                Boolean(onEdit) &&
                item.status !== "invalid" &&
                isEditableSkillVariable(item);
              const hasEditableTagPopover =
                canEditResource && Boolean(tagPresentation?.tagNames.length);

              const resourceRow = (
                <div
                  aria-label={
                    hasEditableTagPopover
                      ? `${displayTitle}标签详情`
                      : undefined
                  }
                  className={cn(
                    "group relative flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors",
                    item.status === "invalid"
                      ? "bg-destructive/5 hover:bg-destructive/10"
                      : "bg-muted/80 hover:bg-accent",
                  )}
                >
                    {item.status === "invalid" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              aria-label={`${displayTitle}已失效`}
                              className="inline-flex shrink-0 text-destructive"
                              role="img"
                            >
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={AlertCircleIcon}
                                size={15}
                                strokeWidth={1.8}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            {getSkillResourceInvalidReasonLabel(
                              item.invalidReason,
                              title,
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground"
                        icon={icon}
                        size={15}
                        strokeWidth={1.8}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="min-w-0 truncate text-[13px] text-foreground">
                        {displayTitle}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-[6px] opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
                        item.status === "invalid"
                          ? "bg-destructive/10"
                          : "bg-muted/90",
                      )}
                    >
                      <Button
                        aria-label={`删除${displayTitle}`}
                        className="size-6 rounded-[6px] p-0 text-muted-foreground hover:text-foreground"
                        disabled={disabled}
                        onClick={() => onRemove(item.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Delete02Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                      </Button>
                    </div>
                  </div>
              );

              return (
                <li key={item.id}>
                  {hasEditableTagPopover && tagPresentation ? (
                    <HoverCard closeDelay={80} openDelay={120}>
                      <HoverCardTrigger asChild>{resourceRow}</HoverCardTrigger>
                      <HoverCardContent
                        align="center"
                        className="w-auto min-w-48 max-w-72 rounded-[8px] px-3 py-2.5"
                        side="left"
                        sideOffset={8}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            已选标签
                          </p>
                          <Button
                            aria-label={`编辑${displayTitle}`}
                            className="size-6 rounded-[6px] p-0 text-muted-foreground hover:text-foreground"
                            disabled={disabled}
                            onClick={() => onEdit?.(item)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <HugeiconsIcon
                              aria-hidden="true"
                              icon={Edit02Icon}
                              size={14}
                              strokeWidth={1.8}
                            />
                          </Button>
                        </div>
                        <ul aria-label="已选标签" className="max-h-64 space-y-1.5 overflow-y-auto">
                          {tagPresentation.tagNames.map((tagName, index) => (
                            <li key={`${index}:${tagName}`}>
                              <Badge
                                className="max-w-full px-2 py-1 text-[13px] font-normal"
                                variant="secondary"
                              >
                                <span className="break-all">{tagName}</span>
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    resourceRow
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function getSkillTagResourcePresentation(item: SkillResourceItem) {
  const variable = item.variable;
  if (
    !variable ||
    (variable.type !== "work_tag" && variable.type !== "mall_tag")
  ) {
    return null;
  }

  const { groupName, tagNames } = parseSkillTagVariableStoredName(variable.name);
  return {
    tagNames,
    title: getSkillResourceChipName({
      ...item,
      variable: { ...variable, name: groupName },
    }),
  };
}

function isEditableSkillVariable(item: SkillResourceItem) {
  return (
    item.variable?.type === "work_tag" || item.variable?.type === "mall_tag"
  );
}

function InvalidSkillResourcesDialog({
  onOpenChange,
  state,
}: {
  onOpenChange: (open: boolean) => void;
  state: InvalidSkillResources;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={state !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>无法保存技能</AlertDialogTitle>
          <AlertDialogDescription>
            技能依赖的以下资源已失效，请从右侧资源管理中移除或替换后再保存
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-64 space-y-4 overflow-y-auto rounded-[8px] border border-border bg-muted/20 p-3">
          {state?.variables.length ? (
            <InvalidSkillResourceGroup
              resources={state.variables}
              title="变量"
            />
          ) : null}
          {state?.tools.length ? (
            <InvalidSkillResourceGroup resources={state.tools} title="工具" />
          ) : null}
          {state?.["knowledge-bases"].length ? (
            <InvalidSkillResourceGroup
              resources={state["knowledge-bases"]}
              title="知识库"
            />
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogAction>知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InvalidSkillResourceGroup({
  resources,
  title,
}: {
  resources: readonly SkillResourceItem[];
  title: string;
}) {
  return (
    <section aria-label={`已失效${title}`}>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {resources.map((resource) => (
          <li
            className="flex min-w-0 items-center gap-2 rounded-[6px] bg-destructive/5 px-2.5 py-2 text-sm text-destructive"
            key={resource.id}
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="shrink-0"
              icon={AlertCircleIcon}
              size={15}
              strokeWidth={1.8}
            />
            <span className="min-w-0 flex-1 truncate" title={resource.title}>
              {resource.title}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsertResourceDialog({
  addedItems,
  onAdd,
  onChangeKnowledgeBases,
  onOpenChange,
  open,
  sectionId,
}: {
  addedItems: readonly SkillResourceItem[];
  onAdd: (item: SkillResourceItem) => void;
  onChangeKnowledgeBases: (items: readonly SkillResourceItem[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sectionId: Exclude<ResourceSectionId, "variables"> | null;
}) {
  const meta = sectionId ? insertDialogMeta[sectionId] : null;
  const addedIdSet = useMemo(
    () => new Set(addedItems.map((item) => item.id)),
    [addedItems],
  );
  const items = sectionId ? (staticInsertItems[sectionId] ?? []) : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={
          sectionId === "knowledge-bases"
            ? "max-h-[calc(100vh-2rem)] max-w-[1040px] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:rounded-[14px]"
            : "max-h-[calc(100vh-2rem)] max-w-[760px] gap-0 overflow-y-auto p-0 sm:rounded-[14px]"
        }
      >
        {meta ? (
          <>
            {sectionId === "tools" ? (
              <div className="space-y-1.5 px-6 pb-5 pr-14 pt-6">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {meta.title}
                </DialogTitle>
                <DialogDescription className="text-sm leading-5 text-muted-foreground">
                  工具仅支持在单聊自动回复模式下调用，话术推荐模式和群聊场景下无法使用
                </DialogDescription>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-4 pr-14 pt-6">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {meta.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  选择要添加的{meta.title.replace(/^(插入|选择)/u, "")}
                </DialogDescription>
                {meta.manageHref && meta.manageLabel ? (
                  <Button
                    asChild
                    className="h-8 gap-1 px-0 text-primary"
                    type="button"
                    variant="link"
                  >
                    <Link to={meta.manageHref}>
                      {meta.manageLabel}
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={ArrowRight01Icon}
                        size={14}
                        strokeWidth={1.8}
                      />
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}

            {sectionId === "knowledge-bases" ? (
              <KnowledgeBasePicker
                addedItems={addedItems}
                onConfirm={(selectedItems) => {
                  onChangeKnowledgeBases(selectedItems);
                  onOpenChange(false);
                }}
                onOpenChange={onOpenChange}
                open={open}
              />
            ) : items.length === 0 ? (
              <div
                className="px-6 py-16 text-center text-sm text-muted-foreground"
                role="status"
              >
                暂无数据
              </div>
            ) : (
              <>
                <ul aria-label={meta.title} className="space-y-2 px-6">
                  {items.map((item) => {
                    const added = addedIdSet.has(item.id);

                    return (
                      <li
                        className={cn(
                          "flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors",
                          added
                            ? "border-primary/25 bg-primary/5"
                            : "border-border bg-background hover:bg-muted/50",
                        )}
                        key={item.id}
                      >
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-background text-sm font-semibold text-primary">
                          API
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {item.title}
                          </p>
                          {item.description ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          aria-label={added ? `已添加${item.title}` : `添加${item.title}`}
                          className={cn(
                            "h-9 shrink-0 px-4 text-primary",
                            added &&
                              "border-primary/20 bg-primary/5 disabled:opacity-100",
                          )}
                          disabled={added}
                          onClick={() => onAdd(item)}
                          type="button"
                          variant="outline"
                        >
                          {added ? (
                            <>
                              <span>已添加</span>
                              <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-white">
                                <HugeiconsIcon
                                  aria-hidden="true"
                                  icon={Tick01Icon}
                                  size={11}
                                  strokeWidth={2.2}
                                />
                              </span>
                            </>
                          ) : (
                            "添加"
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <aside
                  aria-label="更多工具接入"
                  className="ai-skill-delivery px-6 pb-6 pt-4"
                >
                  <div className="ai-skill-delivery-banner ai-skill-delivery-banner--static">
                    <span className="ai-skill-delivery-banner__main">
                      <img
                        alt=""
                        aria-hidden="true"
                        className="ai-skill-delivery-banner__icon"
                        draggable={false}
                        src="https://b5.bokr.com.cn/dist/ui/skill_zan.png"
                      />
                      <span className="ai-skill-delivery-banner__copy">
                        <span className="ai-skill-delivery-banner__title">
                          更多工具接入
                        </span>
                        <span className="ai-skill-delivery-banner__description">
                          与客户成功经理交谈更多工具接入需求
                        </span>
                      </span>
                    </span>
                  </div>
                </aside>
              </>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeBasePicker({
  addedItems,
  onConfirm,
  onOpenChange,
  open,
}: {
  addedItems: readonly SkillResourceItem[];
  onConfirm: (items: readonly SkillResourceItem[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [items, setItems] = useState<KbListViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<
    Map<string, SkillResourceItem>
  >(() => new Map());
  const addedKbIdSet = useMemo(
    () =>
      new Set(
        addedItems.map((item) =>
          String(item.kbId ?? item.id.replace(/^kb:/u, "")),
        ),
      ),
    [addedItems],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchQuery("");
    setCurrentPage(1);
    setSelectedItems(
      new Map(
        addedItems.map((item) => [
          String(item.kbId ?? item.id.replace(/^kb:/u, "")),
          item,
        ]),
      ),
    );
  }, [addedItems, open]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadKnowledgeBases() {
      setLoading(true);
      setError(false);

      try {
        const response = await listKbs({
          page: currentPage,
          pageSize: KB_PICKER_PAGE_SIZE,
          query: debouncedSearchQuery.trim(),
        });

        if (cancelled) {
          return;
        }

        setItems(response.kbs.map(toKbListViewItem));
        setTotal(response.pagination.total);
      } catch {
        if (cancelled) {
          return;
        }

        setItems([]);
        setTotal(0);
        setError(true);
        toast.error("知识库列表加载失败，请稍后重试");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadKnowledgeBases();

    return () => {
      cancelled = true;
    };
  }, [currentPage, debouncedSearchQuery, open]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: KB_PICKER_PAGE_SIZE,
    total,
  });
  const selectedCount = selectedItems.size;
  const selectionChanged =
    selectedItems.size !== addedKbIdSet.size ||
    [...addedKbIdSet].some((itemId) => !selectedItems.has(itemId));

  function handleCheckedChange(item: KbListViewItem, checked: boolean) {
    if (
      checked &&
      !selectedItems.has(item.id) &&
      selectedCount >= AGENT_SKILL_KB_MAX_COUNT
    ) {
      toast.error(`一个技能最多可添加${AGENT_SKILL_KB_MAX_COUNT}个知识库`);
      return;
    }

    setSelectedItems((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(item.id, buildKnowledgeBaseResourceItem(item));
      } else {
        next.delete(item.id);
      }
      return next;
    });
  }

  return (
    <>
      <div className="px-6 pb-5">
        <div className="relative w-[280px] max-w-full">
          <HugeiconsIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索知识库"
            className="h-10 rounded-[8px] pl-9"
            maxLength={KB_SEARCH_QUERY_MAX_LENGTH}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索知识库"
            value={searchQuery}
          />
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-6">
        <Table className="min-w-[920px] table-fixed">
          <colgroup>
            <col className="w-[56px]" />
            <col className="w-[220px]" />
            <col className="w-[310px]" />
            <col className="w-[165px]" />
            <col className="w-[165px]" />
          </colgroup>
          <TableHeader className="[&_tr]:border-border/70">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 px-4">
                <span className="sr-only">选择</span>
              </TableHead>
              <TableHead className="h-11 px-4">知识库名称</TableHead>
              <TableHead className="h-11 px-4">描述</TableHead>
              <TableHead className="h-11 whitespace-nowrap px-4">
                最近更新时间
              </TableHead>
              <TableHead className="h-11 whitespace-nowrap px-4">
                创建时间
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {loading ? (
              <TableRow>
                <TableCell className="h-52 text-center" colSpan={5}>
                  <div
                    className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                    role="status"
                  >
                    <Spinner />
                    <span>正在加载</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  className="h-52 text-center text-sm text-destructive"
                  colSpan={5}
                  role="alert"
                >
                  加载失败
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-52 text-center text-sm text-muted-foreground"
                  colSpan={5}
                >
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const checked = selectedItems.has(item.id);
                const disabled =
                  !checked && selectedCount >= AGENT_SKILL_KB_MAX_COUNT;

                return (
                  <TableRow className="hover:bg-muted/30" key={item.id}>
                    <TableCell className="px-4 py-4">
                      <Checkbox
                        aria-label={`选择${item.name}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(nextChecked) =>
                          handleCheckedChange(item, nextChecked === true)
                        }
                      />
                    </TableCell>
                    <TableCell
                      className="px-4 py-4 font-medium text-foreground"
                      title={item.name}
                    >
                      <TableCellContent>{item.name}</TableCellContent>
                    </TableCell>
                    <TableCell
                      className="px-4 py-4 text-muted-foreground"
                      title={item.description}
                    >
                      <TableCellContent>{item.description || "-"}</TableCellContent>
                    </TableCell>
                    <TableCell
                      className="px-4 py-4 text-muted-foreground"
                      title={item.lastUpdatedAt}
                    >
                      <TableCellContent>{item.lastUpdatedAt}</TableCellContent>
                    </TableCell>
                    <TableCell
                      className="px-4 py-4 text-muted-foreground"
                      title={item.createdAt}
                    >
                      <TableCellContent>{item.createdAt}</TableCellContent>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="px-6">
        <TablePagination
          className="border-t-0 py-4"
          onPageChange={setCurrentPage}
          page={activePage}
          total={total}
          totalPages={totalPages}
        />
      </div>

      <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
        <span className="text-sm text-muted-foreground">
          已选择 {selectedCount}/{AGENT_SKILL_KB_MAX_COUNT}
        </span>
        <div className="flex items-center gap-3">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button
            disabled={!selectionChanged}
            onClick={() => onConfirm([...selectedItems.values()])}
            type="button"
          >
            确认
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function getInvalidSkillResourceGroups(
  resources: Record<ResourceSectionId, SkillResourceItem[]>,
): InvalidSkillResources {
  const invalidResources = {
    variables: resources.variables.filter(
      (resource) => resource.status === "invalid",
    ),
    tools: resources.tools.filter((resource) => resource.status === "invalid"),
    "knowledge-bases": resources["knowledge-bases"].filter(
      (resource) => resource.status === "invalid",
    ),
  };

  return Object.values(invalidResources).some((items) => items.length > 0)
    ? invalidResources
    : null;
}

function readInvalidSkillResourcesFromRequestError(
  error: unknown,
): InvalidSkillResources {
  if (!isRequestError(error) || error.code !== "SKILL_RESOURCES_INVALID") {
    return null;
  }

  const resources = {
    knowledgeBases: readInvalidKnowledgeBaseResources(
      error.details?.knowledgeBases,
    ),
    tools: readInvalidToolResources(error.details?.tools),
    variables: readInvalidVariableResources(error.details?.variables),
  } satisfies AgentSkillResources;

  const mapped = buildSelectedResources(resources);
  return Object.values(mapped).some((items) => items.length > 0) ? mapped : null;
}

function readInvalidKnowledgeBaseResources(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((resource) => {
    if (
      !isPlainObject(resource) ||
      typeof resource.id !== "string" ||
      typeof resource.kbId !== "number" ||
      typeof resource.name !== "string"
    ) {
      return [];
    }

    return [{
      id: resource.id,
      invalidReason: readInvalidReason(resource.invalidReason),
      kbId: resource.kbId,
      name: resource.name,
      status: "invalid" as const,
    }];
  });
}

function readInvalidToolResources(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((resource) => {
    if (
      !isPlainObject(resource) ||
      typeof resource.id !== "string" ||
      typeof resource.name !== "string" ||
      typeof resource.toolKey !== "string"
    ) {
      return [];
    }

    return [{
      id: resource.id,
      invalidReason: readInvalidReason(resource.invalidReason),
      name: resource.name,
      status: "invalid" as const,
      toolKey: resource.toolKey,
    }];
  });
}

function readInvalidVariableResources(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((resource) => {
    if (
      !isPlainObject(resource) ||
      typeof resource.id !== "string" ||
      typeof resource.name !== "string"
    ) {
      return [];
    }

    const variable = readAgentSkillVariable(resource.variable);
    if (!variable) {
      return [];
    }

    return [{
      id: resource.id,
      invalidReason: readInvalidReason(resource.invalidReason),
      name: resource.name,
      status: "invalid" as const,
      variable,
    }];
  });
}

function readAgentSkillVariable(value: unknown): AgentSkillVariable | null {
  if (!isPlainObject(value) || typeof value.name !== "string") {
    return null;
  }

  if (value.type === "custom_field" && typeof value.select_id === "number") {
    return {
      name: value.name,
      select_id: value.select_id,
      type: "custom_field",
    };
  }

  if (
    (value.type === "work_tag" || value.type === "mall_tag") &&
    typeof value.select_id === "number" &&
    Array.isArray(value.select_sub_ids) &&
    value.select_sub_ids.every((item) => typeof item === "number")
  ) {
    return {
      name: value.name,
      select_id: value.select_id,
      select_sub_ids: value.select_sub_ids,
      type: value.type,
    };
  }

  if (
    (value.type === "system_variable" || value.type === "auto_tag") &&
    typeof value.select_key === "string"
  ) {
    return {
      name: value.name,
      select_key: value.select_key,
      type: value.type,
    };
  }

  return null;
}

function readInvalidReason(
  value: unknown,
): AiHostingAgentResourceInvalidReason | undefined {
  return value === "deleted" || value === "disabled" || value === "unavailable"
    ? value
    : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeInvalidSkillResourceGroups(
  current: Record<ResourceSectionId, SkillResourceItem[]>,
  invalid: Exclude<InvalidSkillResources, null>,
) {
  return {
    variables: mergeInvalidSkillResourceList(current.variables, invalid.variables),
    tools: mergeInvalidSkillResourceList(current.tools, invalid.tools),
    "knowledge-bases": mergeInvalidSkillResourceList(
      current["knowledge-bases"],
      invalid["knowledge-bases"],
    ),
  };
}

function mergeInvalidSkillResourceList(
  current: readonly SkillResourceItem[],
  invalid: readonly SkillResourceItem[],
) {
  const invalidMap = new Map(invalid.map((resource) => [resource.id, resource]));
  const merged = current.map((resource) => {
    const invalidResource = invalidMap.get(resource.id);
    if (!invalidResource) {
      return resource;
    }

    invalidMap.delete(resource.id);
    return {
      ...resource,
      invalidReason: invalidResource.invalidReason,
      status: "invalid" as const,
      title: invalidResource.title,
    };
  });

  return [...merged, ...invalidMap.values()];
}
