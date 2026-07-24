import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Database01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LexicalEditor } from "lexical";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { listKbs, toKbListViewItem } from "./api/kb-service";
import { AiSkillDescriptionField } from "./ai-skill-description-field";
import { INSERT_SKILL_CONTENT_RESOURCE_COMMAND } from "./ai-skill-description-lexical-commands";
import { InsertVariableDialog } from "./ai-skill-insert-variable-dialog";
import { AiSkillReferenceMenu } from "./ai-skill-reference-menu";
import {
  buildKnowledgeBasePlaceholder,
  buildToolPlaceholder,
  serializeSkillContentSegments,
  toSkillContentResourceSegment,
  type SkillContentSegment,
  type SkillResourceItem,
} from "./ai-skill-resource";
import { AiHostingLayout } from "./ai-hosting-layout";

/** 与表 xy_wap_embed_agent_skill.name varchar(50) 对齐 */
const SKILL_NAME_MAX_LENGTH = 50;
const KB_PICKER_PAGE_SIZE = 100;
const emptyStateIllustrationUrl = "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

type ResourceSectionId = "variables" | "tools" | "knowledge-bases";

type ResourceCatalogItem = SkillResourceItem & {
  icon: typeof Database01Icon | typeof File01Icon;
};

const resourceSections = [
  { id: "variables", title: "变量" },
  { id: "tools", title: "工具" },
  { id: "knowledge-bases", title: "知识库" },
] as const satisfies ReadonlyArray<{ id: ResourceSectionId; title: string }>;

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
    title: "插入知识库",
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
      description: "查询小店订单物流状态与轨迹信息",
      icon: Database01Icon,
      id: "search_mall_order_logistics",
      placeholder: buildToolPlaceholder("search_mall_order_logistics", "小店订单物流查询"),
      title: "小店订单物流查询",
      toolKey: "search_mall_order_logistics",
    },
    {
      description: "代客户将积分转入指定账户",
      icon: Database01Icon,
      id: "transfer_mall_point",
      placeholder: buildToolPlaceholder("transfer_mall_point", "代客转积分"),
      title: "代客转积分",
      toolKey: "transfer_mall_point",
    },
    {
      description: "为小店订单添加或更新备注",
      icon: Database01Icon,
      id: "remark_mall_order",
      placeholder: buildToolPlaceholder("remark_mall_order", "小店订单备注"),
      title: "小店订单备注",
      toolKey: "remark_mall_order",
    },
    {
      description: "根据订单号查询订单信息",
      icon: Database01Icon,
      id: "search_order",
      placeholder: buildToolPlaceholder("search_order", "订单查询"),
      title: "订单查询",
      toolKey: "search_order",
    },
    {
      description: "将订单与当前客户进行绑定",
      icon: Database01Icon,
      id: "bind_order",
      placeholder: buildToolPlaceholder("bind_order", "绑定订单"),
      title: "绑定订单",
      toolKey: "bind_order",
    },
  ],
};

