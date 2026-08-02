import { useEffect, useMemo, useState } from "react";
import {
  Add01Icon,
  AlertCircleIcon,
  AiBookIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ConnectIcon,
  Delete02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AI_HOSTING_AGENT_KB_MAX_COUNT,
  AI_HOSTING_AGENT_SKILL_MAX_COUNT,
  KB_SEARCH_QUERY_MAX_LENGTH,
  type AiHostingAgentResourceSummary,
} from "@chatai/contracts";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
import { listAgentSkills } from "../api/agent-skill-service";
import { listKbs, toKbListViewItem } from "../api/kb-service";
import type { KbListViewItem } from "../kb-types";
import { getAgentResourceInvalidReasonLabel } from "./agent-settings.constants";

const RESOURCE_PICKER_PAGE_SIZE = 10;
const RESOURCE_SEARCH_DEBOUNCE_MS = 300;
const emptyStateIllustrationUrl = "https://b5.bokr.com.cn/dist/ui/empty-state.svg";

export type AgentKnowledgeBaseResource = AiHostingAgentResourceSummary;

export type AgentSkillResource = AiHostingAgentResourceSummary;

type AgentResourceSectionId = "knowledge-bases" | "skills";

const resourceSections = [
  { icon: ConnectIcon, id: "skills", title: "技能" },
  { icon: AiBookIcon, id: "knowledge-bases", title: "知识库" },
] as const satisfies ReadonlyArray<{
  icon: typeof ConnectIcon;
  id: AgentResourceSectionId;
  title: string;
}>;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function AgentResourceManagementPanel({
  disabled,
  knowledgeBases,
  onAddKnowledgeBases,
  onAddSkills,
  onRemoveKnowledgeBase,
  onRemoveSkill,
  skills,
}: {
  disabled: boolean;
  knowledgeBases: readonly AgentKnowledgeBaseResource[];
  onAddKnowledgeBases: () => void;
  onAddSkills: () => void;
  onRemoveKnowledgeBase: (resource: AgentKnowledgeBaseResource) => void;
  onRemoveSkill: (resource: AgentSkillResource) => void;
  skills: readonly AgentSkillResource[];
}) {
  const invalidResourceCount = [...knowledgeBases, ...skills].filter(
    (resource) => resource.status === "invalid",
  ).length;
  const resourcesBySection = {
    skills,
    "knowledge-bases": knowledgeBases,
  } satisfies Record<AgentResourceSectionId, readonly { id: string; name: string }[]>;

  return (
    <section
      aria-labelledby="agent-resource-management-title"
      className="rounded-[12px] border border-border bg-card p-5 shadow-xs"
    >
      <h2
        className="mb-4 text-base font-semibold text-foreground"
        id="agent-resource-management-title"
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
          <span>
            保存前请移除失效资源
          </span>
        </div>
      ) : null}
      <div className="space-y-5">
        {resourceSections.map((section) => (
          <AgentResourceSection
            disabled={disabled}
            icon={section.icon}
            items={resourcesBySection[section.id]}
            key={section.id}
            onAdd={
              section.id === "skills" ? onAddSkills : onAddKnowledgeBases
            }
            onRemove={(item) => {
              if (section.id === "skills") {
                onRemoveSkill(item);
              } else {
                onRemoveKnowledgeBase(item);
              }
            }}
            title={section.title}
          />
        ))}
      </div>
    </section>
  );
}

