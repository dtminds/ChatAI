import { useEffect, useMemo, useState } from "react";
import {
  Add01Icon,
  AbsoluteIcon,
  AiBookIcon,
  ApiIcon,
  Cancel01Icon,
  ClipboardIcon,
  Message01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  AgentSkillListItem,
  AgentSkillTemplateDetail,
  AgentSkillTemplateListItem,
  AgentSkillTemplateRecommendItem,
} from "@chatai/contracts";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import {
  deleteAgentSkill,
  listAgentSkills,
  updateAgentSkillStatus,
} from "./api/agent-skill-service";
import { canManageAiHostingAgents } from "./agent-permissions";
import {
  getSkillTemplate,
  listSkillTemplates,
} from "./api/skill-template-service";
import {
  SKILL_CREATE_DRAFT_STATE_KEY,
  type SkillCreateDraft,
} from "./ai-skill-create-draft";
import { SkillContentView } from "./ai-skill-content-view";
import { SkillPreviewEditResourcesDialog } from "./ai-skill-preview-edit-resources-dialog";
import {
  buildEditableResourcesFromRecommendations,
  collectCompleteSkillResourcesFromContent,
  mergeSkillResourceItems,
  type SkillRecommendBinding,
} from "./ai-skill-resource";
import { SkillDeliveryBanner } from "./ai-skill-delivery-banner";
import { AiHostingIntroGuide } from "./ai-hosting-intro-guide";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { TableOverflowTooltip } from "./kb-components/shared";
import "./ai-skill-template-detail.css";

type SkillRecommendation = {
  description: string;
  title: string;
};

type SkillItem = {
  description: string;
  icon: string;
  id: string;
  tip: string;
  title: string;
};

type SkillDetailItem = SkillItem & {
  applicationScenario: string;
  recommendBindings: readonly SkillRecommendBinding[];
  recommendedKnowledgeBases: readonly SkillRecommendation[];
  recommendedTools: readonly SkillRecommendation[];
  recommendedVariables: readonly SkillRecommendation[];
  skillDescription: string;
};

const MARKETPLACE_SECTION_TITLE = "示例模板";

const skillTabs = [
  { label: "我的技能", value: "mine" },
  { label: "技能广场", value: "marketplace" },
] as const;

const skillIntroSteps = [
  {
    description: "明确技能使用场景，将业务经验整理成可复用的资产",
    imageAlt: "编写技能示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/skill_f1.png",
    step: "第 1 步",
    title: "编写技能",
  },
  {
    description: "配置变量、工具和知识库，让 Agent 有据可依",
    imageAlt: "打通数据示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/skill_f2.png",
    step: "第 2 步",
    title: "打通数据",
  },
  {
    description: "在 Agent 中关联技能，让服务更贴合业务",
    imageAlt: "Agent 集成示意图",
    imageUrl: "https://b5.bokr.com.cn/dist/ui/skill_f3.png",
    step: "第 3 步",
    title: "Agent 集成",
  },
] as const;

const detailTabs = [
  { label: "技能应用场景", value: "scenario" },
  { label: "技能描述", value: "description" },
] as const;

type MySkillItem = AgentSkillListItem;

const MY_SKILLS_PAGE_SIZE = 10;
const MY_SKILLS_SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function AiSkillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const activeTab =
    searchParams.get("tab") === "marketplace" ? "marketplace" : "mine";

  return (
    <AiHostingLayout title="技能">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="将业务经验沉淀为技能，让 Agent 更懂业务"
          title="技能"
        />

        <AiHostingIntroGuide ariaLabel="技能使用引导" steps={skillIntroSteps} />

        <Tabs
          className="gap-6"
          onValueChange={(value) => {
            setSearchParams(
              value === "marketplace" ? { tab: "marketplace" } : {},
              { replace: true },
            );
          }}
          value={activeTab}
        >
          <TabsList aria-label="AI技能视图" className="w-fit">
            {skillTabs.map((tab) => (
              <TabsTrigger className="min-w-24 px-4" key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent className="space-y-8" value="marketplace">
            <SkillMarketplacePanel onSelectSkill={setSelectedSkill} />
          </TabsContent>

          <TabsContent value="mine">
            <MySkillsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <SkillDetailDialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSkill(null);
          }
        }}
        open={selectedSkill != null}
        skill={selectedSkill}
      />
    </AiHostingLayout>
  );
}

