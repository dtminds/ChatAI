import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add01Icon,
  AbsoluteIcon,
  AiBookIcon,
  ApiIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  File01Icon,
  File02Icon,
  Search01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AGENT_SKILL_APPLY_SCENE_MAX_LENGTH,
  AGENT_SKILL_KB_MAX_COUNT,
  AGENT_SKILL_NAME_MAX_LENGTH,
  KB_SEARCH_QUERY_MAX_LENGTH,
} from "@chatai/contracts";
import type { LexicalEditor } from "lexical";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
  createAgentSkill,
  getAgentSkill,
  updateAgentSkill,
} from "./api/agent-skill-service";
import { listKbs, toKbListViewItem } from "./api/kb-service";
import {
  SKILL_CREATE_DRAFT_STATE_KEY,
  type SkillCreateDraft,
} from "./ai-skill-create-draft";
import { AiSkillDescriptionField } from "./ai-skill-description-field";
import { INSERT_SKILL_CONTENT_RESOURCE_COMMAND } from "./ai-skill-description-lexical-commands";
import { InsertVariableDialog } from "./ai-skill-insert-variable-dialog";
import { AiSkillReferenceMenu } from "./ai-skill-reference-menu";
import {
  buildKnowledgeBasePlaceholder,
  buildSkillVariableResourceItem,
  buildToolPlaceholder,
  parseSkillContentSegments,
  removeResourceFromSkillContent,
  serializeSkillContentSegments,
  toSkillContentResourceSegment,
  type SkillContentSegment,
  type SkillResourceItem,
} from "./ai-skill-resource";
import { AiHostingLayout } from "./ai-hosting-layout";
import type { KbListViewItem } from "./kb-types";
import "./agent-module.css";

const KB_NAME_LOOKUP_PAGE_SIZE = 100;
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

/** 与需求文档当前可选工具列表对齐 */
const staticInsertItems: Partial<
  Record<ResourceSectionId, readonly ResourceCatalogItem[]>