function AgentResourceSection({
  disabled,
  icon,
  items,
  onAdd,
  onRemove,
  title,
}: {
  disabled: boolean;
  icon: typeof ConnectIcon;
  items: readonly AiHostingAgentResourceSummary[];
  onAdd: () => void;
  onRemove: (item: AiHostingAgentResourceSummary) => void;
  title: string;
}) {
  const [open, setOpen] = useState(true);
  const contentId = `agent-resource-section-${title}`;

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
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {title}
        </p>
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
            className="flex min-h-40 flex-col items-center justify-center px-2 py-6"
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
          <ul
            aria-label={`已添加${title}`}
            className="space-y-1.5 px-0.5 py-2"
          >
            {items.map((item) => (
              <li key={item.id}>
                <div
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
                            aria-label={`${item.name}已失效`}
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
                          {getAgentResourceInvalidReasonLabel(
                            item.invalidReason,
                            title === "技能" ? "技能" : "知识库",
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
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {item.name}
                  </span>
                  <Button
                    aria-label={`删除${item.name}`}
                    className={cn(
                      "absolute right-1 top-1/2 size-6 -translate-y-1/2 rounded-[6px] p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                      item.status === "invalid"
                        ? "bg-destructive/10"
                        : "bg-muted/90",
                    )}
                    disabled={disabled}
                    onClick={() => onRemove(item)}
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

export function AgentKnowledgeBasePickerDialog({
  onConfirm,
  onOpenChange,
  open,
  selected,
}: {
  onConfirm: (resources: AgentKnowledgeBaseResource[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selected: readonly AgentKnowledgeBaseResource[];
}) {
  const [items, setItems] = useState<KbListViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery.trim(),
    RESOURCE_SEARCH_DEBOUNCE_MS,
  );
  const [page, setPage] = useState(1);
  const [draftSelection, setDraftSelection] = useState<
    Map<string, AgentKnowledgeBaseResource>
  >(() => new Map());
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.id)),
    [selected],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchQuery("");
    setPage(1);
    setDraftSelection(new Map(selected.map((item) => [item.id, item])));
  }, [open, selected]);

  useEffect(() => {
    setPage(1);
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
          page,
          pageSize: RESOURCE_PICKER_PAGE_SIZE,
          query: debouncedSearchQuery || undefined,
        });

        if (cancelled) {
          return;
        }

        setItems(response.kbs.map(toKbListViewItem));
        setTotal(response.pagination.total);
      } catch {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setError(true);
          toast.error("知识库列表加载失败，请稍后重试");
        }
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
  }, [debouncedSearchQuery, open, page]);

  const pagination = resolveTablePagination({
    page,
    pageSize: RESOURCE_PICKER_PAGE_SIZE,
    total,
  });
  const selectionChanged = !setsEqual(
    new Set(draftSelection.keys()),
    selectedIds,
  );

  function handleCheckedChange(item: KbListViewItem, checked: boolean) {
    if (
      checked &&
      !draftSelection.has(item.id) &&
      draftSelection.size >= AI_HOSTING_AGENT_KB_MAX_COUNT
    ) {
      toast.error(`Agent 最多可添加${AI_HOSTING_AGENT_KB_MAX_COUNT}个知识库`);
      return;
    }

    setDraftSelection((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(item.id, {
          id: item.id,
          name: item.name,
          status: "available",
        });
      } else {
        next.delete(item.id);
      }
      return next;
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[1040px] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:rounded-[14px]">
        <ResourcePickerHeader
          manageHref="/chat/ai-hosting/kb"
          manageLabel="前往知识库管理"
          title="添加知识库"
        />
        <ResourcePickerSearch
          ariaLabel="搜索知识库"
          maxLength={KB_SEARCH_QUERY_MAX_LENGTH}
          onChange={setSearchQuery}
          placeholder="搜索知识库"
          value={searchQuery}
        />

        <div className="min-h-0 overflow-auto px-6">
          <Table aria-label="知识库选择列表" className="min-w-[920px] table-fixed">
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
              <ResourcePickerTableState
                colSpan={5}
                error={error}
                loading={loading}
                visible={loading || error || items.length === 0}
              />
              {!loading && !error
                ? items.map((item) => {
                    const checked = draftSelection.has(item.id);
                    const disabled =
                      !checked &&
                      draftSelection.size >= AI_HOSTING_AGENT_KB_MAX_COUNT;

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
                        <TableCell className="px-4 py-4 text-muted-foreground">
                          <TableCellContent>{item.lastUpdatedAt}</TableCellContent>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-muted-foreground">
                          <TableCellContent>{item.createdAt}</TableCellContent>
                        </TableCell>
                      </TableRow>
                    );
                  })
                : null}
            </TableBody>
          </Table>
        </div>

        <ResourcePickerPagination
          onPageChange={setPage}
          page={pagination.activePage}
          total={total}
          totalPages={pagination.totalPages}
        />
        <ResourcePickerFooter
          confirmDisabled={
            !selectionChanged ||
            draftSelection.size > AI_HOSTING_AGENT_KB_MAX_COUNT
          }
          maxCount={AI_HOSTING_AGENT_KB_MAX_COUNT}
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onConfirm([...draftSelection.values()])}
          selectedCount={draftSelection.size}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AgentSkillPickerDialog({
  onConfirm,
  onOpenChange,
  open,
  selected,
}: {
  onConfirm: (resources: AgentSkillResource[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selected: readonly AgentSkillResource[];
}) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof listAgentSkills>>["skills"]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery.trim(),
    RESOURCE_SEARCH_DEBOUNCE_MS,
  );
  const [page, setPage] = useState(1);
  const [draftSelection, setDraftSelection] = useState<
    Map<string, AgentSkillResource>
  >(() => new Map());
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.id)),
    [selected],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchQuery("");
    setPage(1);
    setDraftSelection(new Map(selected.map((item) => [item.id, item])));
  }, [open, selected]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadSkills() {
      setLoading(true);
      setError(false);

      try {
        const response = await listAgentSkills({
          page,
          pageSize: RESOURCE_PICKER_PAGE_SIZE,
          query: debouncedSearchQuery || undefined,
        });

        if (cancelled) {
          return;
        }

        setItems(response.skills);
        setTotal(response.pagination.total);
      } catch {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setError(true);
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
  }, [debouncedSearchQuery, open, page]);

  const pagination = resolveTablePagination({
    page,
    pageSize: RESOURCE_PICKER_PAGE_SIZE,
    total,
  });
  const selectionChanged = !setsEqual(
    new Set(draftSelection.keys()),
    selectedIds,
  );

  function handleCheckedChange(
    item: Awaited<ReturnType<typeof listAgentSkills>>["skills"][number],
    checked: boolean,
  ) {
    if (
      checked &&
      !draftSelection.has(item.id) &&
      draftSelection.size >= AI_HOSTING_AGENT_SKILL_MAX_COUNT
    ) {
      toast.error(`Agent 最多可添加${AI_HOSTING_AGENT_SKILL_MAX_COUNT}个技能`);
      return;
    }

    setDraftSelection((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(item.id, {
          id: item.id,
          name: item.name,
          status: "available",
        });
      } else {
        next.delete(item.id);
      }
      return next;
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[1040px] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:rounded-[14px]">
        <ResourcePickerHeader
          manageHref="/chat/ai-hosting/skills?tab=mine"
          manageLabel="前往技能管理"
          title="添加技能"
        />
        <ResourcePickerSearch
          ariaLabel="搜索技能"
          onChange={setSearchQuery}
          placeholder="搜索技能"
          value={searchQuery}
        />

        <div className="min-h-0 overflow-auto px-6">
          <Table aria-label="技能选择列表" className="min-w-[920px] table-fixed">
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[200px]" />
              <col />
              <col className="w-[100px]" />
              <col className="w-[165px]" />
              <col className="w-[165px]" />
            </colgroup>
            <TableHeader className="[&_tr]:border-border/70">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 px-4">
                  <span className="sr-only">选择</span>
                </TableHead>
                <TableHead className="h-11 px-4">技能名称</TableHead>
                <TableHead className="h-11 px-4">应用场景</TableHead>
                <TableHead className="h-11 whitespace-nowrap px-4">状态</TableHead>
                <TableHead className="h-11 whitespace-nowrap px-4">
                  更新时间
                </TableHead>
                <TableHead className="h-11 whitespace-nowrap px-4">
                  创建时间
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr]:border-border/70">
              <ResourcePickerTableState
                colSpan={6}
                error={error}
                loading={loading}
                visible={loading || error || items.length === 0}
              />
              {!loading && !error
                ? items.map((item) => {
                    const checked = draftSelection.has(item.id);
                    const disabled =
                      !checked &&
                      (item.status !== "enabled" ||
                        draftSelection.size >= AI_HOSTING_AGENT_SKILL_MAX_COUNT);

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
                          title={item.applyScene}
                        >
                          <p className="line-clamp-2 text-sm leading-6">
                            {item.applyScene || "-"}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <span
                            className={
                              item.status === "enabled"
                                ? "text-sm text-emerald-600"
                                : "text-sm text-muted-foreground"
                            }
                          >
                            {item.status === "enabled" ? "已启用" : "未启用"}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-muted-foreground">
                          <TableCellContent>{item.updatedAt}</TableCellContent>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-muted-foreground">
                          <TableCellContent>{item.createdAt}</TableCellContent>
                        </TableCell>
                      </TableRow>
                    );
                  })
                : null}
            </TableBody>
          </Table>
        </div>

        <ResourcePickerPagination
          onPageChange={setPage}
          page={pagination.activePage}
          total={total}
          totalPages={pagination.totalPages}
        />
        <ResourcePickerFooter
          confirmDisabled={
            !selectionChanged ||
            draftSelection.size > AI_HOSTING_AGENT_SKILL_MAX_COUNT
          }
          maxCount={AI_HOSTING_AGENT_SKILL_MAX_COUNT}
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onConfirm([...draftSelection.values()])}
          selectedCount={draftSelection.size}
        />
      </DialogContent>
    </Dialog>
  );
}