export function AiSkillSettingsPage() {
  const navigate = useNavigate();
  const descriptionEditorRef = useRef<LexicalEditor | null>(null);
  const [name, setName] = useState("");
  const [applicationScenario, setApplicationScenario] = useState("");
  const [skillContentSegments, setSkillContentSegments] = useState<
    SkillContentSegment[]
  >([{ type: "text", value: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResources, setSelectedResources] = useState<
    Record<ResourceSectionId, SkillResourceItem[]>
  >({
    variables: [],
    tools: [],
    "knowledge-bases": [],
  });
  const [activeInsertSection, setActiveInsertSection] =
    useState<ResourceSectionId | null>(null);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);

  const canSubmit = name.trim().length > 0;

  function goBackToMySkills() {
    navigate("/chat/ai-hosting/skills?tab=mine");
  }

  function handleCancel() {
    goBackToMySkills();
  }

  function handleSubmit() {
    if (!canSubmit || submitting) {
      return;
    }

    // 提交结构对齐 xy_wap_embed_agent_skill（接口就绪后直接复用）
    const payload = {
      apply_scene: applicationScenario.trim(),
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

    // payload 对齐 xy_wap_embed_agent_skill，接口就绪后改为 createSkill(payload)
    void payload;

    setSubmitting(true);
    toast.success("技能已提交");
    setSubmitting(false);
    goBackToMySkills();
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
    <AiHostingLayout title="AI技能设置">
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
              AI技能设置
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <Button onClick={handleCancel} type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
                type="button"
              >
                确认提交
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            <section
              aria-labelledby="skill-basic-settings-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <h2
                className="mb-4 text-base font-semibold text-foreground"
                id="skill-basic-settings-title"
              >
                基本设置
              </h2>
              <div className="space-y-2">
                <Label htmlFor="skill-name">
                  <span className="text-destructive">*</span> 技能名称
                </Label>
                <div className="relative">
                  <Input
                    aria-required="true"
                    className="h-10 pr-14"
                    id="skill-name"
                    maxLength={SKILL_NAME_MAX_LENGTH}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="请输入"
                    value={name}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {name.length}/{SKILL_NAME_MAX_LENGTH}
                  </span>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="skill-scenario-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <h2
                className="mb-4 text-base font-semibold text-foreground"
                id="skill-scenario-title"
              >
                技能应用场景
              </h2>
              <Textarea
                aria-labelledby="skill-scenario-title"
                className="min-h-36"
                onChange={(event) => setApplicationScenario(event.target.value)}
                placeholder="描述在什么情形下，AI可以调用这个技能"
                value={applicationScenario}
              />
            </section>

            <section
              aria-labelledby="skill-description-title"
              className="rounded-[14px] border border-border bg-card p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2
                  className="text-base font-semibold text-foreground"
                  id="skill-description-title"
                >
                  技能描述
                </h2>
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
              className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground"
              id="skill-insert-resources-title"
            >
              <HugeiconsIcon
                aria-hidden="true"
                className="text-muted-foreground"
                icon={File01Icon}
                size={16}
                strokeWidth={1.8}
              />
              插入资源
            </h2>
            <div className="space-y-5">
              {resourceSections.map((section) => (
                <SkillResourceSection
                  items={selectedResources[section.id]}
                  key={section.id}
                  onAdd={() => {
                    if (section.id === "variables") {
                      setVariableDialogOpen(true);
                    }
                    setActiveInsertSection(section.id);
                  }}
                  title={section.title}
                />
              ))}
            </div>
          </aside>
        </div>
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

      <InsertResourceDialog
        addedIds={
          activeInsertSection && activeInsertSection !== "variables"
            ? selectedResources[activeInsertSection].map((item) => item.id)
            : []
        }
        onAdd={(item) => {
          if (!activeInsertSection || activeInsertSection === "variables") {
            return;
          }
          handleAddResource(activeInsertSection, item);
        }}
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
  items,
  onAdd,
  title,
}: {
  items: readonly SkillResourceItem[];
  onAdd: () => void;
  title: string;
}) {
  const [open, setOpen] = useState(true);
  const contentId = useMemo(() => `skill-resource-${title}`, [title]);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="flex items-center gap-2 py-0.5">
        <CollapsibleTrigger asChild>
          <Button
            aria-controls={contentId}
            aria-expanded={open}
            aria-label={`${open ? "收起" : "展开"}${title}`}
            className="size-7 shrink-0 p-0 text-muted-foreground"
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              icon={open ? ArrowDown01Icon : ArrowUp01Icon}
              size={14}
              strokeWidth={1.8}
            />
          </Button>
        </CollapsibleTrigger>
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</p>
        <Button
          aria-label={`添加${title}`}
          className="size-6 shrink-0 rounded-[6px] p-0"
          onClick={onAdd}
          size="icon"
          type="button"
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
              className="size-20 object-contain opacity-50"
              src={emptyStateIllustrationUrl}
            />
            <p className="text-sm text-muted-foreground">暂未配置技能</p>
          </div>
        ) : (
          <ul aria-label={`已添加${title}`} className="space-y-3 px-1 py-3">
            {items.map((item) => (
              <li className="min-w-0 space-y-1" key={item.id}>
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function InsertResourceDialog({
  addedIds,
  onAdd,
  onOpenChange,
  open,
  sectionId,
}: {
  addedIds: readonly string[];
  onAdd: (item: SkillResourceItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sectionId: Exclude<ResourceSectionId, "variables"> | null;
}) {
  const meta = sectionId ? insertDialogMeta[sectionId] : null;
  const addedIdSet = useMemo(() => new Set(addedIds), [addedIds]);
  const [knowledgeBases, setKnowledgeBases] = useState<ResourceCatalogItem[]>([]);
  const [knowledgeBasesLoading, setKnowledgeBasesLoading] = useState(false);
  const [knowledgeBasesError, setKnowledgeBasesError] = useState(false);

  useEffect(() => {
    if (!open || sectionId !== "knowledge-bases") {
      return;
    }

    let cancelled = false;

    async function loadKnowledgeBases() {
      setKnowledgeBasesLoading(true);
      setKnowledgeBasesError(false);

      try {
        const response = await listKbs({
          page: 1,
          pageSize: KB_PICKER_PAGE_SIZE,
        });

        if (cancelled) {
          return;
        }

        setKnowledgeBases(
          response.kbs.map((item) => {
            const viewItem = toKbListViewItem(item);
            const kbId = Number(viewItem.id);

            return {
              description: viewItem.description,
              icon: File01Icon,
              id: viewItem.id,
              kbId: Number.isFinite(kbId) ? kbId : undefined,
              placeholder: buildKnowledgeBasePlaceholder(viewItem.id, viewItem.name),
              title: viewItem.name,
            };
          }),
        );
      } catch {
        if (cancelled) {
          return;
        }

        setKnowledgeBases([]);
        setKnowledgeBasesError(true);
        toast.error("知识库列表加载失败，请稍后重试");
      } finally {
        if (!cancelled) {
          setKnowledgeBasesLoading(false);
        }
      }
    }

    void loadKnowledgeBases();

    return () => {
      cancelled = true;
    };
  }, [open, sectionId]);

  const items =
    sectionId === "knowledge-bases"
      ? knowledgeBases
      : sectionId
        ? (staticInsertItems[sectionId] ?? [])
        : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[760px] gap-0 p-0 sm:rounded-[14px]">
        {meta ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-2 pt-6 pr-14">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {meta.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                选择要插入的{meta.title.replace("插入", "")}
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

            {sectionId === "knowledge-bases" && knowledgeBasesLoading ? (
              <div
                className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground"
                role="status"
              >
                <Spinner />
                <span>正在加载</span>
              </div>
            ) : sectionId === "knowledge-bases" && knowledgeBasesError ? (
              <div className="px-6 py-16 text-center text-sm text-destructive" role="alert">
                加载失败
              </div>
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