> = {
  tools: [
    {
      description: "根据客户提供的小店订单号，查询订单的物流状态与轨迹信息",
      icon: ApiIcon,
      id: "search_mall_order_logistics",
      placeholder: buildToolPlaceholder("search_mall_order_logistics", "小店订单物流查询"),
      title: "小店订单物流查询",
      toolKey: "search_mall_order_logistics",
    },
    {
      description: "代客户将提供的订单号转换为积分",
      icon: ApiIcon,
      id: "transfer_mall_point",
      placeholder: buildToolPlaceholder("transfer_mall_point", "代客转积分"),
      title: "代客转积分",
      toolKey: "transfer_mall_point",
    },
    {
      description: "为客户的小店订单添加或更新备注",
      icon: ApiIcon,
      id: "remark_mall_order",
      placeholder: buildToolPlaceholder("remark_mall_order", "小店订单备注"),
      title: "小店订单备注",
      toolKey: "remark_mall_order",
    },
    {
      description: "根据客户提供的订单号查询订单信息",
      icon: ApiIcon,
      id: "search_order",
      placeholder: buildToolPlaceholder("search_order", "订单查询"),
      title: "订单查询",
      toolKey: "search_order",
    },
    {
      description: "根据客户提供的订单号，为客户关联绑定订单至客户画像",
      icon: ApiIcon,
      id: "bind_order",
      placeholder: buildToolPlaceholder("bind_order", "绑定订单"),
      title: "绑定订单",
      toolKey: "bind_order",
    },
  ],
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
    title: item.name,
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
  const [removeTarget, setRemoveTarget] = useState<{
    item: SkillResourceItem;
    sectionId: ResourceSectionId;
    singular: string;
  } | null>(null);

  const canSubmit = name.trim().length > 0 && !pageLoading && !pageError;

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
        const [detail, kbResponse] = await Promise.all([
          getAgentSkill(skillId!),
          listKbs({ page: 1, pageSize: KB_NAME_LOOKUP_PAGE_SIZE }),
        ]);
        if (cancelled) {
          return;
        }

        const kbNameById = new Map(
          kbResponse.kbs.map((item) => {
            const view = toKbListViewItem(item);
            return [view.id, view.name] as const;
          }),
        );
        const toolCatalog = staticInsertItems.tools ?? [];

        setName(detail.name);
        setApplicationScenario(detail.applyScene);
        setSkillContentSegments(parseSkillContentSegments(detail.content));
        setSelectedResources({
          variables: detail.variables.map((variable) =>
            buildSkillVariableResourceItem(variable),
          ),
          tools: detail.tools.map((toolKey) => {
            const catalogItem = toolCatalog.find((item) => item.toolKey === toolKey);
            if (catalogItem) {
              return {
                description: catalogItem.description,
                id: catalogItem.id,
                placeholder: catalogItem.placeholder,
                title: catalogItem.title,
                toolKey: catalogItem.toolKey,
              };
            }

            return {
              description: "",
              id: toolKey,
              placeholder: buildToolPlaceholder(toolKey, toolKey),
              title: toolKey,
              toolKey,
            };
          }),
          "knowledge-bases": detail.kbs.map((kbId) => {
            const title = kbNameById.get(String(kbId)) ?? `知识库 ${kbId}`;
            return {
              description: "",
              id: `kb:${kbId}`,
              kbId,
              placeholder: buildKnowledgeBasePlaceholder(kbId, title),
              title,
            };
          }),
        });
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
    } catch {
      toast.error(skillId ? "保存失败，请稍后重试" : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddResource(sectionId: ResourceSectionId, item: SkillResourceItem) {
    setSelectedResources((current) => {
      if (current[sectionId].some((selected) => selected.id === item.id)) {
        return current;
      }

      return {
        ...current,
        [sectionId]: [...current[sectionId], item],
      };
    });

    toast.success("已添加");
  }

  function handleChangeKnowledgeBases(items: readonly SkillResourceItem[]) {
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
    if (!removeTarget) {
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
    if (!item.placeholder) {
      return;
    }

    descriptionEditorRef.current?.dispatchCommand(
      INSERT_SKILL_CONTENT_RESOURCE_COMMAND,
      toSkillContentResourceSegment(item),
    );
    descriptionEditorRef.current?.focus();
  }

  return (
    <AiHostingLayout title="技能设置">
      <div className="space-y-6">
        <header className="space-y-3">
          <Button
            asChild
            className="-ml-2 h-8 gap-1 px-2 text-sm text-muted-foreground"
            type="button"
            variant="ghost"
          >
            <Link to="/chat/ai-hosting/skills?tab=mine">
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
              返回我的技能
            </Link>
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold leading-tight text-foreground">
              技能设置
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <Button onClick={handleCancel} type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={!canSubmit || submitting}
                onClick={() => void handleSubmit()}
                type="button"
              >
                确认提交
              </Button>
            </div>
          </div>
        </header>

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
              <div className="mb-5 flex items-start justify-between gap-4">
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
                <AiSkillReferenceMenu
                  knowledgeBases={selectedResources["knowledge-bases"]}
                  onSelectResource={handleInsertReferencedResource}
                  tools={selectedResources.tools}
                  variables={selectedResources.variables}
                />
              </div>
              <AiSkillDescriptionField
                editorRef={descriptionEditorRef}
                onChange={setSkillContentSegments}
                segments={skillContentSegments}
              />
            </section>
          </div>

          <aside
            aria-labelledby="skill-insert-resources-title"
            className="h-fit rounded-[14px] border border-border bg-card p-5"
          >
            <h2
              className="mb-4 text-base font-semibold text-foreground"
              id="skill-insert-resources-title"
            >
              资源管理
            </h2>
            <div className="space-y-5">
              {resourceSections.map((section) => (
                <SkillResourceSection
                  icon={section.icon}
                  items={selectedResources[section.id]}
                  key={section.id}
                  onAdd={() => {
                    if (section.id === "variables") {
                      setVariableDialogOpen(true);
                    }
                    setActiveInsertSection(section.id);
                  }}
                  onRemove={(itemId) => handleRemoveResource(section.id, itemId)}
                  title={section.title}
                />
              ))}
            </div>
          </aside>
        </div>
        )}
      </div>

      <InsertVariableDialog
        onConfirm={(item) => {
          handleAddResource("variables", item);
          setVariableDialogOpen(false);
          if (activeInsertSection === "variables") {
            setActiveInsertSection(null);
          }
        }}
        onOpenChange={(open) => {
          setVariableDialogOpen(open);
          if (!open && activeInsertSection === "variables") {
            setActiveInsertSection(null);
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

function SkillResourceSection({
  icon,
  items,
  onAdd,
  onRemove,
  title,
}: {
  icon: typeof AbsoluteIcon;
  items: readonly SkillResourceItem[];
  onAdd: () => void;
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
            className="flex flex-col items-center justify-center gap-3 px-2 py-6"
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
          <ul aria-label={`已添加${title}`} className="space-y-1 px-0.5 py-2">
            {items.map((item) => (
              <li key={item.id}>
                <div className="group flex min-w-0 items-center gap-2 rounded-[8px] bg-muted/40 px-2 py-1.5 transition-colors hover:bg-muted/70">
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground"
                    icon={icon}
                    size={15}
                    strokeWidth={1.8}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {item.title}
                  </span>
                  <Button
                    aria-label={`删除${item.title}`}
                    className="size-6 shrink-0 rounded-[6px] p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
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
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
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
            : "max-w-[760px] gap-0 p-0 sm:rounded-[14px]"
        }
      >
        {meta ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-4 pt-6 pr-14">
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
              <ul
                aria-label={meta.title}
                className="max-h-[min(28rem,calc(100vh-12rem))] space-y-5 overflow-y-auto px-6 pb-6 pt-3"
              >
                {items.map((item) => {
                  const added = addedIdSet.has(item.id);

                  return (
                    <li className="flex items-start gap-3" key={item.id}>
                      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={item.icon}
                          size={16}
                          strokeWidth={1.8}
                        />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.description ? (
                          <p className="text-sm leading-5 text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        aria-label={added ? `已添加${item.title}` : `添加${item.title}`}
                        className="mt-0.5 h-8 shrink-0 px-3 text-primary"
                        disabled={added}
                        onClick={() => onAdd(item)}
                        type="button"
                        variant="outline"
                      >
                        {added ? "已添加" : "添加"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
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