function ResourcePickerHeader({
  manageHref,
  manageLabel,
  title,
}: {
  manageHref: string;
  manageLabel: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-4 pt-6 pr-14">
      <DialogTitle className="text-lg font-semibold text-foreground">
        {title}
      </DialogTitle>
      <DialogDescription className="sr-only">
        从资源列表中选择要添加到 Agent 的资源
      </DialogDescription>
      <Button asChild className="h-8 gap-1 px-0 text-primary" variant="link">
        <Link to={manageHref}>
          {manageLabel}
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Link>
      </Button>
    </div>
  );
}

function ResourcePickerSearch({
  ariaLabel,
  maxLength,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
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
          aria-label={ariaLabel}
          className="h-10 rounded-[8px] pl-9"
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </div>
  );
}

function ResourcePickerTableState({
  colSpan,
  error,
  loading,
  visible,
}: {
  colSpan: number;
  error: boolean;
  loading: boolean;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <TableRow>
      <TableCell
        className={
          error
            ? "h-52 text-center text-sm text-destructive"
            : "h-52 text-center text-sm text-muted-foreground"
        }
        colSpan={colSpan}
      >
        {loading ? (
          <div
            className="flex items-center justify-center gap-2"
            role="status"
          >
            <Spinner />
            <span>正在加载</span>
          </div>
        ) : error ? (
          <span role="alert">加载失败</span>
        ) : (
          "暂无数据"
        )}
      </TableCell>
    </TableRow>
  );
}

function ResourcePickerPagination({
  onPageChange,
  page,
  total,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}) {
  return (
    <div className="px-6">
      <TablePagination
        className="border-t-0 py-4"
        onPageChange={onPageChange}
        page={page}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
}

function ResourcePickerFooter({
  confirmDisabled,
  maxCount,
  onCancel,
  onConfirm,
  selectedCount,
}: {
  confirmDisabled: boolean;
  maxCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  selectedCount: number;
}) {
  return (
    <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
      <span className="text-sm text-muted-foreground">
        已选择 {selectedCount}/{maxCount}
      </span>
      <div className="flex items-center gap-3">
        <Button onClick={onCancel} type="button" variant="outline">
          取消
        </Button>
        <Button disabled={confirmDisabled} onClick={onConfirm} type="button">
          确认
        </Button>
      </div>
    </DialogFooter>
  );
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}
