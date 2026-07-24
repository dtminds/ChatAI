import { useMemo, useState } from "react";
import {
  Add01Icon,
  AiBookIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  BracketsIcon,
  ClipboardIcon,
  FilterIcon,
  Message01Icon,
  Search01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

type SkillAccent = "amber" | "slate";

type SkillRecommendation = {
  description: string;
  title: string;
};

type SkillItem = {
  accent?: SkillAccent;
  applicationScenario: string;
  description: string;
  exampleQuestion: string;
  id: string;
  recommendedKnowledgeBases: readonly SkillRecommendation[];
  recommendedTools: readonly SkillRecommendation[];
  recommendedVariables: readonly SkillRecommendation[];
  skillDescription: string;
  title: string;
};

type SkillCategory = {
  defaultOpen?: boolean;
  id: string;
  skills: SkillItem[];
  title: string;
};

const defaultBeautyRecommendations = {
  recommendedKnowledgeBases: [
    {
      description: "这是描述",
      title: "美妆护肤",
    },
  ],
  recommendedTools: [
    {
      description: "根据客户聊天消息中给到的订单号查询订单信息",
      title: "订单查询",
    },
  ],
  recommendedVariables: [
    {
      description: "建议选择包含客户肤质等信息的标签分组",
      title: "客户标签查询",
    },
  ],
} as const;

const marketplaceCategories: SkillCategory[] = [
  {
    defaultOpen: true,
    id: "private-domain-general",
    title: "私域通用技能",
    skills: [
      {
        accent: "amber",
        applicationScenario:
          "当客户询问订单是否发货、物流进度或希望客服帮忙核对订单信息时使用",
        description: "客户的订单信息查询技能，可在特定场景下自动查询并回复",
        exampleQuestion: "这个订单发货了吗？",
        id: "order-query",
        recommendedKnowledgeBases: [
          {
            description: "订单与售后相关知识",
            title: "订单履约",
          },
        ],
        recommendedTools: [
          {
            description: "根据客户聊天消息中给到的订单号查询订单信息",
            title: "订单查询",
          },
        ],
        recommendedVariables: [
          {
            description: "建议选择包含客户订单相关信息的标签分组",
            title: "客户标签查询",
          },
        ],
        skillDescription:
          "根据客户提供的订单号或上下文，查询并回复订单状态，避免夸大与不确定承诺",
        title: "订单信息查询",
      },
      {
        applicationScenario:
          "当客户询问快递到哪了、预计送达时间或物流异常时使用",
        description: "客户的物流信息查询技能，可在特定场景下自动查询并回复",
        exampleQuestion: "快递到哪了？",
        id: "logistics-query",
        recommendedKnowledgeBases: [
          {
            description: "物流与配送相关知识",
            title: "物流配送",
          },
        ],
        recommendedTools: [
          {
            description: "根据运单号查询物流轨迹",
            title: "物流查询",
          },
        ],
        recommendedVariables: [
          {
            description: "建议选择包含收货地址等信息的标签分组",
            title: "客户标签查询",
          },
        ],
        skillDescription: "根据订单或运单信息查询物流进度，并用客服话术清晰回复",
        title: "物流信息查询",
      },
      {
        applicationScenario:
          "当客户询问订单是否发货、物流进度或希望客服帮忙核对订单信息时使用",
        description: "客户的订单信息查询技能，可在特定场景下自动查询并回复",
        exampleQuestion: "这个订单发货了吗？",
        id: "order-query-2",
        recommendedKnowledgeBases: [
          {
            description: "订单与售后相关知识",
            title: "订单履约",
          },
        ],
        recommendedTools: [
          {
            description: "根据客户聊天消息中给到的订单号查询订单信息",
            title: "订单查询",
          },
        ],
        recommendedVariables: [
          {
            description: "建议选择包含客户订单相关信息的标签分组",
            title: "客户标签查询",
          },
        ],
        skillDescription:
          "根据客户提供的订单号或上下文，查询并回复订单状态，避免夸大与不确定承诺",
        title: "订单信息查询",
      },
      {
        applicationScenario:
          "当客户询问订单是否发货、物流进度或希望客服帮忙核对订单信息时使用",
        description: "客户的订单信息查询技能，可在特定场景下自动查询并回复",
        exampleQuestion: "这个订单发货了吗？",
        id: "order-query-3",
        recommendedKnowledgeBases: [
          {
            description: "订单与售后相关知识",
            title: "订单履约",
          },
        ],
        recommendedTools: [
          {
            description: "根据客户聊天消息中给到的订单号查询订单信息",
            title: "订单查询",
          },
        ],
        recommendedVariables: [
          {
            description: "建议选择包含客户订单相关信息的标签分组",
            title: "客户标签查询",
          },
        ],
        skillDescription:
          "根据客户提供的订单号或上下文，查询并回复订单状态，避免夸大与不确定承诺",
        title: "订单信息查询",
      },
    ],
  },
  {
    defaultOpen: true,
    id: "beauty-industry",
    title: "「美妆个护」行业严选技能",
    skills: [
      {
        applicationScenario:
          "当客户咨询某款商品是否适合自己的肤质、皮肤状态、护肤诉求，或希望客服根据油皮、干皮、敏感肌、痘肌、混油皮等条件推荐商品时使用",
        description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
        exampleQuestion: "这个烟酰胺有什么作用？敏感肌能用吗？",
        id: "ingredient-explain",
        ...defaultBeautyRecommendations,
        skillDescription:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达",
        title: "成分功效解读",
      },
      {
        applicationScenario:
          "当客户咨询某款商品是否适合自己的肤质、皮肤状态、护肤诉求，或希望客服根据油皮、干皮、敏感肌、痘肌、混油皮等条件推荐商品时使用",
        description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
        exampleQuestion: "这个烟酰胺有什么作用？敏感肌能用吗？",
        id: "skincare-steps",
        ...defaultBeautyRecommendations,
        skillDescription:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达",
        title: "护肤步骤指导",
      },
      {
        applicationScenario:
          "当客户咨询某款商品是否适合自己的肤质、皮肤状态、护肤诉求，或希望客服根据油皮、干皮、敏感肌、痘肌、混油皮等条件推荐商品时使用",
        description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
        exampleQuestion: "这个烟酰胺有什么作用？敏感肌能用吗？",
        id: "sensitive-skin-guard",
        ...defaultBeautyRecommendations,
        skillDescription:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达",
        title: "敏感肌风险兜底",
      },
      {
        applicationScenario:
          "当客户咨询某款商品是否适合自己的肤质、皮肤状态、护肤诉求，或希望客服根据油皮、干皮、敏感肌、痘肌、混油皮等条件推荐商品时使用",
        description:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达",
        exampleQuestion: "这个烟酰胺有什么作用？敏感肌能用吗？",
        id: "skin-type-recommend",
        ...defaultBeautyRecommendations,
        skillDescription:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达。\n\n回复时先确认客户的肤质与诉求，再给出可执行的护肤建议；不确定的成分功效不要绝对化表述，也不要给出医疗诊断或疗效保证。\n\n若客户提到敏感、红肿、破皮等异常情况，优先建议停用并寻求专业医疗意见，同时可推荐更温和的基础护理方向。",
        title: "肤质适配推荐",
      },
      {
        applicationScenario:
          "当客户咨询某款商品是否适合自己的肤质、皮肤状态、护肤诉求，或希望客服根据油皮、干皮、敏感肌、痘肌、混油皮等条件推荐商品时使用",
        description: "针对客户咨询的成分、功效、适用场景进行解读与说明",
        exampleQuestion: "这个烟酰胺有什么作用？敏感肌能用吗？",
        id: "product-compare",
        ...defaultBeautyRecommendations,
        skillDescription:
          "针对客户咨询的成分、功效、适用场景进行客服化解释，避免夸大和医疗化表达",
        title: "美妆商品对比推荐",
      },
    ],
  },
];

const skillTabs = [
  { label: "技能广场", value: "marketplace" },
  { label: "我的技能", value: "mine" },
] as const;

const detailTabs = [
  { label: "技能应用场景", value: "scenario" },
  { label: "技能描述", value: "description" },
] as const;

type MySkillStatus = "enabled" | "disabled";

type MySkillItem = {
  applicationScenario: string;
  createdAt: string;
  id: string;
  name: string;
  status: MySkillStatus;
  updatedAt: string;
};

const MY_SKILLS_PAGE_SIZE = 10;

const initialMySkills: MySkillItem[] = [
  {
    applicationScenario:
      "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况",
    createdAt: "2026-06-18 23:22:22",
    id: "my-skill-1",
    name: "订单与物流场景查询",
    status: "enabled",
    updatedAt: "2026-06-20 23:22:22",
  },
  {
    applicationScenario:
      "处理用户的退货、换货、维修等售后申请，判断是否符合售后条件并引导处理流程",
    createdAt: "2026-06-17 23:22:22",
    id: "my-skill-2",
    name: "退换货",
    status: "disabled",
    updatedAt: "2026-06-19 23:22:22",
  },
  ...Array.from({ length: 20 }, (_, index) => {
    const number = index + 3;
    const enabled = number % 2 === 1;

    return {
      applicationScenario: enabled
        ? "根据订单号或手机号查询订单状态和物流进度，处理物流异常情况"
        : "处理用户的退货、换货、维修等售后申请，判断是否符合售后条件并引导处理流程",
      createdAt: `2026-06-${String(Math.max(1, 16 - (index % 10))).padStart(2, "0")} 23:22:22`,
      id: `my-skill-${number}`,
      name: enabled ? `订单与物流场景查询 ${number}` : `退换货 ${number}`,
      status: (enabled ? "enabled" : "disabled") as MySkillStatus,
      updatedAt: `2026-06-${String(Math.max(1, 20 - (index % 10))).padStart(2, "0")} 23:22:22`,
    };
  }),
];

export function AiSkillsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const activeTab =
    searchParams.get("tab") === "mine" ? "mine" : "marketplace";

  return (
    <AiHostingLayout title="AI技能">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="为Agent提供场景化的技能，定义在什么情况下执行什么样的任务或操作"
          title="AI技能"
        />

        <Tabs
          className="gap-6"
          onValueChange={(value) => {
            setSearchParams(
              value === "mine" ? { tab: "mine" } : {},
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
            {marketplaceCategories.map((category) => (
              <SkillCategorySection
                category={category}
                key={category.id}
                onSelectSkill={setSelectedSkill}
              />
            ))}
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

function MySkillsPanel() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState(initialMySkills);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [enableTargetId, setEnableTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    if (!keyword) {
      return skills;
    }

    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(keyword) ||
        skill.applicationScenario.toLowerCase().includes(keyword),
    );
  }, [searchQuery, skills]);

  const { activePage, totalPages } = resolveTablePagination({
    page,
    pageSize: MY_SKILLS_PAGE_SIZE,
    total: filteredSkills.length,
  });
  const pagedSkills = filteredSkills.slice(
    (activePage - 1) * MY_SKILLS_PAGE_SIZE,
    activePage * MY_SKILLS_PAGE_SIZE,
  );

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  function handleDisable(skillId: string) {
    setSkills((current) =>
      current.map((skill) =>
        skill.id === skillId
          ? {
              ...skill,
              status: "disabled",
            }
          : skill,
      ),
    );
  }

  function handleConfirmEnable() {
    if (!enableTargetId) {
      return;
    }

    setSkills((current) =>
      current.map((skill) =>
        skill.id === enableTargetId
          ? {
              ...skill,
              status: "enabled",
            }
          : skill,
      ),
    );
    setEnableTargetId(null);
  }

  function handleConfirmDelete() {
    if (!deleteTargetId) {
      return;
    }

    setSkills((current) => current.filter((skill) => skill.id !== deleteTargetId));
    setDeleteTargetId(null);
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

        <Button
          className="h-10 px-4"
          onClick={() => navigate("/chat/ai-hosting/skills/new")}
          type="button"
        >
          <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
          <span>添加技能</span>
        </Button>
      </div>

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
              <TableHead className="h-11 whitespace-nowrap px-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedSkills.length > 0 ? (
              pagedSkills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell className="px-4 py-4 font-medium text-foreground">
                    <TableCellContent>{skill.name}</TableCellContent>
                  </TableCell>
                  <TableCell
                    className="px-4 py-4 text-muted-foreground"
                    title={skill.applicationScenario}
                  >
                    <p className="line-clamp-2 text-sm leading-6">
                      {skill.applicationScenario}
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
                  <TableCell className="whitespace-nowrap px-4 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-3">
                      <Button
                        className="h-auto p-0 text-primary"
                        type="button"
                        variant="link"
                      >
                        编辑
                      </Button>
                      {skill.status === "enabled" ? (
                        <Button
                          className="h-auto p-0 text-primary"
                          onClick={() => handleDisable(skill.id)}
                          type="button"
                          variant="link"
                        >
                          停用
                        </Button>
                      ) : (
                        <Button
                          className="h-auto p-0 text-primary"
                          onClick={() => setEnableTargetId(skill.id)}
                          type="button"
                          variant="link"
                        >
                          启用
                        </Button>
                      )}
                      <Button
                        className="h-auto p-0 text-primary"
                        onClick={() => setDeleteTargetId(skill.id)}
                        type="button"
                        variant="link"
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
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
          total={filteredSkills.length}
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
              onClick={(event) => {
                event.preventDefault();
                handleConfirmEnable();
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
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
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

function SkillCategorySection({
  category,
  onSelectSkill,
}: {
  category: SkillCategory;
  onSelectSkill: (skill: SkillItem) => void;
}) {
  const [open, setOpen] = useState(category.defaultOpen ?? true);
  const sectionId = `ai-skill-category-${category.id}`;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <section aria-labelledby={`${sectionId}-title`} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2
            className="text-base font-semibold text-foreground"
            id={`${sectionId}-title`}
          >
            {category.title}
          </h2>
          <CollapsibleTrigger asChild>
            <Button
              aria-controls={sectionId}
              aria-expanded={open}
              className="h-8 gap-1 px-2 text-sm text-primary"
              type="button"
              variant="ghost"
            >
              {open ? "收起" : "展开"}
              <HugeiconsIcon
                icon={open ? ArrowUp01Icon : ArrowDown01Icon}
                size={14}
                strokeWidth={1.8}
              />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent id={sectionId}>
          <ul
            aria-label={category.title}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {category.skills.map((skill) => (
              <li key={skill.id}>
                <SkillCard onSelect={onSelectSkill} skill={skill} />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
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
      className="flex h-full w-full flex-col rounded-[14px] border border-border/80 bg-card p-4 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-4 focus-visible:ring-ring/20"
      onClick={() => onSelect(skill)}
      type="button"
    >
      <div className="flex min-w-0 items-start gap-3">
        <SkillIcon accent={skill.accent} title={skill.title} />
        <div className="min-w-0 space-y-1.5">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {skill.title}
          </h3>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {skill.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 border-t border-border/70 pt-3">
        <HugeiconsIcon
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-muted-foreground"
          icon={Message01Icon}
          size={14}
          strokeWidth={1.8}
        />
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
          {skill.exampleQuestion}
        </p>
      </div>
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
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex h-[min(40.5rem,calc(100vh-3rem))] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[12px]"
        closeButtonClassName="right-5 top-5"
      >
        {skill ? (
          <>
            <div className="shrink-0 space-y-3 px-6 pb-5 pt-6 pr-14">
              <SkillIcon accent={skill.accent} className="size-10" title={skill.title} />
              <div className="min-w-0 space-y-2">
                <DialogTitle className="text-[22px] font-semibold leading-tight text-foreground">
                  {skill.title}
                </DialogTitle>
                <DialogDescription className="text-sm leading-6 text-muted-foreground">
                  {skill.description}
                </DialogDescription>
              </div>
            </div>

            <Tabs className="flex min-h-0 flex-1 flex-col gap-0" defaultValue="scenario">
              <div className="shrink-0 px-6">
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

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <TabsContent className="mt-0 space-y-0" value="scenario">
                  <p className="pb-5 text-sm leading-6 text-muted-foreground">
                    {skill.applicationScenario}
                  </p>
                  <SkillRecommendationSection
                    icon={BracketsIcon}
                    items={skill.recommendedVariables}
                    title="推荐变量"
                  />
                  <SkillRecommendationSection
                    icon={FilterIcon}
                    items={skill.recommendedTools}
                    title="推荐工具"
                  />
                  <SkillRecommendationSection
                    icon={AiBookIcon}
                    items={skill.recommendedKnowledgeBases}
                    title="推荐知识库"
                  />
                </TabsContent>

                <TabsContent className="mt-0 space-y-0" value="description">
                  <p className="whitespace-pre-wrap pb-5 text-sm leading-6 text-muted-foreground">
                    {skill.skillDescription}
                  </p>
                  <SkillRecommendationSection
                    icon={BracketsIcon}
                    items={skill.recommendedVariables}
                    title="推荐变量"
                  />
                </TabsContent>
              </div>
            </Tabs>

            <div className="shrink-0 px-6 pb-6 pt-2">
              <Button
                className="h-11 w-full rounded-full border-primary/70 text-primary hover:bg-primary/5 hover:text-primary"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={1.8} />
                预览技能
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SkillRecommendationSection({
  icon,
  items,
  title,
}: {
  icon: typeof BracketsIcon;
  items: readonly SkillRecommendation[];
  title: string;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-3 border-t border-border py-5"
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li className="flex items-start gap-3" key={`${title}-${item.title}`}>
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
              <HugeiconsIcon aria-hidden="true" icon={icon} size={16} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {item.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkillIcon({
  accent = "slate",
  className,
  title,
}: {
  accent?: SkillAccent;
  className?: string;
  title: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[8px]",
        accent === "amber"
          ? "bg-amber-50 text-amber-500"
          : "bg-muted text-muted-foreground",
        className,
      )}
      title={title}
    >
      <HugeiconsIcon icon={ClipboardIcon} size={18} strokeWidth={1.8} />
    </span>
  );
}
