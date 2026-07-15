import { useEffect, useState } from "react";
import {
  AiIdeaIcon,
  AiMagicIcon,
  Add01Icon,
  ArrowLeft01Icon,
  InboxDownloadIcon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { AiHostingLayout } from "./ai-hosting-layout";
import {
  listKbDocs,
  listKbs,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocViewItem, KbListViewItem } from "./kb-types";

type SuggestionStatus = "pending" | "adopted" | "ignored" | "filtered";
type IngestMode = "batch" | "single";
const ADD_KNOWLEDGE_OPTION_VALUE = "__add_knowledge__";

const suggestionTabs: Array<{ label: string; value: SuggestionStatus }> = [
  { label: "待处理", value: "pending" },
  { label: "已入库", value: "adopted" },
  { label: "已忽略", value: "ignored" },
  { label: "智能过滤", value: "filtered" },
];

const mockSuggestions = [
  {
    answer:
      "您好，这款商品是否有货需要以当前小程序或商品链接页面显示为准。如果页面可正常下单，一般表示当前有库存；如果显示售罄或无法购买，说明暂时无货",
    id: "suggestion-1",
    rationale: "这是一段理由说明这是一段理由说明这是一段理由说明这是一段理由说明",
    title: "这个商品现在还有货吗？",
  },
  {
    answer:
      "您好，这款商品是否有货需要以当前小程序或商品链接页面显示为准。如果页面可正常下单，一般表示当前有库存；如果显示售罄或无法购买，说明暂时无货",
    id: "suggestion-2",
    rationale: "这是一段理由说明这是一段理由说明这是一段理由说明这是一段理由说明",
    title: "这个商品现在还有货吗？",
  },
] as const;
export function AgentOptimizationSuggestionsPage() {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const [activeStatus, setActiveStatus] = useState<SuggestionStatus>("pending");
  const [batchMode, setBatchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [ingestMode, setIngestMode] = useState<IngestMode | null>(null);
  const [ignoreConfirmationOpen, setIgnoreConfirmationOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KbListViewItem[]>([]);
  const [knowledgeBasesLoading, setKnowledgeBasesLoading] = useState(true);
  const [knowledgeItems, setKnowledgeItems] = useState<KbDocViewItem[]>([]);
  const [knowledgeItemsLoading, setKnowledgeItemsLoading] = useState(false);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: 10,
    total: 24,
  });
  const canBatchOperate = activeStatus !== "adopted";
  const canSelect = canBatchOperate && batchMode;

  function toggleSuggestion(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((itemId) => itemId !== id),
    );
  }

  function openIngestDialog(mode: IngestMode) {
    setIngestMode(mode);
    setSelectedKnowledgeBaseId("");
    setSelectedKnowledgeId("");
  }

  const selectedKnowledgeBase = knowledgeBases.find(
    (knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeBases() {
      setKnowledgeBasesLoading(true);

      try {
        const response = await listKbs({ page: 1, pageSize: 100 });

        if (!cancelled) {
          setKnowledgeBases(response.kbs.map(toKbListViewItem));
        }
      } catch {
        if (!cancelled) {
          setKnowledgeBases([]);
        }
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
  }, []);

  useEffect(() => {
    if (!ingestMode || !selectedKnowledgeBaseId) {
      setKnowledgeItems([]);
      return;
    }

    let cancelled = false;

    async function loadKnowledgeItems() {
      setKnowledgeItemsLoading(true);

      try {
        const response = await listKbDocs(selectedKnowledgeBaseId, {
          page: 1,
          pageSize: 100,
        });

        if (!cancelled) {
          setKnowledgeItems(response.docs.map(toKbDocViewItem));
        }
      } catch {
        if (!cancelled) {
          setKnowledgeItems([]);
        }
      } finally {
        if (!cancelled) {
          setKnowledgeItemsLoading(false);
        }
      }
    }

    void loadKnowledgeItems();

    return () => {
      cancelled = true;
    };
  }, [ingestMode, selectedKnowledgeBaseId]);

  return (
    <AiHostingLayout title="AI 优化建议">
      <div className="space-y-6">
        <div className="space-y-3">
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
            to={`/chat/ai-hosting/agents/${agentId ?? ""}`}
          >
            <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
            返回 Agent 管理
          </Link>
          <h1 className="text-[22px] font-semibold leading-tight text-foreground">AI 优化建议</h1>
        </div>

        <section aria-label="优化建议列表" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-[10px] bg-muted p-1">
              {suggestionTabs.map((tab) => (
                <Button
                  className={cn(
                    "h-8 rounded-[8px] px-3 text-sm font-normal",
                    activeStatus === tab.value
                      ? "bg-background text-foreground shadow-sm hover:bg-background"
                      : "text-muted-foreground",
                  )}
                  key={tab.value}
                  onClick={() => {
                    setActiveStatus(tab.value);
                    setBatchMode(false);
                    setSelectedIds([]);
                    setCurrentPage(1);
                  }}
                  type="button"
                  variant="ghost"
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {batchMode ? (
              <div className="flex items-center gap-3">
                <Button
                  disabled={selectedIds.length === 0}
                  onClick={() => openIngestDialog("batch")}
                  type="button"
                  variant="outline"
                >
                  批量入库
                </Button>
                {activeStatus === "pending" ? (
                  <Button
                    disabled={selectedIds.length === 0}
                    onClick={() => setIgnoreConfirmationOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    批量忽略
                  </Button>
                ) : null}
                <Button
                  className="h-auto p-0 text-primary"
                  onClick={() => {
                    setBatchMode(false);
                    setSelectedIds([]);
                  }}
                  type="button"
                  variant="link"
                >
                  退出操作
                </Button>
              </div>
            ) : canBatchOperate ? (
              <Button
                className="h-auto p-0 text-primary"
                onClick={() => setBatchMode(true)}
                type="button"
                variant="link"
              >
                批量操作
              </Button>
            ) : null}
          </div>

          {activeStatus === "filtered" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-[8px] bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                <HugeiconsIcon aria-hidden="true" className="text-primary" icon={AiMagicIcon} size={16} strokeWidth={1.8} />
                Agent在使用过程中会自主学习并提炼出有价值的知识，再经过AI评判功能，智能过滤掉重复或冲突的知识
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {mockSuggestions.map((suggestion) => (
                  <SuggestionCard
                    checked={selectedIds.includes(suggestion.id)}
                    key={suggestion.id}
                    onAdopt={() => openIngestDialog("single")}
                    onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked)}
                    onIgnore={() => setIgnoreConfirmationOpen(true)}
                    selectable={canSelect}
                    status={activeStatus}
                    suggestion={suggestion}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {mockSuggestions.map((suggestion) => (
                <SuggestionCard
                  checked={selectedIds.includes(suggestion.id)}
                  key={suggestion.id}
                  onAdopt={() => openIngestDialog("single")}
                  onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked)}
                  onIgnore={() => setIgnoreConfirmationOpen(true)}
                  selectable={canSelect}
                  status={activeStatus}
                  suggestion={suggestion}
                />
              ))}
            </div>
          )}
        </section>

        <TablePagination
          className="border-t-0"
          onPageChange={setCurrentPage}
          page={activePage}
          total={24}
          totalPages={totalPages}
        />
      </div>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setIgnoreConfirmationOpen(false);
          }
        }}
        open={ignoreConfirmationOpen}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认忽略?</AlertDialogTitle>
            <AlertDialogDescription>
              已忽略的，后续也可前往已忽略列表中重新入库
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => setIgnoreConfirmationOpen(false)}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setIngestMode(null);
          }
        }}
        open={ingestMode != null}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>入库</DialogTitle>
            <DialogDescription className="sr-only">
              选择知识库和知识后确认入库
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="optimization-kb-select">
                选择知识库 <span className="text-destructive">*</span>
              </Label>
              <Select
                disabled={knowledgeBasesLoading}
                onValueChange={(value) => {
                  setSelectedKnowledgeBaseId(value);
                  setSelectedKnowledgeId("");
                }}
                value={selectedKnowledgeBaseId}
              >
                <SelectTrigger className="w-full" id="optimization-kb-select">
                  <SelectValue
                    placeholder={knowledgeBasesLoading ? "正在加载" : "请选择将保存至哪个知识库"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((knowledgeBase) => (
                    <SelectItem key={knowledgeBase.id} value={knowledgeBase.id}>
                      {knowledgeBase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="optimization-knowledge-select">
                选择知识 <span className="text-destructive">*</span>
              </Label>
              <Select
                disabled={!selectedKnowledgeBase || knowledgeItemsLoading}
                onValueChange={(value) => {
                  if (value === ADD_KNOWLEDGE_OPTION_VALUE && selectedKnowledgeBase) {
                    setIngestMode(null);
                    navigate(`/chat/ai-hosting/kb/${selectedKnowledgeBase.id}?addKnowledge=qa:new`);
                    return;
                  }

                  setSelectedKnowledgeId(value);
                }}
                value={selectedKnowledgeId}
              >
                <SelectTrigger className="w-full" id="optimization-knowledge-select">
                  <SelectValue
                    placeholder={
                      knowledgeItemsLoading ? "正在加载" : "请选择将保存至哪个知识"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    className="h-9 pl-3 text-primary focus:bg-primary/5 focus:text-primary"
                    value={ADD_KNOWLEDGE_OPTION_VALUE}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <HugeiconsIcon aria-hidden="true" icon={Add01Icon} size={14} strokeWidth={1.8} />
                      <span>添加知识</span>
                    </span>
                  </SelectItem>
                  <SelectSeparator />
                  {knowledgeItems.map((knowledge) => (
                    <SelectItem key={knowledge.id} value={knowledge.id}>
                      {knowledge.nameWithExtension}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ingestMode === "single" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="optimization-question">
                    问题 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="optimization-question"
                    readOnly
                    value={mockSuggestions[0].title}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="optimization-answer">
                    答案 <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    className="min-h-24 resize-none"
                    id="optimization-answer"
                    readOnly
                    value={mockSuggestions[0].answer}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setIngestMode(null)} type="button" variant="outline">
              取消
            </Button>
            <Button
              disabled={!selectedKnowledgeBaseId || !selectedKnowledgeId}
              onClick={() => setIngestMode(null)}
              type="button"
            >
              确认入库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AiHostingLayout>
  );
}

function SuggestionCard({
  checked = false,
  onAdopt,
  onCheckedChange,
  onIgnore,
  selectable = false,
  status,
  suggestion,
}: {
  checked?: boolean;
  onAdopt?: () => void;
  onCheckedChange?: (checked: boolean) => void;
  onIgnore?: () => void;
  selectable?: boolean;
  status?: SuggestionStatus;
  suggestion: (typeof mockSuggestions)[number];
}) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-warning-muted text-warning">
            <HugeiconsIcon aria-hidden="true" icon={AiIdeaIcon} size={13} strokeWidth={1.8} />
          </span>
          <h2 className="truncate text-sm font-medium text-foreground">{suggestion.title}</h2>
        </div>
        {selectable ? (
          <Checkbox
            aria-label={`选择建议：${suggestion.title}`}
            checked={checked}
            onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
          />
        ) : status === "pending" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="h-7 rounded-[6px] px-2 text-xs"
              onClick={onAdopt}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={InboxDownloadIcon} size={14} strokeWidth={1.8} />
              入库
            </Button>
            <Button
              className="h-7 rounded-[6px] px-2 text-xs"
              onClick={onIgnore}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={UnavailableIcon} size={14} strokeWidth={1.8} />
              忽略
            </Button>
          </div>
        ) : status === "ignored" || status === "filtered" ? (
          <Button
            className="h-7 shrink-0 rounded-[6px] px-2 text-xs"
            onClick={onAdopt}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon aria-hidden="true" icon={InboxDownloadIcon} size={14} strokeWidth={1.8} />
            入库
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground">{suggestion.answer}</p>
      <div className="mt-3 rounded-[8px] bg-success-muted/55 px-3 py-2">
        <p className="text-xs text-success">
          {status === "filtered" ? "AI过滤理由" : "入库理由"}
        </p>
        <p className="mt-1 line-clamp-1 text-sm text-foreground">{suggestion.rationale}</p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-4 rounded-full bg-success-muted" />
          <span className="size-4 rounded-full bg-warning-muted" />
        </span>
        <time>2026-07-09 12:09:00</time>
      </div>
    </article>
  );
}