function SkillMarketplacePanel({
  onSelectSkill,
}: {
  onSelectSkill: (skill: SkillItem) => void;
}) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketplace() {
      setLoading(true);
      setLoadError(false);

      try {
        const response = await listSkillTemplates();
        if (cancelled) {
          return;
        }

        setSkills(
          response.groups.flatMap((group) =>
            group.templates.map(mapTemplateToSkillItem),
          ),
        );
      } catch {
        if (!cancelled) {
          setSkills([]);
          setLoadError(true);
          toast.error("技能广场加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMarketplace();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner size={16} />
        <span>正在加载</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-[12px] border border-border/80 px-4 py-10 text-center text-sm text-destructive">
          <span role="alert">加载失败</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-[12px] border border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : (
        <section aria-labelledby="ai-skill-marketplace-title" className="space-y-4">
          <h2
            className="text-base font-semibold text-foreground"
            id="ai-skill-marketplace-title"
          >
            {MARKETPLACE_SECTION_TITLE}
          </h2>
          <ul
            aria-label={MARKETPLACE_SECTION_TITLE}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {skills.map((skill) => (
              <li key={skill.id}>
                <SkillCard onSelect={onSelectSkill} skill={skill} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <SkillDeliveryBanner />
    </div>
  );
}

function mapTemplateToSkillItem(template: AgentSkillTemplateListItem): SkillItem {
  return {
    id: template.id,
    title: template.name,
    description: template.description,
    tip: template.tip,
    icon: template.icon,
  };
}

function mapTemplateDetailToSkillItem(
  template: AgentSkillTemplateDetail,
): SkillDetailItem {
  return {
    ...mapTemplateToSkillItem(template),
    applicationScenario: template.applyScene,
    skillDescription: template.content,
    recommendBindings: template.recommendResources.map(toRecommendBinding),
    recommendedVariables: filterRecommendations(template.recommendResources, "variable"),
    recommendedTools: filterRecommendations(template.recommendResources, "tool"),
    recommendedKnowledgeBases: filterRecommendations(
      template.recommendResources,
      "knowledge_base",
    ),
  };
}

function toRecommendBinding(
  item: AgentSkillTemplateRecommendItem,
): SkillRecommendBinding {
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    ...(item.variableType ? { variableType: item.variableType } : {}),
  };
}

function filterRecommendations(
  items: readonly AgentSkillTemplateRecommendItem[],
  type: AgentSkillTemplateRecommendItem["type"],
): SkillRecommendation[] {
  return items
    .filter((item) => item.type === type)
    .map((item) => ({
      title: item.title,
      description: item.description,
    }));
}

function MySkillsPanel() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.subUser?.role);
  const canManage = canManageAiHostingAgents(role);
  const [skills, setSkills] = useState<MySkillItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery.trim(),
    MY_SKILLS_SEARCH_DEBOUNCE_MS,
  );
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [enableTargetId, setEnableTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSkills() {
      setLoading(true);
      setLoadError(false);

      try {
        const response = await listAgentSkills({
          page,
          pageSize: MY_SKILLS_PAGE_SIZE,
          query: debouncedSearchQuery || undefined,
        });
        if (cancelled) {
          return;
        }

        setSkills(response.skills);
        setTotal(response.pagination.total);
      } catch {
        if (!cancelled) {
          setSkills([]);
          setTotal(0);
          setLoadError(true);
          toast.error("技能列表加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSkills();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, page, reloadKey]);

  const { activePage, totalPages } = resolveTablePagination({
    page,
    pageSize: MY_SKILLS_PAGE_SIZE,
    total,
  });

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  async function handleDisable(skillId: string) {
    if (!canManage || actionSubmitting) {
      return;
    }

    setActionSubmitting(true);
    try {
      await updateAgentSkillStatus(skillId, "disabled");
      setReloadKey((current) => current + 1);
    } catch {
      toast.error("停用失败，请稍后重试");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleConfirmEnable() {
    if (!canManage || !enableTargetId || actionSubmitting) {
      return;
    }

    setActionSubmitting(true);
    try {
      await updateAgentSkillStatus(enableTargetId, "enabled");
      setEnableTargetId(null);
      setReloadKey((current) => current + 1);
    } catch {
      toast.error("启用失败，请稍后重试");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!canManage || !deleteTargetId || actionSubmitting) {
      return;
    }

    setActionSubmitting(true);
    try {
      await deleteAgentSkill(deleteTargetId);
      setDeleteTargetId(null);
      if (page > 1 && skills.length === 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        setReloadKey((current) => current + 1);
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <section aria-label="我的技能" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-[280px] max-w-full">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索技能"
            className="h-10 rounded-[8px] pl-9"
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索技能"
            value={searchQuery}
          />
        </div>

        {canManage ? (
          <Button
            className="h-10 px-4"
            onClick={() => navigate("/chat/ai-hosting/skills/new")}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
            <span>添加技能</span>
          </Button>
        ) : null}
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          当前账号仅可查看技能，管理操作需管理员权限
        </p>
      ) : null}

      <div>
        <Table aria-label="我的技能列表" className="min-w-[1080px] table-fixed">
          <colgroup>
            <col className="w-[180px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[180px]" />
            <col className="w-[180px]" />
            <col className="w-[180px]" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 px-4">技能名称</TableHead>
              <TableHead className="h-11 px-4">应用场景</TableHead>
              <TableHead className="h-11 whitespace-nowrap px-4">状态</TableHead>
              <TableHead className="h-11 whitespace-nowrap px-4">更新时间</TableHead>
              <TableHead className="h-11 whitespace-nowrap px-4">创建时间</TableHead>
              <TablePinnedHead className="h-11 whitespace-nowrap px-4 text-right">
                操作
              </TablePinnedHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <KbTableLoadingRow colSpan={6} />
            ) : loadError ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-sm text-destructive"
                  colSpan={6}
                >
                  <span role="alert">加载失败</span>
                </TableCell>
              </TableRow>
            ) : skills.length > 0 ? (
              skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell className="px-4 py-4 font-medium text-foreground">
                    <Link
                      className="block min-w-0 max-w-full text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      to={`/chat/ai-hosting/skills/${skill.id}/edit`}
                    >
                      <TableOverflowTooltip
                        className="font-medium text-foreground"
                        tooltip={skill.name}
                      >
                        {skill.name}
                      </TableOverflowTooltip>
                    </Link>
                  </TableCell>
                  <TableCell
                    className="px-4 py-4 text-muted-foreground"
                    title={skill.applyScene}
                  >
                    <p className="line-clamp-2 text-sm leading-6">
                      {skill.applyScene}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span
                      className={cn(
                        "text-sm",
                        skill.status === "enabled"
                          ? "text-emerald-600"
                          : "text-muted-foreground",
                      )}
                    >
                      {skill.status === "enabled" ? "已启用" : "未启用"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-muted-foreground">
                    <TableCellContent>{skill.updatedAt}</TableCellContent>
                  </TableCell>
                  <TableCell className="px-4 py-4 text-muted-foreground">
                    <TableCellContent>{skill.createdAt}</TableCellContent>
                  </TableCell>
                  <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`打开 ${skill.name} 操作菜单`}
                          className="size-8 p-0 text-muted-foreground"
                          disabled={canManage && actionSubmitting}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={MoreHorizontalIcon}
                            size={18}
                            strokeWidth={1.8}
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/chat/ai-hosting/skills/${skill.id}/edit`}>
                            {canManage ? "编辑" : "查看"}
                          </Link>
                        </DropdownMenuItem>
                        {canManage ? (
                          <>
                            {skill.status === "enabled" ? (
                              <DropdownMenuItem
                                onSelect={() => void handleDisable(skill.id)}
                              >
                                停用
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => setEnableTargetId(skill.id)}
                              >
                                启用
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTargetId(skill.id)}
                            >
                              删除
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TablePinnedCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-sm text-muted-foreground"
                  colSpan={6}
                >
                  <span role="status">暂无数据</span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <TablePagination
          onPageChange={setPage}
          page={activePage}
          total={total}
          totalPages={totalPages}
        />
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setEnableTargetId(null);
          }
        }}
        open={enableTargetId != null}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认启用？</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              确认后将启用该技能
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmEnable();
              }}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        open={deleteTargetId != null}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认删除？</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              确认后将删除该技能
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="border-destructive bg-background text-destructive hover:bg-destructive/5"
              disabled={actionSubmitting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SkillCard({
  onSelect,
  skill,
}: {
  onSelect: (skill: SkillItem) => void;
  skill: SkillItem;
}) {
  return (
    <button
      className="flex h-full w-full flex-col gap-3 rounded-[14px] border border-border/80 bg-card p-4 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-4 focus-visible:ring-ring/20"
      onClick={() => onSelect(skill)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-3">
        <SkillIcon icon={skill.icon} title={skill.title} />
        <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
          {skill.title}
        </h3>
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {skill.description}
      </p>
    </button>
  );
}

function SkillDetailDialog({
  onOpenChange,
  open,
  skill,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  skill: SkillItem | null;
}) {
  const navigate = useNavigate();
  const [editResourcesOpen, setEditResourcesOpen] = useState(false);
  const [detail, setDetail] = useState<SkillDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  useEffect(() => {
    if (!open || !skill) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }

    let cancelled = false;
    const templateId = skill.id;
    setEditResourcesOpen(false);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(false);

    async function loadDetail() {
      try {
        const response = await getSkillTemplate(templateId);
        if (!cancelled) {
          setDetail(mapTemplateDetailToSkillItem(response));
        }
      } catch {
        if (!cancelled) {
          setDetailError(true);
          toast.error("技能详情加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [open, skill]);

  // 预览技能是否弹「编辑资源」只看 recommendResources，不扫描述里的蓝色块
  const editableResources = useMemo(
    () =>
      detail
        ? buildEditableResourcesFromRecommendations(detail.recommendBindings)
        : [],
    [detail],
  );

  function goToCreateSkill(draft: SkillCreateDraft) {
    setEditResourcesOpen(false);
    onOpenChange(false);
    navigate("/chat/ai-hosting/skills/new", {
      state: {
        [SKILL_CREATE_DRAFT_STATE_KEY]: draft,
      },
    });
  }

  function handlePreviewSkill() {
    if (!detail) {
      return;
    }

    if (editableResources.length > 0) {
      setEditResourcesOpen(true);
      return;
    }

    goToCreateSkill({
      name: detail.title,
      applyScene: detail.applicationScenario,
      content: detail.skillDescription,
      resources: collectCompleteSkillResourcesFromContent(detail.skillDescription),
    });
  }

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditResourcesOpen(false);
          }
          onOpenChange(nextOpen);
        }}
        open={open}
      >
        <DialogContent
          className="flex h-[min(44rem,calc(100vh-2rem))] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[12px]"
          closeButtonVisible={false}
        >
          {skill ? (
            <>
              <div className="scrollbar-none flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 bg-background/80 px-6 pb-4 pt-6 backdrop-blur-md">
                  <div className="flex min-w-0 items-center gap-3">
                    <SkillIcon
                      className="size-10 shrink-0"
                      icon={skill.icon}
                      title={skill.title}
                    />
                    <DialogTitle className="min-w-0 truncate text-base font-bold leading-tight text-foreground">
                      {skill.title}
                    </DialogTitle>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      className="bg-neutral-950 text-white hover:bg-neutral-800"
                      disabled={!detail}
                      onClick={handlePreviewSkill}
                      size="sm"
                      type="button"
                    >
                      <HugeiconsIcon icon={ViewIcon} size={14} strokeWidth={1.8} />
                      预览技能
                    </Button>
                    <DialogClose asChild>
                      <Button
                        aria-label="关闭"
                        className="size-8 rounded-[8px] p-0"
                        size="icon"
                        type="button"
                        variant="secondary"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Cancel01Icon}
                          size={16}
                          strokeWidth={1.8}
                        />
                      </Button>
                    </DialogClose>
                  </div>
                </div>

                <div className="shrink-0 px-6 pb-5">
                  {(detail?.tip ?? skill.tip).trim() ? (
                    <div className="space-y-5">
                      <DialogDescription className="text-sm leading-6 text-muted-foreground">
                        {skill.description}
                      </DialogDescription>
                      <div
                        aria-label="示例问题"
                        className="ai-skill-template-tip"
                        role="region"
                      >
                        {(detail?.tip ?? skill.tip)
                          .split(/\n+/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line, index) => (
                            <div
                              className="ai-skill-template-tip__bubble"
                              key={`${index}-${line}`}
                            >
                              <span
                                aria-hidden="true"
                                className="ai-skill-template-tip__bubble-icon"
                              >
                                <HugeiconsIcon
                                  color="currentColor"
                                  icon={Message01Icon}
                                  size={14}
                                  strokeWidth={1.8}
                                />
                              </span>
                              <span className="ai-skill-template-tip__bubble-text">
                                {line}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <DialogDescription className="text-sm leading-6 text-muted-foreground">
                      {skill.description}
                    </DialogDescription>
                  )}
                </div>

                {detailLoading ? (
                  <div
                    className="flex min-h-48 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
                    role="status"
                  >
                    <Spinner size={16} />
                    <span>正在加载</span>
                  </div>
                ) : detailError ? (
                  <div className="flex min-h-48 flex-1 items-center justify-center text-sm text-destructive">
                    <span role="alert">加载失败</span>
                  </div>
                ) : detail ? (
                  <Tabs className="shrink-0 gap-0" defaultValue="scenario">
                    <div className="px-6">
                      <TabsList
                        aria-label="技能详情"
                        className="h-auto w-full justify-start gap-6"
                        variant="underline"
                      >
                        {detailTabs.map((tab) => (
                          <TabsTrigger
                            className="px-0 py-2.5 text-sm"
                            key={tab.value}
                            value={tab.value}
                            variant="underline"
                          >
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    <div className="px-6 py-5">
                      <TabsContent className="mt-0 space-y-0" value="scenario">
                        <p className="min-h-28 pb-5 text-sm leading-6 text-muted-foreground">
                          {detail.applicationScenario || "暂无数据"}
                        </p>
                        <SkillRecommendationSection
                          icon={AbsoluteIcon}
                          items={detail.recommendedVariables}
                          title="推荐变量"
                        />
                        <SkillRecommendationSection
                          icon={ApiIcon}
                          items={detail.recommendedTools}
                          title="推荐工具"
                        />
                        <SkillRecommendationSection
                          icon={AiBookIcon}
                          items={detail.recommendedKnowledgeBases}
                          title="推荐知识库"
                        />
                      </TabsContent>

                      <TabsContent className="mt-0 space-y-0" value="description">
                        <SkillContentView
                          className="min-h-28 pb-5"
                          content={detail.skillDescription}
                        />
                        <SkillRecommendationSection
                          icon={AbsoluteIcon}
                          items={detail.recommendedVariables}
                          title="推荐变量"
                        />
                      </TabsContent>
                    </div>
                  </Tabs>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {detail ? (
        <SkillPreviewEditResourcesDialog
          content={detail.skillDescription}
          editableResources={editableResources}
          onCancel={() => {
            setEditResourcesOpen(false);
          }}
          onConfirm={({ content, resources }) => {
            const existing = collectCompleteSkillResourcesFromContent(
              detail.skillDescription,
            );
            goToCreateSkill({
              name: detail.title,
              applyScene: detail.applicationScenario,
              content,
              resources: {
                variables: mergeSkillResourceItems(
                  existing.variables,
                  resources.variables,
                ),
                tools: mergeSkillResourceItems(existing.tools, resources.tools),
                "knowledge-bases": mergeSkillResourceItems(
                  existing["knowledge-bases"],
                  resources["knowledge-bases"],
                ),
              },
            });
          }}
          open={editResourcesOpen}
        />
      ) : null}
    </>
  );
}

function SkillRecommendationSection({
  icon,
  items,
  title,
}: {
  icon: typeof AbsoluteIcon;
  items: readonly SkillRecommendation[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label={title} className="space-y-4 py-5">
      <h3 className="border-b border-border pb-3 text-sm font-semibold text-foreground">
        {title}
      </h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li className="flex items-start gap-3" key={`${title}-${item.title}`}>
            <HugeiconsIcon
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-foreground"
              icon={icon}
              size={18}
              strokeWidth={1.8}
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              {item.description ? (
                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
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

function SkillIcon({
  className,
  icon,
  title,
}: {
  className?: string;
  icon?: string;
  title: string;
}) {
  if (icon) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn(
          "size-9 shrink-0 rounded-[8px] object-cover",
          className,
        )}
        src={icon}
        title={title}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground",
        className,
      )}
      title={title}
    >
      <HugeiconsIcon icon={ClipboardIcon} size={18} strokeWidth={1.8} />
    </span>
  );
}
